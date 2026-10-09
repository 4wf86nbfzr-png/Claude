"""Der Gespraechsfuehrer: Kontext, Werkzeugaufrufe, Bestaetigungen, Ausfaelle.

Das Modell wird durch ``EchoProvider`` mit vorgegebenen Antworten ersetzt --
so wird genau der Ablauf geprueft, nicht die Formulierkunst eines Modells.
"""

from __future__ import annotations

import asyncio

from jarvis.ai.cloud import EchoProvider
from jarvis.ai.provider import ModelReply, ToolInvocation
from jarvis.errors import ModelUnavailable


def scripted(services, *replies: ModelReply) -> EchoProvider:
    provider = EchoProvider(scripted=list(replies))
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None
    return provider


def run(coroutine):
    return asyncio.run(coroutine)


def test_werkzeugaufruf_wird_ausgefuehrt_und_antwort_beruht_darauf(services):
    provider = scripted(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Alex anrufen", "prioritaet": "hoch"}
        )]),
        ModelReply(text="Ist notiert, Aufgabe #1 steht oben auf der Liste."),
    )
    agent = services.build_agent()
    antwort = run(agent.handle("42", "Ich muss dringend Alex anrufen"))

    assert "Aufgabe #1" in antwort.text
    assert antwort.tool_names == ["aufgabe_anlegen"]
    aufgaben = services.tasks.list()
    assert len(aufgaben) == 1
    assert aufgaben[0].title == "Alex anrufen"
    assert aufgaben[0].priority == 1
    # Das Werkzeugergebnis muss dem Modell vorgelegen haben.
    letzte_runde = provider.calls[-1]
    assert any(m.role == "tool" and "Aufgabe #1" in m.content for m in letzte_runde)


def test_ohne_werkzeug_nur_gespraech(services):
    scripted(services, ModelReply(text="Moin. Alles ruhig hier."))
    antwort = run(services.build_agent().handle("42", "Moin, wie laeuft es?"))
    assert antwort.text.startswith("Moin")
    assert antwort.tool_names == []
    assert services.tasks.list() == []


def test_kontext_enthaelt_verlauf_und_wichtiges_gedaechtnis(services):
    services.memory.remember(
        "Telefonzeit", "Telefoniert lieber vormittags", kind="vorliebe", importance=5
    )
    services.memory.add_message("42", "user", "Wir hatten ueber die Personalplanung gesprochen")
    services.memory.add_message("42", "assistant", "Ja, Alex wollte sich melden")
    provider = scripted(services, ModelReply(text="Klar."))

    run(services.build_agent().handle("42", "Und weiter?"))
    nachrichten = provider.calls[0]
    system = nachrichten[0].content
    assert "Telefoniert lieber vormittags" in system
    verlauf = [m.content for m in nachrichten if m.role in {"user", "assistant"}]
    assert "Wir hatten ueber die Personalplanung gesprochen" in verlauf
    assert verlauf[-1] == "Und weiter?"
    # Die gerade gespeicherte Nachricht darf nicht doppelt auftauchen.
    assert verlauf.count("Und weiter?") == 1


def test_mehrere_werkzeugrunden(services):
    scripted(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Angebot schreiben"})]),
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgaben_liste", arguments={})]),
        ModelReply(text="Eine offene Aufgabe: Angebot schreiben."),
    )
    antwort = run(services.build_agent().handle("42", "Leg das an und zeig mir die Liste"))
    assert antwort.tool_names == ["aufgabe_anlegen", "aufgaben_liste"]
    assert "Angebot schreiben" in antwort.text


def test_bestaetigungspflichtige_aktion_haelt_an(services):
    aufgabe = services.tasks.create("Zu loeschen")
    scripted(services, ModelReply(text="", tool_calls=[ToolInvocation(
        name="aufgabe_loeschen", arguments={"aufgabe": str(aufgabe.id)})]))
    agent = services.build_agent()

    antwort = run(agent.handle("42", f"Loesche Aufgabe {aufgabe.id}"))
    assert antwort.needs_confirmation
    assert antwort.buttons and antwort.buttons[0][1].startswith("bestaetigen:")
    # Ohne Bestaetigung bleibt die Aufgabe da.
    assert services.tasks.get(aufgabe.id) is not None

    ergebnis = run(agent.confirm(antwort.confirmation_token, chat_id="42"))
    assert "geloescht" in ergebnis.text
    assert services.tasks.get(aufgabe.id) is None


def test_abgelehnte_bestaetigung_fuehrt_nichts_aus(services):
    aufgabe = services.tasks.create("Bleibt")
    scripted(services, ModelReply(text="", tool_calls=[ToolInvocation(
        name="aufgabe_loeschen", arguments={"aufgabe": str(aufgabe.id)})]))
    agent = services.build_agent()
    antwort = run(agent.handle("42", "weg damit"))
    run(agent.reject(antwort.confirmation_token))
    assert services.tasks.get(aufgabe.id) is not None


def test_unbekanntes_werkzeug_bricht_nicht_ab(services):
    scripted(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(name="zauberstab", arguments={})]),
        ModelReply(text="Das kann ich nicht, aber ich kann Aufgaben anlegen."),
    )
    antwort = run(services.build_agent().handle("42", "zaubere"))
    assert "kann ich nicht" in antwort.text


def test_falsche_argumente_brechen_nicht_ab(services):
    scripted(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="erinnerung_anlegen", arguments={"text": "X", "wann": "voelliger Unsinn"})]),
        ModelReply(text="Wann genau soll ich erinnern?"),
    )
    antwort = run(services.build_agent().handle("42", "erinnere mich irgendwann"))
    assert "Wann genau" in antwort.text
    assert services.reminders.upcoming() == []


def test_modellausfall_laesst_system_am_leben(services):
    class Kaputt(EchoProvider):
        async def chat(self, messages, **kwargs):
            raise ModelUnavailable("Ollama antwortet nicht")

    services.models.primary = Kaputt()
    services.models.fallback = None
    services.settings.ai_max_retries = 0

    antwort = run(services.build_agent().handle("42", "Moin"))
    assert antwort.degraded
    assert "/uebersicht" in antwort.text
    # Die Befehlsschiene funktioniert weiter.
    direkt = run(services.build_agent().run_tool_directly("aufgaben_liste", chat_id="42"))
    assert direkt.text


def test_werkzeugergebnis_bleibt_erhalten_wenn_das_modell_danach_ausfaellt(services):
    class NurEinmal(EchoProvider):
        def __init__(self):
            super().__init__()
            self.runden = 0

        async def chat(self, messages, **kwargs):
            self.runden += 1
            if self.runden == 1:
                return ModelReply(text="", tool_calls=[ToolInvocation(
                    name="aufgabe_anlegen", arguments={"titel": "Wichtig"})])
            raise ModelUnavailable("weg")

    services.models.primary = NurEinmal()
    services.models.fallback = None
    services.settings.ai_max_retries = 0

    antwort = run(services.build_agent().handle("42", "leg das an"))
    assert "Wichtig" in antwort.text
    assert services.tasks.list()[0].title == "Wichtig"


def test_werkzeuggrenze_wird_eingehalten(services):
    endlos = [
        ModelReply(text="", tool_calls=[ToolInvocation(name="aufgaben_liste", arguments={})])
        for _ in range(20)
    ]
    scripted(services, *endlos)
    services.settings.ai_max_tool_rounds = 3
    antwort = run(services.build_agent().handle("42", "immer weiter"))
    assert len(antwort.tool_names) == 3


def test_textbasierte_werkzeugaufrufe_funktionieren(services):
    """Modelle ohne native Werkzeuge schreiben JSON -- das muss greifen."""
    from jarvis.ai.provider import parse_text_tool_calls

    text, aufrufe = parse_text_tool_calls(
        'Mache ich.\n```json\n{"werkzeug": "aufgabe_anlegen", '
        '"argumente": {"titel": "Aus Text erkannt"}}\n```'
    )
    assert text == "Mache ich."
    assert aufrufe[0].name == "aufgabe_anlegen"

    scripted(
        services,
        ModelReply(text="", tool_calls=aufrufe),
        ModelReply(text="Angelegt."),
    )
    run(services.build_agent().handle("42", "leg an"))
    assert services.tasks.list()[0].title == "Aus Text erkannt"

"""Der ganze Telegram-Weg gegen einen Stellvertreter der Bot-API.

Hier wird nichts ersetzt ausser dem Server selbst: der Adapter ruft wirklich
``getMe`` und ``getUpdates``, verschickt wirklich ``sendMessage``, und die
Antworten entstehen im echten Agenten mit echten Werkzeugen und echter
Datenbank. Das ist der Durchlauf, den api.telegram.org hier nicht erlaubt.
"""

from __future__ import annotations

import asyncio

import pytest

from jarvis.adapters.telegram import TelegramBot
from tests.stub_telegram import TelegramStub

TOKEN = "123456:stub-token-fuer-die-tests-xxxxxxxx"


@pytest.fixture
def stub():
    server = TelegramStub(port=8841, token=TOKEN)
    server.start()
    yield server
    server.stop()


@pytest.fixture
def bot(services, stub, monkeypatch):
    services.settings.telegram_token = TOKEN
    services.settings.telegram_api_base = stub.base_url
    services.settings.telegram_poll_timeout = 1
    instance = TelegramBot(services)
    assert instance.api_base == stub.base_url
    return instance


async def laufen_lassen(bot, stub, *, bis=None, grenze: float = 6.0) -> None:
    """Bot starten, warten bis ``bis()`` zutrifft, dann geordnet beenden.

    Ohne Bedingung wird gewartet, bis alle eingestellten Aktualisierungen
    abgeholt *und* verarbeitet sind. Nur auf ``stub.sent`` zu schauen reicht
    nicht: die Startmeldung ist schon da, bevor die erste Nachricht dran ist.
    """
    vorher = len(stub.sent)
    if bis is None:
        def bis() -> bool:
            return not stub.updates and len(stub.sent) > vorher + 2

    aufgabe = asyncio.create_task(bot.start())
    schritte = int(grenze / 0.05)
    for _ in range(schritte):
        await asyncio.sleep(0.05)
        if bis():
            break
    await bot.stop()
    aufgabe.cancel()
    try:
        await aufgabe
    except asyncio.CancelledError:
        pass


def script(services, *antworten):
    from jarvis.ai.cloud import EchoProvider
    provider = EchoProvider(scripted=list(antworten))
    services.models.primary = provider
    services.models.active = provider
    services.models.fallback = None
    return provider


def test_start_meldet_sich_beim_stellvertreter(bot, stub):
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: bool(stub.texts())))
    assert bot.me["username"] == "jarvis_stub_bot"
    # Die Befehlsliste wird gesetzt, damit Telegram sie im Menue zeigt.
    befehle = stub.calls("setMyCommands")
    assert befehle and any(c["command"] == "uebersicht" for c in befehle[0]["commands"])
    # Und die Startmeldung mit dem Einrichtungsstand geht raus.
    assert any("Jarvis ist gestartet" in text for text in stub.texts())


def test_nachricht_wird_abgeholt_beantwortet_und_der_versatz_fortgeschrieben(bot, stub, services):
    from jarvis.ai.provider import ModelReply, ToolInvocation
    script(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Angebot fuer Alex"})]),
        ModelReply(text="Steht als Aufgabe #1."),
    )
    letzte = stub.push_message("Leg mir bitte an: Angebot fuer Alex")

    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Aufgabe #1" in t for t in stub.texts())))

    assert any("Steht als Aufgabe #1." in text for text in stub.texts())
    assert services.tasks.list()[0].title == "Angebot fuer Alex"
    # Der Versatz liegt hinter der verarbeiteten Nachricht und ist gespeichert.
    assert int(services.store.get("telegram_offset")) == letzte + 1


def test_befehl_laeuft_durch_bis_in_die_datenbank(bot, stub, services):
    stub.push_message("/neu Lampen aufhaengen")
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Lampen" in t for t in stub.texts())))
    assert services.tasks.list()[0].title == "Lampen aufhaengen"
    assert any("Lampen aufhaengen" in text for text in stub.texts())


def test_knopfdruck_loest_die_aktion_aus(bot, stub, services):
    aufgabe = services.tasks.create("Per Knopf abschliessen")
    stub.push_callback(f"aufgabe_fertig:{aufgabe.id}")
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("erledigt" in t for t in stub.texts())))
    assert services.tasks.get(aufgabe.id).status == "erledigt"
    assert any("erledigt" in text for text in stub.texts())


def test_bestaetigungsweg_ueber_zwei_aktualisierungen(bot, stub, services):
    """Erst die Rueckfrage mit Knopf, dann der Druck -- so laeuft es wirklich ab."""
    from jarvis.ai.provider import ModelReply, ToolInvocation
    aufgabe = services.tasks.create("Weg damit")
    script(services, ModelReply(text="", tool_calls=[ToolInvocation(
        name="aufgabe_loeschen", arguments={"aufgabe": str(aufgabe.id)})]))

    stub.push_message(f"Loesche Aufgabe {aufgabe.id}")
    asyncio.run(laufen_lassen(
        bot, stub,
        bis=lambda: any("reply_markup" in p and
                        p["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
                        .startswith("bestaetigen:")
                        for p in stub.calls("sendMessage"))))

    # Die Rueckfrage traegt einen Knopf mit dem Token.
    mit_knopf = [p for p in stub.calls("sendMessage") if "reply_markup" in p]
    assert mit_knopf
    knopf = mit_knopf[-1]["reply_markup"]["inline_keyboard"][0][0]
    assert knopf["callback_data"].startswith("bestaetigen:")
    assert services.tasks.get(aufgabe.id) is not None      # noch nichts passiert

    stub.sent.clear()
    stub.push_callback(knopf["callback_data"])
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("geloescht" in t for t in stub.texts())))

    assert services.tasks.get(aufgabe.id) is None
    assert any("geloescht" in text for text in stub.texts())


def test_fremder_nutzer_kommt_auch_hier_nicht_durch(bot, stub, services):
    stub.push_message("/neu Heimlich", user_id=999999)
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("persoenlich" in t for t in stub.texts())))
    assert services.tasks.list() == []
    assert any("persoenlich" in text for text in stub.texts())


def test_proaktive_meldung_geht_ueber_den_echten_weg_raus(bot, stub, services):
    async def ablauf():
        aufgabe = asyncio.create_task(bot.start())
        await asyncio.sleep(0.3)
        services.notifier.quiet_start = services.notifier.quiet_end = ""
        gesendet = await services.notifier.notify("test:meldung", "*Termin in 10 Minuten*")
        await bot.stop()
        aufgabe.cancel()
        try:
            await aufgabe
        except asyncio.CancelledError:
            pass
        return gesendet

    assert asyncio.run(ablauf()) is True
    assert any("Termin in 10 Minuten" in text for text in stub.texts())


def test_sprachnachricht_ohne_erkennung_wird_offen_abgelehnt(bot, stub, services):
    stub.push_message("", voice={"file_id": "AgACvoice123", "duration": 6})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("STT_ENGINE" in t for t in stub.texts())))
    antworten = " ".join(stub.texts())
    assert "STT_ENGINE=whisper" in antworten
    # Ohne Erkennung wird die Datei nicht einmal geholt.
    assert stub.calls("getFile") == []


def test_sprachnachricht_wird_erkannt_und_ausgefuehrt(bot, stub, services, monkeypatch):
    """Mit lokaler Erkennung: Datei holen, erkennen, als Auftrag behandeln."""
    from pathlib import Path

    services.speech_in.engine = "whisper"
    monkeypatch.setattr(type(services.speech_in), "available", property(lambda self: True))

    erkannte_dateien: list[Path] = []

    async def erkenne(datei: Path) -> str:
        erkannte_dateien.append(datei)
        assert datei.exists() and datei.read_bytes() == stub.file_bytes
        return "Leg eine Aufgabe an: Rueckruf bei Alex"

    monkeypatch.setattr(services.speech_in, "transcribe", erkenne)

    from jarvis.ai.provider import ModelReply, ToolInvocation
    script(
        services,
        ModelReply(text="", tool_calls=[ToolInvocation(
            name="aufgabe_anlegen", arguments={"titel": "Rueckruf bei Alex"})]),
        ModelReply(text="Notiert."),
    )

    stub.push_message("", voice={"file_id": "AgACvoice456", "duration": 8})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Notiert." in t for t in stub.texts())))

    assert stub.calls("getFile")[0]["file_id"] == "AgACvoice456"
    antworten = " ".join(stub.texts())
    assert "Verstanden:" in antworten and "Rueckruf bei Alex" in antworten
    assert services.tasks.list()[0].title == "Rueckruf bei Alex"
    # Die heruntergeladene Datei wird nach der Erkennung wieder entfernt.
    assert erkannte_dateien and not erkannte_dateien[0].exists()


def test_zu_lange_sprachnachricht_wird_abgelehnt(bot, stub, services, monkeypatch):
    services.speech_in.engine = "whisper"
    monkeypatch.setattr(type(services.speech_in), "available", property(lambda self: True))
    stub.push_message("", voice={"file_id": "AgAClang", "duration": 900})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("zu lange" in t for t in stub.texts())))
    assert any("zu lange" in text for text in stub.texts())
    assert stub.calls("getFile") == []

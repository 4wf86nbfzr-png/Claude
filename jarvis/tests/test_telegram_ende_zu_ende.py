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
from jarvis.db.database import utcnow
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


# --- Gehirn-Datei ueber Telegram ----------------------------------------------
GEHIRN = """\
# Wer ich bin
!! Name: Maik Herm
Firma: HERM Service Team e.K.
Rolle: <ausfüllen>

# Vorlieben
!! Ansprache: Du-Form, kurz und direkt
Telefonate: lieber vormittags
"""


def test_gehirn_datei_wird_eingelesen_und_nach_bestaetigung_gelernt(bot, stub, services):
    """Der Weg ohne Terminal: Datei anhaengen, Knopf druecken, fertig."""
    stub.file_bytes = GEHIRN.encode("utf-8")
    stub.push_message("", document={
        "file_id": "BQACgehirn", "file_name": "mein-gehirn.md", "file_size": len(GEHIRN),
        "mime_type": "text/markdown",
    })

    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Punkte" in t for t in stub.texts())))

    # Vorschau mit Zahlen, Platzhinweis und Bestaetigungsknopf.
    vorschau = next(t for t in stub.texts() if "Punkte" in t)
    assert "4 Punkte" in vorschau
    assert "Maik Herm" in vorschau
    assert "übersprungen" in vorschau            # die <ausfüllen>-Zeile
    assert services.memory.list_memory() == []   # noch nichts gelernt

    mit_knopf = [p for p in stub.calls("sendMessage") if "reply_markup" in p]
    knopf = mit_knopf[-1]["reply_markup"]["inline_keyboard"][0][0]
    assert knopf["callback_data"].startswith("bestaetigen:")

    stub.sent.clear()
    stub.push_callback(knopf["callback_data"])
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Gelernt" in t for t in stub.texts())))

    gelernt = {e.key: e.value for e in services.memory.list_memory()}
    assert gelernt["Name"] == "Maik Herm"
    assert gelernt["Ansprache"] == "Du-Form, kurz und direkt"
    assert "Rolle" not in gelernt
    assert any("4 neu" in t for t in stub.texts())


def test_abgelehnte_gehirn_datei_wird_nicht_gelernt(bot, stub, services):
    stub.file_bytes = GEHIRN.encode("utf-8")
    stub.push_message("", document={
        "file_id": "BQACgehirn2", "file_name": "gehirn.txt", "file_size": len(GEHIRN)})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("Punkte" in t for t in stub.texts())))
    knopf = [p for p in stub.calls("sendMessage") if "reply_markup" in p][-1]
    token = knopf["reply_markup"]["inline_keyboard"][1][0]["callback_data"]
    assert token.startswith("ablehnen:")

    stub.push_callback(token)
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "lasse" in t for t in stub.texts())))
    assert services.memory.list_memory() == []


def test_falsches_dateiformat_wird_erklaert(bot, stub, services):
    stub.push_message("", document={
        "file_id": "BQACpdf", "file_name": "unterlagen.pdf", "file_size": 2048})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("kann ich nicht lesen" in t for t in stub.texts())))
    assert any("mein-gehirn.md" in t for t in stub.texts())
    assert stub.calls("getFile") == []


def test_zu_grosse_datei_wird_abgelehnt(bot, stub):
    stub.push_message("", document={
        "file_id": "BQACgross", "file_name": "riesig.md", "file_size": 2 * 1024 * 1024})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("kB" in t for t in stub.texts())))
    assert stub.calls("getFile") == []


def test_datei_ohne_lernbaren_inhalt(bot, stub, services):
    stub.file_bytes = b"> nur ein Kommentar\n\n"
    stub.push_message("", document={
        "file_id": "BQACleer", "file_name": "leer.md", "file_size": 20})
    asyncio.run(laufen_lassen(
        bot, stub, bis=lambda: any("nichts Lernbares" in t for t in stub.texts())))
    assert services.memory.list_memory() == []


def test_gehirn_befehl_zeigt_das_gelernte(bot, stub, services):
    services.memory.remember("Name", "Maik Herm", importance=5)
    services.memory.remember("Telefonate", "lieber vormittags", kind="vorliebe", importance=4)
    services.memory.remember("Zahlen", "als Liste", kind="vorliebe")

    stub.push_message("/gehirn")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any("Punkte" in t for t in stub.texts())))

    ausgabe = next(t for t in stub.texts() if "Punkte" in t)
    assert "Maik Herm" in ausgabe and "lieber vormittags" in ausgabe
    assert "3 Punkte, davon 2 als wichtig" in ausgabe
    assert "/vergiss" in ausgabe


def test_gehirn_befehl_bei_leerem_gedaechtnis_erklaert_den_weg(bot, stub):
    stub.push_message("/gehirn")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any("leer" in t for t in stub.texts())))
    assert any("mein-gehirn.md" in t for t in stub.texts())


def test_vergiss_befehl_loescht_einen_punkt(bot, stub, services):
    eintrag = services.memory.remember("Lieblingscafe", "Elbgold")
    stub.push_message(f"/vergiss #{eintrag.id}")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Gelöscht" in t or "geloescht" in t.lower() for t in stub.texts())))
    assert services.memory.get_memory_by_key("Lieblingscafe") is None


# --- Ohne Sprachmodell: die wichtigen Befehle muessen trotzdem wirken ---------
def ohne_modell(services):
    """Modell, das jede Anfrage verweigert -- wie bei abgeschaltetem Ollama."""
    from jarvis.ai.cloud import EchoProvider
    from jarvis.errors import ModelUnavailable

    class Stumm(EchoProvider):
        async def chat(self, messages, **kwargs):
            raise ModelUnavailable("Ollama laeuft nicht")

    services.models.primary = Stumm()
    services.models.fallback = None
    services.settings.ai_max_retries = 0


def test_merken_funktioniert_ohne_modell(bot, stub, services):
    """Eine Zusage ohne Eintrag waere schlimmer als eine Fehlermeldung."""
    ohne_modell(services)
    stub.push_message("/merken Telefonate: lieber vormittags ab 9")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Gemerkt" in t for t in stub.texts())))

    eintrag = services.memory.get_memory_by_key("Telefonate")
    assert eintrag is not None, "Nichts gemerkt, obwohl bestaetigt"
    assert eintrag.value == "lieber vormittags ab 9"


def test_merken_ohne_doppelpunkt_leitet_den_schluessel_ab(bot, stub, services):
    ohne_modell(services)
    stub.push_message("/merken Ich bin donnerstags meist auf Objekten")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Gemerkt" in t for t in stub.texts())))

    treffer = services.memory.search_memory("donnerstags")
    assert treffer, "Der Punkt ist nicht auffindbar"
    assert "auf Objekten" in treffer[0].value


def test_merken_mit_wichtigkeitsmarke(bot, stub, services):
    ohne_modell(services)
    stub.push_message("/merken !! Ansprache: Du-Form, kurz")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Gemerkt" in t for t in stub.texts())))
    eintrag = services.memory.get_memory_by_key("Ansprache")
    assert eintrag.importance == 5
    assert eintrag.value == "Du-Form, kurz"


def test_erinnere_funktioniert_ohne_modell(bot, stub, services):
    ohne_modell(services)
    stub.push_message("/erinnere Alex anrufen morgen 9:00")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Erinnerung" in t for t in stub.texts())))

    erinnerungen = services.reminders.upcoming()
    assert len(erinnerungen) == 1, "Keine Erinnerung angelegt"
    assert erinnerungen[0].text == "Alex anrufen"
    assert erinnerungen[0].due_at > utcnow()
    assert erinnerungen[0].due_at.strftime("%H:%M") in {"07:00", "08:00"}  # 9:00 Ortszeit


def test_erinnere_erkennt_wiederholung_und_anruf(bot, stub, services):
    ohne_modell(services)
    stub.push_message("/erinnere jeden Montag um 9 Uhr an die Wochenplanung")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Erinnerung" in t for t in stub.texts())))

    erinnerung = services.reminders.upcoming()[0]
    assert erinnerung.recurrence == "woechentlich:mo"
    assert erinnerung.due_at > utcnow(), "Erster Termin liegt in der Vergangenheit"
    assert "Wochenplanung" in erinnerung.text


def test_erinnere_ohne_zeit_fragt_nach(bot, stub, services):
    """Ohne Zeitangabe uebernimmt der Agent -- der kann nachfragen."""
    from jarvis.ai.provider import ModelReply
    script(services, ModelReply(text="Wann genau soll ich erinnern?"))
    stub.push_message("/erinnere Rückruf Krankenkasse")
    asyncio.run(laufen_lassen(bot, stub, bis=lambda: any(
        "Wann genau" in t for t in stub.texts())))
    assert services.reminders.upcoming() == []

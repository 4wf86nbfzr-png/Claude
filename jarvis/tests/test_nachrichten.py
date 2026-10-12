"""Eingehende Nachrichten: Einstufung, Quellen, Meldung, Anruf, Bericht.

Der teure Fehler ist hier nicht die Meldung zu viel, sondern die Absage,
die untergeht. Entsprechend pruefen die Tests vor allem: wird aus einer
Absage eine dringende Meldung -- und wird daraus ein Anruf?
"""

from __future__ import annotations

import asyncio
import plistlib
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest

from jarvis.adapters.messenger.base import Nachricht
from jarvis.adapters.messenger.bruecke import Bruecke
from jarvis.adapters.messenger.mac import MacMitteilungen, apple_zeit, lies_mitteilung
from jarvis.core import triage
from jarvis.core.jobs import Job
from jarvis.db.database import utcnow


def nachricht(text: str, *, absender: str = "Alex Krapp", gruppe: str = "",
              kennung: str = "") -> Nachricht:
    return Nachricht(
        extern_id=kennung or f"test:{abs(hash(text)) % 100000}",
        absender=absender, gruppe=gruppe, text=text,
        empfangen_am=utcnow(), quelle="test",
    )


# --------------------------------------------------------------- Einstufung
@pytest.mark.parametrize("text", [
    "Moin, ich kann morgen leider nicht",
    "Muss den Samstag absagen, sorry",
    "Bin krank, komme heute nicht",
    "Schaffe es heute nicht zum Einsatz",
    "Ich komme 20 Minuten später",
    "Hier ist keiner da, was soll ich machen?",
])
def test_ausfall_ist_dringend(text):
    assert triage.nach_regeln(nachricht(text)).stufe == triage.DRINGEND


@pytest.mark.parametrize("text", ["Danke dir!", "Ok", "👍", "Alles klar 🙂"])
def test_geplauder_wird_ignoriert(text):
    assert triage.nach_regeln(nachricht(text)).stufe == triage.IGNORIEREN


def test_geschaeftliche_frage_wird_gemeldet():
    einstufung = triage.nach_regeln(
        nachricht("Können Sie uns Samstag 3 Leute für den Einlass stellen?")
    )
    assert einstufung.stufe == triage.MELDEN
    assert einstufung.gruende


def test_im_zweifel_wird_gemeldet():
    einstufung = triage.nach_regeln(nachricht("Sag mal, hast du kurz Zeit"))
    assert einstufung.meldenswert


def test_stumme_gruppe_schlaegt_alles():
    einstufung = triage.nach_regeln(
        nachricht("Ich bin krank", gruppe="Fussball Quatschgruppe"),
        stumme_gruppen=["quatschgruppe"],
    )
    assert einstufung.stufe == triage.IGNORIEREN


def test_wichtiger_absender_hebt_an():
    einstufung = triage.nach_regeln(
        nachricht("Kurze Rückfrage", absender="Maik Herm"),
        wichtige_absender=["maik"],
    )
    assert einstufung.stufe == triage.MELDEN
    assert "Maik" in einstufung.begruendung()


def test_eigenes_stichwort_ist_dringend():
    einstufung = triage.nach_regeln(
        nachricht("Thema Schlüsselübergabe"), dringend_woerter=["schlüsselübergabe"]
    )
    assert einstufung.stufe == triage.DRINGEND


class HerabstufendesModell:
    """Ein Modell, das alles für Geplauder hält."""

    async def chat(self, messages, **kwargs):
        class Antwort:
            text = "IGNORIEREN"
        return Antwort()


def test_modell_darf_eine_absage_nicht_wegsortieren():
    vorab = triage.nach_regeln(nachricht("Ich kann morgen nicht"))
    ergebnis = asyncio.run(triage.mit_modell(
        nachricht("Ich kann morgen nicht"), HerabstufendesModell(), vorab=vorab
    ))
    assert ergebnis.stufe == triage.DRINGEND


def test_modell_darf_geplauder_bestaetigen():
    vorab = triage.nach_regeln(nachricht("Sag mal, hast du kurz Zeit"))
    ergebnis = asyncio.run(triage.mit_modell(
        nachricht("Sag mal, hast du kurz Zeit"), HerabstufendesModell(), vorab=vorab
    ))
    assert ergebnis.stufe == triage.IGNORIEREN and ergebnis.vom_modell


def test_kaputtes_modell_aendert_nichts():
    class Kaputt:
        async def chat(self, messages, **kwargs):
            raise RuntimeError("kein Netz")

    vorab = triage.nach_regeln(nachricht("Sag mal, hast du kurz Zeit"))
    ergebnis = asyncio.run(triage.mit_modell(nachricht("x"), Kaputt(), vorab=vorab))
    assert ergebnis.stufe == vorab.stufe and not ergebnis.vom_modell


# ------------------------------------------------------------------ Speicher
def test_speicher_legt_ab_und_erkennt_doppelte(services):
    eins = nachricht("Moin", kennung="test:1")
    assert services.messages.ablegen(eins)
    assert services.messages.ablegen(eins) is None
    assert services.messages.offene_id("whatsapp", "test:1")


def test_speicher_einstufen_melden_erledigen(services):
    nachricht_id = services.messages.ablegen(nachricht("Bin krank", kennung="test:2"))
    services.messages.einstufen(
        nachricht_id, triage.Einstufung(triage.DRINGEND, ["Krankmeldung"])
    )
    eintrag = services.messages.holen(nachricht_id)
    assert eintrag.stufe == triage.DRINGEND and eintrag.gruende == ["Krankmeldung"]
    assert services.messages.offene_dringende()
    assert services.messages.erledigt(nachricht_id)
    assert services.messages.erledigt(nachricht_id) is False
    assert not services.messages.offene_dringende()


def test_speicher_zaehlt_sucht_und_raeumt_auf(services):
    for index, (text, stufe) in enumerate([
        ("Bin krank", triage.DRINGEND), ("Angebot?", triage.MELDEN), ("ok", triage.IGNORIEREN),
    ]):
        nachricht_id = services.messages.ablegen(nachricht(text, kennung=f"z:{index}"))
        services.messages.einstufen(nachricht_id, triage.Einstufung(stufe))
    zahlen = services.messages.zaehlen(utcnow() - timedelta(hours=1))
    assert zahlen[triage.DRINGEND] == 1 and zahlen[triage.IGNORIEREN] == 1
    assert services.messages.suchen("krank")[0].text == "Bin krank"
    # Altes Geplauder verschwindet, Dringendes bleibt.
    services.db.execute(
        "UPDATE nachricht SET empfangen_am = ? WHERE stufe = 'ignoriert'",
        ("2000-01-01T00:00:00+00:00",),
    )
    assert services.messages.aufraeumen(tage=30) == 1
    assert len(services.messages.liste(limit=10)) == 2


# -------------------------------------------------------------------- Bruecke
def test_bruecke_nimmt_an_und_gibt_heraus(services):
    bruecke = Bruecke(services.db)
    assert bruecke.annehmen(absender="Chef", text="Moin", extern_id="b:1")
    assert bruecke.annehmen(absender="Chef", text="Moin", extern_id="b:1") is None
    assert bruecke.annehmen(absender="Chef", text="   ") is None
    offene = asyncio.run(bruecke.neue())
    assert [n.absender for n in offene] == ["Chef"]
    ok, hinweis = asyncio.run(bruecke.health())
    assert ok and "1" in hinweis


# ------------------------------------------------------------ Mac-Mitteilungen
def mitteilung(titel: str, untertitel: str, text: str) -> bytes:
    return plistlib.dumps(
        {"req": {"titl": titel, "subt": untertitel, "body": text}},
        fmt=plistlib.FMT_BINARY,
    )


def test_mitteilung_wird_gelesen():
    inhalt = lies_mitteilung(mitteilung("Alex Krapp", "", "Moin, ich kann morgen nicht"))
    assert inhalt["titel"] == "Alex Krapp"
    assert inhalt["text"] == "Moin, ich kann morgen nicht"


def test_kaputte_mitteilung_wirft_nicht():
    assert lies_mitteilung(b"kein plist") == {}


def test_apple_zeit_rechnet_um():
    assert apple_zeit(0) == datetime(2001, 1, 1, tzinfo=timezone.utc)


@pytest.fixture
def mitteilungsdatenbank(tmp_path):
    pfad = tmp_path / "mitteilungen.db"
    verbindung = sqlite3.connect(pfad)
    verbindung.executescript(
        "CREATE TABLE app (app_id INTEGER PRIMARY KEY, identifier TEXT);"
        "CREATE TABLE record (rec_id INTEGER PRIMARY KEY, app_id INTEGER, "
        "data BLOB, delivered_date REAL);"
        "INSERT INTO app VALUES (1, 'net.whatsapp.WhatsApp'), (2, 'com.apple.mail');"
    )
    verbindung.executemany(
        "INSERT INTO record (rec_id, app_id, data, delivered_date) VALUES (?, ?, ?, ?)",
        [
            (1, 1, mitteilung("Alex Krapp", "", "Ich kann morgen leider nicht"), 0.0),
            (2, 1, mitteilung("Crew Hamburg", "Tim", "Wer übernimmt Samstag?"), 60.0),
            (3, 2, mitteilung("Posteingang", "", "Newsletter"), 120.0),
        ],
    )
    verbindung.commit()
    verbindung.close()
    return pfad


def test_mac_liest_nur_whatsapp_und_merkt_den_stand(mitteilungsdatenbank):
    quelle = MacMitteilungen(mitteilungsdatenbank)
    ok, _ = quelle.verfuegbar()
    assert ok
    erste = asyncio.run(quelle.neue())
    assert [n.text for n in erste] == ["Ich kann morgen leider nicht", "Wer übernimmt Samstag?"]
    # Gruppennachricht: Titel ist die Gruppe, Untertitel der Absender.
    assert erste[1].absender == "Tim" and erste[1].gruppe == "Crew Hamburg"
    # Zweiter Abruf liefert nichts erneut.
    assert asyncio.run(quelle.neue()) == []
    assert quelle.hoechste_id() == 3


def test_mac_ohne_datenbank_meldet_das_ehrlich(tmp_path):
    quelle = MacMitteilungen(tmp_path / "gibt-es-nicht.db")
    ok, hinweis = quelle.verfuegbar()
    assert not ok and "nicht gefunden" in hinweis
    assert asyncio.run(quelle.neue()) == []


def test_mac_health_verbraucht_keine_nachricht(mitteilungsdatenbank):
    quelle = MacMitteilungen(mitteilungsdatenbank)
    ok, _ = asyncio.run(quelle.health())
    assert ok
    assert len(asyncio.run(quelle.neue())) == 2


# ----------------------------------------------------- Durchlauf im System
@pytest.fixture
def dienste_mit_bruecke(monkeypatch, tmp_path):
    """Jarvis mit angeschlossener Bruecke als Nachrichtenquelle."""
    monkeypatch.setenv("MESSENGER_ENABLED", "true")
    monkeypatch.setenv("MESSENGER_QUELLE", "bruecke")
    monkeypatch.setenv("MESSENGER_WICHTIGE_ABSENDER", "maik")
    from jarvis.config import Settings
    from jarvis.core.services import Services
    instance = Services(Settings.load())
    yield instance
    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(instance.stop())


def test_bruecke_wird_als_quelle_gebaut(dienste_mit_bruecke):
    assert isinstance(dienste_mit_bruecke.messenger, Bruecke)
    zustand = asyncio.run(dienste_mit_bruecke.health())
    assert any(s.name.startswith("Nachrichten") and s.ok for s in zustand)


def test_abgeschaltet_bleibt_ohne_quelle(services):
    assert services.messenger is None
    assert "abgeschaltet" in services.messenger_error


def test_unbekannte_quelle_wird_gemeldet(monkeypatch):
    monkeypatch.setenv("MESSENGER_ENABLED", "true")
    monkeypatch.setenv("MESSENGER_QUELLE", "telepathie")
    from jarvis.config import Settings
    from jarvis.core.services import Services
    dienste = Services(Settings.load())
    try:
        assert dienste.messenger is None
        assert "telepathie" in dienste.messenger_error
    finally:
        asyncio.get_event_loop_policy().new_event_loop().run_until_complete(dienste.stop())


def auftrag(kind: str) -> Job:
    return Job(
        id=1, kind=kind, payload={}, run_at=utcnow(), status="laeuft",
        attempts=1, max_attempts=1, last_error="", recurrence="", idempotency_key=None,
    )


def durchlauf(dienste) -> str:
    return asyncio.run(dienste._job_messages(auftrag("nachrichten_pruefen")))


def test_absage_wird_dringend_gemeldet(dienste_mit_bruecke):
    gesendet: list[str] = []
    _mitschreiben(dienste_mit_bruecke, gesendet)
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex Krapp", text="Moin, ich kann morgen leider nicht", extern_id="e:1"
    )
    bericht = durchlauf(dienste_mit_bruecke)
    assert "1 neu" in bericht and "1 gemeldet" in bericht
    assert gesendet and "sofort erreichen" in gesendet[0]
    eintrag = dienste_mit_bruecke.messages.liste(limit=1)[0]
    assert eintrag.stufe == triage.DRINGEND and eintrag.gemeldet_am


def test_geplauder_wird_nicht_gemeldet(dienste_mit_bruecke):
    gesendet: list[str] = []
    _mitschreiben(dienste_mit_bruecke, gesendet)
    dienste_mit_bruecke.messenger.annehmen(absender="Tim", text="Danke dir!", extern_id="e:2")
    bericht = durchlauf(dienste_mit_bruecke)
    assert "0 gemeldet" in bericht and not gesendet
    assert dienste_mit_bruecke.messages.liste(limit=1)[0].stufe == triage.IGNORIEREN


def test_dringendes_loest_einen_anruf_aus(dienste_mit_bruecke, monkeypatch):
    _mitschreiben(dienste_mit_bruecke, [])
    # Telefonie vorspiegeln, ohne zu waehlen: nur die Auftragsschlange zaehlt.
    monkeypatch.setattr(type(dienste_mit_bruecke), "phone_active", property(lambda self: True))
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex", text="Bin krank, komme heute nicht", extern_id="e:3"
    )
    bericht = durchlauf(dienste_mit_bruecke)
    assert "1 Anruf(e)" in bericht
    anrufe = [j for j in dienste_mit_bruecke.queue.pending() if j.kind == "anruf"]
    assert anrufe and "Bin krank" in anrufe[0].payload["text"]
    # Zweiter Durchlauf darf nicht erneut anrufen.
    assert "0 Anruf(e)" in durchlauf(dienste_mit_bruecke)


def test_ohne_telefonie_kein_anruf(dienste_mit_bruecke):
    _mitschreiben(dienste_mit_bruecke, [])
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex", text="Ich muss den Samstag absagen", extern_id="e:4"
    )
    assert "0 Anruf(e)" in durchlauf(dienste_mit_bruecke)
    assert not [j for j in dienste_mit_bruecke.queue.pending() if j.kind == "anruf"]


def _mitschreiben(dienste, ziel: list[str]) -> None:
    """Zustellweg abfangen -- es geht nichts nach Telegram hinaus."""
    async def sender(text, keyboard=None):
        ziel.append(text)
        return True

    dienste.notifier.set_sender(sender)
    dienste.notifier.quiet_start = dienste.notifier.quiet_end = ""


# --------------------------------------------------------------- Zwischenstand
def test_bericht_schweigt_wenn_nichts_war(dienste_mit_bruecke):
    text, punkte = dienste_mit_bruecke.background_report()
    assert punkte == 0 and "ruhig" in text


def test_bericht_nennt_was_passiert_ist(dienste_mit_bruecke):
    _mitschreiben(dienste_mit_bruecke, [])
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex", text="Ich kann morgen nicht", extern_id="e:5"
    )
    dienste_mit_bruecke.messenger.annehmen(
        absender="Tim", text="Danke dir!", extern_id="e:6"
    )
    durchlauf(dienste_mit_bruecke)
    dienste_mit_bruecke.tasks.create("Alex ersetzen")
    text, punkte = dienste_mit_bruecke.background_report()
    assert punkte >= 2
    assert "2 Nachricht(en) gelesen" in text and "1 dringend" in text
    assert "Aufgaben: 1 neu" in text
    assert "Noch offen" in text


def test_geplanter_bericht_schiebt_den_zeitpunkt_weiter(dienste_mit_bruecke):
    _mitschreiben(dienste_mit_bruecke, [])
    dienste_mit_bruecke.tasks.create("Irgendwas")
    ergebnis = asyncio.run(dienste_mit_bruecke._job_report(auftrag("hintergrundbericht")))
    assert "gesendet" in ergebnis
    assert dienste_mit_bruecke.store.get("letzter_bericht")
    # Direkt danach ist nichts Neues mehr zu berichten.
    assert asyncio.run(
        dienste_mit_bruecke._job_report(auftrag("hintergrundbericht"))
    ) == "nichts zu berichten"


# ----------------------------------------------------------------- Werkzeuge
def werkzeug(dienste, name: str, **argumente):
    return asyncio.run(dienste.toolkit.execute(name, argumente, chat_id="4711"))


def test_werkzeuge_zeigen_lesen_und_haken_ab(dienste_mit_bruecke):
    _mitschreiben(dienste_mit_bruecke, [])
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex Krapp", text="Ich kann morgen leider nicht", extern_id="e:7"
    )
    durchlauf(dienste_mit_bruecke)
    nachricht_id = dienste_mit_bruecke.messages.liste(limit=1)[0].id

    liste = werkzeug(dienste_mit_bruecke, "nachrichten_liste")
    assert liste.ok and "Alex Krapp" in liste.text

    gelesen = werkzeug(dienste_mit_bruecke, "nachricht_lesen", id=nachricht_id)
    assert "morgen leider nicht" in gelesen.text

    gesucht = werkzeug(dienste_mit_bruecke, "nachrichten_suchen", begriff="Alex")
    assert gesucht.data["anzahl"] == 1

    fertig = werkzeug(dienste_mit_bruecke, "nachricht_erledigt", id=nachricht_id)
    assert fertig.ok
    assert werkzeug(dienste_mit_bruecke, "nachrichten_liste").data["anzahl"] == 0


def test_werkzeug_meldet_unbekannte_nummer(dienste_mit_bruecke):
    assert not werkzeug(dienste_mit_bruecke, "nachricht_lesen", id=999).ok


def test_berichtswerkzeug_gibt_text_zurueck(dienste_mit_bruecke):
    dienste_mit_bruecke.tasks.create("Etwas")
    ergebnis = werkzeug(dienste_mit_bruecke, "hintergrundbericht", stunden=2)
    assert ergebnis.ok and "Aufgaben: 1 neu" in ergebnis.text


# ------------------------------------------------------------------- Telegram
@pytest.fixture
def bot_mit_bruecke(dienste_mit_bruecke):
    from jarvis.adapters.telegram import TelegramBot
    instance = TelegramBot(dienste_mit_bruecke)
    instance.gesendet = []

    async def falsches_call(method, **payload):
        instance.gesendet.append((method, payload))
        if method == "getMe":
            return {"username": "jarvis_test_bot", "id": 1}
        return {"message_id": len(instance.gesendet)}

    instance._call = falsches_call
    return instance


def befehl(text: str) -> dict:
    return {"update_id": 1, "message": {
        "message_id": 10, "chat": {"id": 4711}, "from": {"id": 4711, "first_name": "Noah"},
        "text": text,
    }}


def knopf(daten: str) -> dict:
    return {"update_id": 2, "callback_query": {
        "id": "cb1", "data": daten, "from": {"id": 4711, "first_name": "Noah"},
        "message": {"message_id": 11, "chat": {"id": 4711}},
    }}


def gesendete_texte(bot) -> list[str]:
    return [p.get("text", "") for m, p in bot.gesendet if m == "sendMessage"]


def test_telegram_zeigt_nachrichten_und_hakt_ab(bot_mit_bruecke, dienste_mit_bruecke):
    _mitschreiben(dienste_mit_bruecke, [])
    dienste_mit_bruecke.messenger.annehmen(
        absender="Alex Krapp", text="Ich kann morgen leider nicht", extern_id="t:1"
    )
    durchlauf(dienste_mit_bruecke)
    nachricht_id = dienste_mit_bruecke.messages.liste(limit=1)[0].id

    asyncio.run(bot_mit_bruecke._dispatch(befehl("/nachrichten")))
    assert any("Alex Krapp" in t for t in gesendete_texte(bot_mit_bruecke))

    asyncio.run(bot_mit_bruecke._dispatch(knopf(f"nachricht_fertig:{nachricht_id}")))
    assert dienste_mit_bruecke.messages.holen(nachricht_id).erledigt_am


def test_telegram_bericht_auf_befehl(bot_mit_bruecke, dienste_mit_bruecke):
    dienste_mit_bruecke.tasks.create("Dienstplan schreiben")
    asyncio.run(bot_mit_bruecke._dispatch(befehl("/bericht")))
    assert any("Aufgaben: 1 neu" in t for t in gesendete_texte(bot_mit_bruecke))


def test_telegram_erledigt_braucht_eine_nummer(bot_mit_bruecke):
    asyncio.run(bot_mit_bruecke._dispatch(befehl("/erledigt")))
    assert any("Welche Nachricht" in t for t in gesendete_texte(bot_mit_bruecke))

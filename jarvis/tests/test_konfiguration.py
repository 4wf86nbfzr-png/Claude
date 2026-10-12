"""Konfiguration und Startpruefung: fehlende Zugangsdaten muessen verstaendlich sein."""

from __future__ import annotations

import asyncio

import pytest

from jarvis.config import Settings, load_env_file
from jarvis.errors import CredentialsMissing


def test_fehlender_telegram_token_wird_gemeldet(monkeypatch):
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_ALLOWED_IDS", raising=False)
    offen = Settings.load().missing_setup()
    schluessel = {step.key for step in offen}
    assert "telegram_token" in schluessel
    assert "telegram_ids" in schluessel
    assert all(step.was_tun for step in offen)
    assert any(step.blockierend for step in offen)


def test_email_ohne_zugangsdaten_erzeugt_hinweis_statt_absturz(monkeypatch, settings):
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    neu = Settings.load()
    offen = {step.key for step in neu.missing_setup()}
    assert "email" in offen

    from jarvis.core.services import Services
    dienste = Services(neu)
    try:
        assert dienste.email is None
        assert "IMAP_HOST" in dienste.email_error or "verbunden" in dienste.email_error
    finally:
        asyncio.run(dienste.stop())


def test_telefonie_ohne_zugangsdaten_bleibt_aus(monkeypatch):
    monkeypatch.setenv("PHONE_ENABLED", "true")
    neu = Settings.load()
    offen = {step.key for step in neu.missing_setup()}
    assert "phone" in offen and "public_url" in offen

    from jarvis.core.services import Services
    dienste = Services(neu)
    try:
        assert dienste.phone is None
        assert dienste.phone_active is False
    finally:
        asyncio.run(dienste.stop())


def test_google_ohne_freigabe_faellt_auf_lokalen_kalender_zurueck(monkeypatch):
    monkeypatch.setenv("CALENDAR_PROVIDER", "google")
    neu = Settings.load()
    assert "google_oauth" in {step.key for step in neu.missing_setup()}

    from jarvis.core.services import Services
    dienste = Services(neu)
    try:
        # Ohne Client-Daten faellt Jarvis auf den lokalen Kalender zurueck,
        # statt beim Start auszusteigen.
        assert dienste.calendar.name == "local"
    finally:
        asyncio.run(dienste.stop())


def test_google_mit_client_daten_aber_ohne_anmeldung_meldet_das_klar(monkeypatch):
    """Sind die Client-Daten da, bleibt der Google-Kalender aktiv und sagt,
    dass die Anmeldung fehlt -- sonst landen Termine unbemerkt im lokalen Kalender."""
    monkeypatch.setenv("CALENDAR_PROVIDER", "google")
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "123.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "geheim")
    from jarvis.core.services import Services
    dienste = Services(Settings.load())
    try:
        assert dienste.calendar.name == "google"
        ok, hinweis = asyncio.run(dienste.calendar.health())
        assert ok is False
        assert "google-login" in hinweis
    finally:
        asyncio.run(dienste.stop())


def test_caldav_ohne_zugangsdaten_wirft_verstaendlich():
    from jarvis.adapters.calendar.caldav import CalDAVCalendar
    with pytest.raises(CredentialsMissing) as fehler:
        CalDAVCalendar("", "", "")
    assert "CALDAV_URL" in fehler.value.user_text()


def test_env_datei_wird_gelesen_ohne_umgebung_zu_ueberschreiben(tmp_path, monkeypatch):
    datei = tmp_path / "test.env"
    datei.write_text(
        '# Kommentar\nAI_MODEL="aus-der-datei"\nJARVIS_TIMEZONE=Europe/Berlin\nkaputt\n',
        encoding="utf-8",
    )
    monkeypatch.setenv("AI_MODEL", "aus-der-umgebung")
    geladen = load_env_file(datei)
    assert geladen["AI_MODEL"] == "aus-der-datei"
    # Bereits gesetzte Umgebungsvariablen haben Vorrang.
    assert Settings.load().ai_model == "aus-der-umgebung"


def test_rufnummern_werden_normalisiert():
    from jarvis.adapters.phone.twilio import normalize_number
    assert normalize_number("0151 123 456 78") == "+4915112345678"
    assert normalize_number("+49 151 12345678") == "+4915112345678"
    assert normalize_number("004915112345678") == "+4915112345678"
    from jarvis.errors import ConfigError
    with pytest.raises(ConfigError):
        normalize_number("keine Nummer")


def test_geheimnisse_erscheinen_nicht_im_protokoll():
    """Die Muster werden hier zusammengesetzt, nicht hingeschrieben -- sonst
    halten Geheimnis-Scanner die Testdaten fuer echte Zugangsdaten."""
    from jarvis.logging_setup import redact

    telegram = "123456789:" + "AAFakeToken" * 3 + "x"
    schluessel = "sk-" + "abcdefghij" * 3
    twilio = "AC" + "0123456789abcdef" * 2
    text = redact(f"Token {telegram} und {schluessel} dazu {twilio}")

    assert "AAFakeToken" not in text
    assert schluessel not in text
    assert twilio not in text
    assert "<entfernt>" in text


def test_zeitzone_faellt_auf_utc_zurueck(monkeypatch):
    monkeypatch.setenv("JARVIS_TIMEZONE", "Gibts/Nicht")
    assert str(Settings.load().tz) == "UTC"


def test_doctor_laeuft_ohne_netz_durch(services):
    zustand = asyncio.run(services.health())
    namen = {s.name for s in zustand}
    assert "Datenbank" in namen and "KI-Modell" in namen and "Telegram" in namen
    datenbank = next(s for s in zustand if s.name == "Datenbank")
    assert datenbank.ok
    # Nicht eingerichtete Teile werden als "nicht eingerichtet" ausgewiesen,
    # nicht als Fehler.
    email = next(s for s in zustand if s.name == "E-Mail")
    assert email.configured is False


def test_leerer_wert_bedeutet_aus_und_nicht_standard(monkeypatch):
    """Wer `MORNING_BRIEFING=` schreibt, will keinen Tagesueberblick."""
    monkeypatch.setenv("MORNING_BRIEFING", "")
    monkeypatch.setenv("QUIET_HOURS_START", "")
    monkeypatch.setenv("QUIET_HOURS_END", "")
    geladen = Settings.load()
    assert geladen.morning_briefing == ""
    assert geladen.quiet_hours_start == "" and geladen.quiet_hours_end == ""


def test_nicht_gesetzte_werte_behalten_den_standard(monkeypatch):
    monkeypatch.delenv("MORNING_BRIEFING", raising=False)
    monkeypatch.delenv("QUIET_HOURS_START", raising=False)
    geladen = Settings.load()
    assert geladen.morning_briefing == "07:30"
    assert geladen.quiet_hours_start == "22:00"


def test_ohne_ruhezeit_wird_sofort_zugestellt(monkeypatch, tmp_path):
    """Die abgeschaltete Ruhezeit muss bis zum Notifier durchkommen."""
    monkeypatch.setenv("QUIET_HOURS_START", "")
    monkeypatch.setenv("QUIET_HOURS_END", "")
    from jarvis.core.services import Services
    dienste = Services(Settings.load())
    try:
        assert dienste.notifier.quiet_start == ""
        gesendet: list[str] = []

        async def sender(text, keyboard=None):
            gesendet.append(text)
            return True

        dienste.notifier.set_sender(sender)
        assert asyncio.run(dienste.notifier.notify("t:1", "Jederzeit", priority=3)) is True
        assert gesendet == ["Jederzeit"]
    finally:
        asyncio.run(dienste.stop())


def test_tagesueberblick_wird_ohne_zeitangabe_nicht_eingeplant(monkeypatch):
    monkeypatch.setenv("MORNING_BRIEFING", "")
    from jarvis.core.services import Services
    dienste = Services(Settings.load())
    try:
        asyncio.run(dienste.start())
        arten = {job.kind for job in dienste.queue.pending(limit=50)}
        assert "tagesueberblick" not in arten
        assert "wachdienst" in arten
    finally:
        asyncio.run(dienste.stop())


# ------------------------------------------------------- .env schreiben
def test_env_setzen_ersetzt_und_ergaenzt(tmp_path, monkeypatch):
    """Vorhandene Zeilen werden ersetzt, Kommentare bleiben stehen."""
    import jarvis.cli as cli

    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    (tmp_path / ".env").write_text(
        "# Kommentar\nHTTP_API_TOKEN=\nTELEGRAM_BOT_TOKEN=abc\n", encoding="utf-8"
    )
    cli.env_setzen({"HTTP_API_TOKEN": "geheim", "ELEVENLABS_API_KEY": "sk_test"})
    inhalt = (tmp_path / ".env").read_text(encoding="utf-8")
    assert "# Kommentar" in inhalt
    assert "HTTP_API_TOKEN=geheim" in inhalt
    assert "TELEGRAM_BOT_TOKEN=abc" in inhalt
    assert "ELEVENLABS_API_KEY=sk_test" in inhalt


def test_env_bekommt_enge_rechte(tmp_path, monkeypatch):
    """Schluessel duerfen nicht fuer andere Nutzer lesbar sein."""
    import jarvis.cli as cli

    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    (tmp_path / ".env").write_text("", encoding="utf-8")
    pfad = cli.env_setzen({"ELEVENLABS_API_KEY": "sk_test"})
    assert oct(pfad.stat().st_mode & 0o777) == "0o600"


def test_env_wird_aus_der_vorlage_angelegt(tmp_path, monkeypatch):
    import jarvis.cli as cli

    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    (tmp_path / ".env.example").write_text("HTTP_API_TOKEN=\n", encoding="utf-8")
    cli.env_setzen({"HTTP_API_TOKEN": "x"})
    assert "HTTP_API_TOKEN=x" in (tmp_path / ".env").read_text(encoding="utf-8")


# ----------------------------------------------------- Stimme per Kennung
def test_stimme_per_kennung_wird_gespeichert(settings, monkeypatch, tmp_path):
    """'jarvis stimme --id ...' uebernimmt eine Stimme aus der Bibliothek."""
    import asyncio

    import jarvis.cli as cli
    from jarvis.adapters.voice import elevenlabs

    gespielt: list[str] = []

    class Attrappe:
        def __init__(self, *args, **kwargs):
            self.voice_id = args[1] if len(args) > 1 else ""

        async def datei(self, text, *, voice_id=""):
            gespielt.append(text)
            ziel = tmp_path / "probe.mp3"
            ziel.write_bytes(b"ID3")
            return ziel

    monkeypatch.setattr(elevenlabs, "ElevenLabsStimme", Attrappe)
    monkeypatch.setattr(cli.shutil, "which", lambda name: None)
    settings.elevenlabs_api_key = "sk-test"

    ergebnis = asyncio.run(cli._stimme(settings, False, "r1KmysJdVYZjJCm4mL3b"))
    assert ergebnis == 0
    assert gespielt == ["Moin, Master. Ich bin bereit."]

    from jarvis.core.memory import SettingsStore
    from jarvis.db.database import Database
    datenbank = Database(settings.db_path)
    try:
        assert SettingsStore(datenbank).get("orb_stimme") == "r1KmysJdVYZjJCm4mL3b"
    finally:
        datenbank.close()


def test_fehlgeschlagene_probe_erklaert_warum(settings, monkeypatch, capsys):
    import asyncio

    import jarvis.cli as cli
    from jarvis.adapters.voice import elevenlabs

    class Attrappe:
        def __init__(self, *args, **kwargs):
            self.voice_id = ""

        async def datei(self, text, *, voice_id=""):
            return None

    monkeypatch.setattr(elevenlabs, "ElevenLabsStimme", Attrappe)
    settings.elevenlabs_api_key = "sk-test"
    assert asyncio.run(cli._stimme(settings, False, "unbekannt")) == 1
    ausgabe = capsys.readouterr().out
    assert "Add to my voices" in ausgabe

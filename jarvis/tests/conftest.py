"""Gemeinsame Vorrichtungen fuer die Tests.

Jeder Test bekommt ein frisches Datenverzeichnis und ein Ersatzmodell;
es gehen keine Anfragen nach draussen, es werden keine Anrufe gestartet
und keine E-Mails versendet.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ENVIRONMENT_KEYS = [
    "TELEGRAM_BOT_TOKEN", "TELEGRAM_ALLOWED_IDS", "AI_PROVIDER", "AI_MODEL",
    "EMAIL_ENABLED", "PHONE_ENABLED", "HTTP_ENABLED", "CALENDAR_PROVIDER",
    "JARVIS_DATA_DIR", "JARVIS_ENV_FILE", "MORNING_BRIEFING", "HTTP_API_TOKEN",
    "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "PHONE_MY_NUMBER",
    "IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD", "QUIET_HOURS_START", "QUIET_HOURS_END",
    "PUBLIC_BASE_URL", "AI_FALLBACK_PROVIDER",
    "MESSENGER_ENABLED", "MESSENGER_QUELLE", "MESSENGER_POLL_SECONDS",
    "MESSENGER_WICHTIGE_ABSENDER", "MESSENGER_DRINGEND_WOERTER",
    "MESSENGER_WICHTIG_WOERTER", "MESSENGER_STUMME_GRUPPEN",
    "MESSENGER_ANRUF_BEI_DRINGEND", "MESSENGER_MAC_DB", "BERICHT_INTERVALL_STUNDEN",
    "ORB_ENABLED", "ORB_ANREDE", "ORB_GRUSS", "ORB_NACHRICHTEN", "ORB_PROGRAMME",
    "ORB_WEBSEITE", "ORB_AKTIONEN", "ORB_KLATSCHEN", "ORB_START_BEI_SCHNIPSEN",
    "ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "JARVIS_FILE_ROOTS",
]


@pytest.fixture(autouse=True)
def clean_environment(tmp_path, monkeypatch):
    for key in ENVIRONMENT_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("JARVIS_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("JARVIS_ENV_FILE", str(tmp_path / "nicht-vorhanden.env"))
    monkeypatch.setenv("AI_PROVIDER", "echo")
    monkeypatch.setenv("HTTP_ENABLED", "false")
    monkeypatch.setenv("MORNING_BRIEFING", "")
    # Kein Test geht ins Netz: die Nachrichtenlage bleibt aus, wenn ein Test
    # sie nicht ausdruecklich (mit einer Attrappe) einschaltet.
    monkeypatch.setenv("ORB_NACHRICHTEN", "false")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "123456:testtoken-nur-fuer-tests-xxxxxxxxxxxx")
    monkeypatch.setenv("TELEGRAM_ALLOWED_IDS", "4711")
    yield


@pytest.fixture
def settings():
    from jarvis.config import Settings
    loaded = Settings.load()
    loaded.ensure_dirs()
    return loaded


@pytest.fixture
def services(settings):
    from jarvis.core.services import Services
    instance = Services(settings)
    yield instance
    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(_close(instance))


async def _close(instance):
    await instance.stop()


@pytest.fixture
def database(settings):
    from jarvis.db.database import Database
    from jarvis.db.migrations import migrate
    db = Database(settings.db_path)
    migrate(db)
    yield db
    db.close()

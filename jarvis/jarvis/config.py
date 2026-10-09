"""Konfiguration.

Alle Einstellungen kommen aus Umgebungsvariablen; eine ``.env`` im
Projektordner (oder unter ``JARVIS_ENV_FILE``) wird beim Start geladen.
Zugangsdaten stehen ausschliesslich dort und werden nie geloggt oder
ueber Telegram ausgegeben.

``Settings.load()`` wirft nicht, wenn etwas fehlt. Stattdessen sammelt
``missing_setup()`` die fehlenden Schritte ein -- so kann Jarvis starten
und selbst erklaeren, was noch zu tun ist.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_env_file(path: Path | None = None) -> dict[str, str]:
    """Liest eine ``.env`` ein, ohne vorhandene Umgebungsvariablen zu ueberschreiben."""
    if path is None:
        env_file = os.environ.get("JARVIS_ENV_FILE")
        path = Path(env_file) if env_file else PROJECT_ROOT / ".env"
    loaded: dict[str, str] = {}
    if not path.exists():
        return loaded
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        loaded[key] = value
        os.environ.setdefault(key, value)
    return loaded


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "ja", "on", "an"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, "") or default)
    except ValueError:
        return default


def _str(name: str, default: str = "", *, allow_empty: bool = False) -> str:
    """Zeichenkette aus der Umgebung.

    ``allow_empty`` unterscheidet "nicht gesetzt" von "ausdruecklich leer".
    Das ist bei Schaltern wichtig, bei denen leer *aus* bedeutet: wer
    ``MORNING_BRIEFING=`` schreibt, will keinen Tagesueberblick -- nicht den
    Standardwert.
    """
    if allow_empty and name in os.environ:
        return os.environ[name].strip()
    return (os.environ.get(name) or default).strip()


def _int_list(name: str) -> list[int]:
    raw = _str(name)
    out: list[int] = []
    for part in raw.replace(";", ",").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append(int(part))
        except ValueError:
            continue
    return out


@dataclass(slots=True)
class SetupStep:
    """Ein fehlender Einrichtungsschritt, den Jarvis beim Start meldet."""

    key: str
    titel: str
    was_tun: str
    blockierend: bool = False


@dataclass(slots=True)
class Settings:
    # --- Grundlagen -------------------------------------------------------
    data_dir: Path = field(default_factory=lambda: PROJECT_ROOT / "data")
    timezone_name: str = "Europe/Berlin"
    log_level: str = "INFO"
    language: str = "de"

    # --- Telegram ---------------------------------------------------------
    telegram_token: str = ""
    telegram_allowed_ids: list[int] = field(default_factory=list)
    telegram_poll_timeout: int = 30
    #: Normalerweise die offizielle Bot-API. Umstellbar fuer einen eigenen
    #: Bot-API-Server (telegram-bot-api) oder fuer Tests gegen einen Stellvertreter.
    telegram_api_base: str = "https://api.telegram.org"

    # --- KI ---------------------------------------------------------------
    ai_provider: str = "ollama"           # ollama | openai | anthropic | echo
    ai_model: str = "llama3.1:8b"
    ai_fallback_provider: str = ""
    ai_fallback_model: str = ""
    ollama_url: str = "http://localhost:11434"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com/v1"
    anthropic_api_key: str = ""
    ai_timeout: float = 120.0
    ai_max_retries: int = 2
    ai_temperature: float = 0.6
    ai_context_messages: int = 16
    ai_max_tool_rounds: int = 6

    # --- Kalender ---------------------------------------------------------
    calendar_provider: str = "local"      # local | caldav | google
    caldav_url: str = ""
    caldav_user: str = ""
    caldav_password: str = ""
    caldav_calendar: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    google_calendar_id: str = "primary"

    # --- E-Mail -----------------------------------------------------------
    email_enabled: bool = False
    imap_host: str = ""
    imap_port: int = 993
    imap_user: str = ""
    imap_password: str = ""
    imap_folder: str = "INBOX"
    #: Nur fuer einen Mailserver auf demselben Rechner abschaltbar.
    imap_ssl: bool = True
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    email_from: str = ""
    email_poll_seconds: int = 300
    email_important_senders: list[str] = field(default_factory=list)
    email_important_keywords: list[str] = field(default_factory=list)

    # --- Telefonie --------------------------------------------------------
    phone_enabled: bool = False
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""
    #: Normalerweise die offizielle REST-Schnittstelle; umstellbar fuer Tests.
    twilio_api_base: str = "https://api.twilio.com/2010-04-01"
    phone_my_number: str = ""
    phone_voice: str = "Google.de-DE-Standard-B"
    phone_language: str = "de-DE"
    phone_max_attempts: int = 3
    phone_retry_minutes: int = 15
    phone_daily_limit: int = 20

    # --- Sprachverarbeitung ----------------------------------------------
    stt_engine: str = "twilio"            # twilio | whisper | none
    whisper_model: str = "base"
    whisper_binary: str = "whisper"
    tts_engine: str = "twilio"            # twilio | piper | say | none
    piper_binary: str = "piper"
    piper_voice: str = ""

    # --- HTTP-Dienst (Dashboard-API + Telefonie-Webhooks) -----------------
    http_enabled: bool = True
    http_host: str = "127.0.0.1"
    http_port: int = 8765
    http_api_token: str = ""
    public_base_url: str = ""             # oeffentlich erreichbare URL (Twilio)

    # --- Verhalten --------------------------------------------------------
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"
    scheduler_tick_seconds: int = 20
    backup_keep: int = 14
    morning_briefing: str = "07:30"       # leer = aus
    confirmation_ttl_minutes: int = 15

    # ---------------------------------------------------------------------
    @classmethod
    def load(cls) -> "Settings":
        load_env_file()
        data_dir = Path(_str("JARVIS_DATA_DIR") or (PROJECT_ROOT / "data")).expanduser()
        return cls(
            data_dir=data_dir,
            timezone_name=_str("JARVIS_TIMEZONE", "Europe/Berlin"),
            log_level=_str("JARVIS_LOG_LEVEL", "INFO"),
            language=_str("JARVIS_LANGUAGE", "de"),
            telegram_token=_str("TELEGRAM_BOT_TOKEN"),
            telegram_allowed_ids=_int_list("TELEGRAM_ALLOWED_IDS"),
            telegram_poll_timeout=_int("TELEGRAM_POLL_TIMEOUT", 30),
            telegram_api_base=_str("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/"),
            ai_provider=_str("AI_PROVIDER", "ollama").lower(),
            ai_model=_str("AI_MODEL", "llama3.1:8b"),
            ai_fallback_provider=_str("AI_FALLBACK_PROVIDER").lower(),
            ai_fallback_model=_str("AI_FALLBACK_MODEL"),
            ollama_url=_str("OLLAMA_URL", "http://localhost:11434").rstrip("/"),
            openai_base_url=_str("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            openai_api_key=_str("OPENAI_API_KEY"),
            anthropic_base_url=_str("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1").rstrip("/"),
            anthropic_api_key=_str("ANTHROPIC_API_KEY"),
            ai_timeout=_float("AI_TIMEOUT", 120.0),
            ai_max_retries=_int("AI_MAX_RETRIES", 2),
            ai_temperature=_float("AI_TEMPERATURE", 0.6),
            ai_context_messages=_int("AI_CONTEXT_MESSAGES", 16),
            ai_max_tool_rounds=_int("AI_MAX_TOOL_ROUNDS", 6),
            calendar_provider=_str("CALENDAR_PROVIDER", "local").lower(),
            caldav_url=_str("CALDAV_URL"),
            caldav_user=_str("CALDAV_USER"),
            caldav_password=_str("CALDAV_PASSWORD"),
            caldav_calendar=_str("CALDAV_CALENDAR"),
            google_client_id=_str("GOOGLE_CLIENT_ID"),
            google_client_secret=_str("GOOGLE_CLIENT_SECRET"),
            google_calendar_id=_str("GOOGLE_CALENDAR_ID", "primary"),
            email_enabled=_bool("EMAIL_ENABLED", False),
            imap_host=_str("IMAP_HOST"),
            imap_port=_int("IMAP_PORT", 993),
            imap_user=_str("IMAP_USER"),
            imap_password=_str("IMAP_PASSWORD"),
            imap_folder=_str("IMAP_FOLDER", "INBOX"),
            imap_ssl=_bool("IMAP_SSL", True),
            smtp_host=_str("SMTP_HOST"),
            smtp_port=_int("SMTP_PORT", 587),
            smtp_user=_str("SMTP_USER"),
            smtp_password=_str("SMTP_PASSWORD"),
            smtp_starttls=_bool("SMTP_STARTTLS", True),
            email_from=_str("EMAIL_FROM"),
            email_poll_seconds=_int("EMAIL_POLL_SECONDS", 300),
            email_important_senders=[
                s.strip().lower() for s in _str("EMAIL_IMPORTANT_SENDERS").split(",") if s.strip()
            ],
            email_important_keywords=[
                s.strip().lower() for s in _str("EMAIL_IMPORTANT_KEYWORDS").split(",") if s.strip()
            ],
            phone_enabled=_bool("PHONE_ENABLED", False),
            twilio_account_sid=_str("TWILIO_ACCOUNT_SID"),
            twilio_auth_token=_str("TWILIO_AUTH_TOKEN"),
            twilio_from_number=_str("TWILIO_FROM_NUMBER"),
            twilio_api_base=_str(
                "TWILIO_API_BASE", "https://api.twilio.com/2010-04-01").rstrip("/"),
            phone_my_number=_str("PHONE_MY_NUMBER"),
            phone_voice=_str("PHONE_VOICE", "Google.de-DE-Standard-B"),
            phone_language=_str("PHONE_LANGUAGE", "de-DE"),
            phone_max_attempts=_int("PHONE_MAX_ATTEMPTS", 3),
            phone_retry_minutes=_int("PHONE_RETRY_MINUTES", 15),
            phone_daily_limit=_int("PHONE_DAILY_LIMIT", 20),
            stt_engine=_str("STT_ENGINE", "twilio").lower(),
            whisper_model=_str("WHISPER_MODEL", "base"),
            whisper_binary=_str("WHISPER_BINARY", "whisper"),
            tts_engine=_str("TTS_ENGINE", "twilio").lower(),
            piper_binary=_str("PIPER_BINARY", "piper"),
            piper_voice=_str("PIPER_VOICE"),
            http_enabled=_bool("HTTP_ENABLED", True),
            http_host=_str("HTTP_HOST", "127.0.0.1"),
            http_port=_int("HTTP_PORT", 8765),
            http_api_token=_str("HTTP_API_TOKEN"),
            public_base_url=_str("PUBLIC_BASE_URL").rstrip("/"),
            quiet_hours_start=_str("QUIET_HOURS_START", "22:00", allow_empty=True),
            quiet_hours_end=_str("QUIET_HOURS_END", "07:00", allow_empty=True),
            scheduler_tick_seconds=_int("SCHEDULER_TICK_SECONDS", 20),
            backup_keep=_int("BACKUP_KEEP", 14),
            morning_briefing=_str("MORNING_BRIEFING", "07:30", allow_empty=True),
            confirmation_ttl_minutes=_int("CONFIRMATION_TTL_MINUTES", 15),
        )

    # ---------------------------------------------------------------------
    @property
    def tz(self) -> ZoneInfo:
        try:
            return ZoneInfo(self.timezone_name)
        except ZoneInfoNotFoundError:
            return ZoneInfo("UTC")

    @property
    def db_path(self) -> Path:
        return self.data_dir / "jarvis.sqlite3"

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backups"

    @property
    def secrets_dir(self) -> Path:
        return self.data_dir / "secrets"

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.backup_dir, self.secrets_dir, self.data_dir / "logs"):
            path.mkdir(parents=True, exist_ok=True)
        # Zugangsdaten sind nur fuer den eigenen Nutzer lesbar.
        try:
            self.secrets_dir.chmod(0o700)
        except OSError:
            pass

    # --- Selbstpruefung ---------------------------------------------------
    def missing_setup(self) -> list[SetupStep]:
        """Sammelt die Einrichtungsschritte, die noch offen sind."""
        steps: list[SetupStep] = []

        if not self.telegram_token:
            steps.append(SetupStep(
                "telegram_token", "Telegram-Token fehlt",
                "Bei @BotFather einen Bot anlegen und TELEGRAM_BOT_TOKEN in die .env schreiben.",
                blockierend=True,
            ))
        if not self.telegram_allowed_ids:
            steps.append(SetupStep(
                "telegram_ids", "Autorisierte Telegram-ID fehlt",
                "Eigene numerische ID (z. B. ueber @userinfobot) als TELEGRAM_ALLOWED_IDS eintragen. "
                "Ohne Eintrag nimmt Jarvis niemanden an.",
                blockierend=True,
            ))
        if self.ai_provider == "openai" and not self.openai_api_key:
            steps.append(SetupStep(
                "openai_key", "OpenAI-Schluessel fehlt", "OPENAI_API_KEY setzen oder AI_PROVIDER=ollama verwenden.",
                blockierend=True,
            ))
        if self.ai_provider == "anthropic" and not self.anthropic_api_key:
            steps.append(SetupStep(
                "anthropic_key", "Anthropic-Schluessel fehlt",
                "ANTHROPIC_API_KEY setzen oder AI_PROVIDER=ollama verwenden.",
                blockierend=True,
            ))
        if self.calendar_provider == "caldav" and not (self.caldav_url and self.caldav_user):
            steps.append(SetupStep(
                "caldav", "CalDAV-Zugang unvollstaendig",
                "CALDAV_URL, CALDAV_USER und CALDAV_PASSWORD setzen (Apple: app-spezifisches Passwort).",
            ))
        if self.calendar_provider == "google" and not (self.google_client_id and self.google_client_secret):
            steps.append(SetupStep(
                "google_oauth", "Google-Kalender noch nicht autorisiert",
                "In der Google Cloud Console eine OAuth-Client-ID (Typ 'Desktop') anlegen, "
                "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET setzen, dann 'jarvis google-login' ausfuehren.",
            ))
        if self.email_enabled and not (self.imap_host and self.imap_user and self.imap_password):
            steps.append(SetupStep(
                "email", "E-Mail-Konto noch nicht verbunden",
                "IMAP_HOST, IMAP_USER und IMAP_PASSWORD setzen (bei Gmail/iCloud ein App-Passwort).",
            ))
        if self.phone_enabled and not (
            self.twilio_account_sid and self.twilio_auth_token
            and self.twilio_from_number and self.phone_my_number
        ):
            steps.append(SetupStep(
                "phone", "Telefonie noch nicht konfiguriert",
                "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER und PHONE_MY_NUMBER setzen.",
            ))
        if self.phone_enabled and not self.public_base_url:
            steps.append(SetupStep(
                "public_url", "Oeffentliche URL fuer Telefonie fehlt",
                "PUBLIC_BASE_URL auf eine von aussen erreichbare HTTPS-Adresse setzen "
                "(z. B. ein Cloudflare- oder ngrok-Tunnel auf den HTTP-Port). "
                "Ohne sie kann Twilio keine Gespraeche an Jarvis zurueckgeben.",
            ))
        if self.http_enabled and not self.http_api_token:
            steps.append(SetupStep(
                "http_token", "API-Token fuer das Dashboard fehlt",
                "HTTP_API_TOKEN setzen (beliebige lange Zufallszeichenfolge). "
                "Bis dahin erlaubt die API nur Zugriffe von localhost.",
            ))
        return steps

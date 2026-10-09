"""Protokollierung.

Zwei Senken: Konsole (lesbar) und eine rotierende Datei unter
``<datadir>/logs/jarvis.log``. Zusaetzlich haengt sich ein Handler in die
Datenbank, damit das Dashboard und ``/system fehler`` die letzten Fehler
zeigen koennen, ohne Logdateien zu parsen.

Geheimnisse werden beim Formatieren entfernt: Tokens tauchen nie im Log auf.
"""

from __future__ import annotations

import logging
import logging.handlers
import re
from pathlib import Path

_SECRET_PATTERNS = [
    re.compile(r"(bot)?\d{6,12}:[A-Za-z0-9_\-]{30,}"),            # Telegram-Token
    re.compile(r"\bSK[a-f0-9]{28,36}\b", re.IGNORECASE),           # Twilio
    re.compile(r"\bAC[a-f0-9]{28,36}\b", re.IGNORECASE),           # Twilio Account
    re.compile(r"\bsk-[A-Za-z0-9_\-]{20,}"),                       # OpenAI/Anthropic
    re.compile(r"ya29\.[A-Za-z0-9_\-]{20,}"),                      # Google OAuth
    re.compile(r"\b1//[A-Za-z0-9_\-]{20,}"),                       # Google Refresh
]

REDACTED = "<entfernt>"


def redact(text: str) -> str:
    """Entfernt bekannte Geheimnis-Muster aus einem Text."""
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(REDACTED, text)
    return text


class _RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        return redact(super().format(record))


class DatabaseLogHandler(logging.Handler):
    """Schreibt WARNING und schlimmer in die Tabelle ``log``."""

    def __init__(self, database) -> None:
        super().__init__(level=logging.WARNING)
        self._db = database

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._db.execute(
                "INSERT INTO log (level, logger, message, created_at) "
                "VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
                (record.levelname, record.name, redact(self.format(record))),
            )
        except Exception:  # pragma: no cover - Logging darf nie werfen
            pass


def setup_logging(data_dir: Path, level: str = "INFO", console: bool = True) -> None:
    log_dir = data_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    for handler in list(root.handlers):
        root.removeHandler(handler)

    file_handler = logging.handlers.RotatingFileHandler(
        log_dir / "jarvis.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(
        _RedactingFormatter("%(asctime)s %(levelname)-7s %(name)-28s %(message)s")
    )
    root.addHandler(file_handler)

    if console:
        stream = logging.StreamHandler()
        stream.setFormatter(_RedactingFormatter("%(levelname)-7s %(name)-20s %(message)s"))
        root.addHandler(stream)

    # Fremdbibliotheken sollen nicht die Konsole fluten.
    for noisy in ("httpx", "httpcore", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def attach_database_handler(database) -> DatabaseLogHandler:
    handler = DatabaseLogHandler(database)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(handler)
    return handler

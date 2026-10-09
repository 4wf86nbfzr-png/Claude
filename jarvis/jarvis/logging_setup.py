"""Protokollierung.

Zwei Ziele gleichzeitig: eine rotierende Datei fuer die Nachschau und ein
Ringpuffer im Speicher, den das Dashboard anzeigen kann, ohne die Datei zu
lesen.

Zugangsdaten gehoeren nicht ins Protokoll. ``SecretFilter`` ersetzt bekannte
Geheimnisse und uebliche Schluesselmuster, bevor eine Zeile geschrieben wird --
eine Protokolldatei wird weitergegeben, eine Konfiguration nicht.
"""

from __future__ import annotations

import logging
import logging.handlers
import re
from collections import deque
from pathlib import Path

#: Muster, die wie ein Schluessel aussehen. Lieber zu viel ersetzen als zu wenig.
SECRET_PATTERNS = [
    re.compile(r"(?i)\b(sk-|ghp_|gho_|github_pat_|xoxb-|xoxp-)[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)\b(api[_-]?key|token|password|passwort|secret|bearer)"
               r"(\s*[:=]\s*|\s+)(\"|')?([^\s\"',]{6,})"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]+"),  # JWT
]

MASK = "***"


class SecretFilter(logging.Filter):
    """Ersetzt Geheimnisse in Nachricht und Argumenten."""

    def __init__(self, known: list[str] | None = None) -> None:
        super().__init__()
        # Kurze Werte ignorieren: 'de' oder '1' als Geheimnis wuerde das
        # halbe Protokoll schwaerzen.
        self._known = [k for k in (known or []) if len(k) >= 6]

    def redact(self, text: str) -> str:
        for geheim in self._known:
            text = text.replace(geheim, MASK)
        for muster in SECRET_PATTERNS:
            text = muster.sub(lambda m: _mask_match(m), text)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.redact(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._redact_value(v) for k, v in record.args.items()}
            else:
                record.args = tuple(self._redact_value(a) for a in record.args)
        return True

    def _redact_value(self, value):
        return self.redact(value) if isinstance(value, str) else value


def _mask_match(match: re.Match) -> str:
    """Behaelt den Schluesselnamen, ersetzt den Wert -- so bleibt die Zeile lesbar."""
    gruppen = match.groups()
    if len(gruppen) >= 4 and gruppen[1] is not None:
        return f"{gruppen[0]}{gruppen[1]}{MASK}"
    return MASK


class RingBufferHandler(logging.Handler):
    """Haelt die letzten Zeilen im Speicher fuer das Dashboard."""

    def __init__(self, capacity: int = 500) -> None:
        super().__init__()
        self.records: deque[dict] = deque(maxlen=capacity)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self.records.append({
                "time": record.created,
                "level": record.levelname,
                "logger": record.name,
                "message": record.getMessage(),
            })
        except Exception:  # noqa: BLE001 -- Protokollierung darf nie werfen
            self.handleError(record)

    def tail(self, limit: int = 100) -> list[dict]:
        return list(self.records)[-limit:]


#: Wird beim Einrichten gesetzt, damit das Dashboard herankommt.
RING = RingBufferHandler()


def setup(log_path: Path | None = None, level: str = "INFO",
          known_secrets: list[str] | None = None) -> RingBufferHandler:
    """Richtet die Protokollierung ein. Mehrfacher Aufruf ist unschaedlich."""
    root = logging.getLogger("jarvis")
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
    # Beim zweiten Aufruf (Tests, Neustart im Prozess) sonst doppelte Zeilen.
    for handler in list(root.handlers):
        root.removeHandler(handler)
        handler.close()

    geheim = SecretFilter(known_secrets)
    formatter = logging.Formatter(
        "%(asctime)s %(levelname)-7s %(name)-22s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    konsole = logging.StreamHandler()
    konsole.setFormatter(formatter)
    konsole.addFilter(geheim)
    root.addHandler(konsole)

    if log_path is not None:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        datei = logging.handlers.RotatingFileHandler(
            log_path, maxBytes=2_000_000, backupCount=3, encoding="utf-8")
        datei.setFormatter(formatter)
        datei.addFilter(geheim)
        root.addHandler(datei)

    RING.records.clear()
    RING.addFilter(geheim)
    root.addHandler(RING)
    root.propagate = False
    return RING


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"jarvis.{name}")

"""Proaktive Benachrichtigungen.

Alles geht nach Telegram. Drei Regeln halten den Kanal brauchbar:

1. **Nie doppelt.** Jede Meldung hat einen ``dedupe_key``; ist er bekannt,
   wird nichts mehr gesendet (``UNIQUE``-Spalte, also auch bei
   gleichzeitigen Versuchen nur einmal).
2. **Ruhezeiten.** Zwischen ``QUIET_HOURS_START`` und ``QUIET_HOURS_END``
   werden nur dringende Meldungen (Prioritaet 1) sofort zugestellt, der
   Rest wartet bis zum Morgen.
3. **Nur echte Ereignisse.** Der Aufrufer liefert den Anlass; hier wird
   nichts erfunden und nichts geraten.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from ..db.database import Database, iso, utcnow
from .timeutil import in_quiet_hours, to_local, to_utc

log = logging.getLogger(__name__)

Sender = Callable[[str, dict[str, Any] | None], Awaitable[bool]]

PRIORITY_URGENT = 1
PRIORITY_NORMAL = 3
PRIORITY_LOW = 5


@dataclass(slots=True)
class Notification:
    id: int
    dedupe_key: str
    kind: str
    text: str
    priority: int


class Notifier:
    def __init__(
        self, database: Database, tz: ZoneInfo, *,
        quiet_start: str = "22:00", quiet_end: str = "07:00",
        max_per_hour: int = 12,
    ) -> None:
        self.db = database
        self.tz = tz
        self.quiet_start = quiet_start
        self.quiet_end = quiet_end
        self.max_per_hour = max_per_hour
        self._sender: Sender | None = None
        self.muted = False

    def set_sender(self, sender: Sender) -> None:
        """Wird vom Telegram-Adapter gesetzt, sobald er laeuft."""
        self._sender = sender

    # ---------------------------------------------------------------------
    async def notify(
        self, dedupe_key: str, text: str, *, kind: str = "info",
        priority: int = PRIORITY_NORMAL, keyboard: dict[str, Any] | None = None,
        force: bool = False,
    ) -> bool:
        """Meldung zustellen. ``False``, wenn unterdrueckt oder verschoben."""
        if not text.strip():
            return False
        cursor = self.db.execute(
            "INSERT INTO notification (dedupe_key, kind, text, priority, created_at) "
            "VALUES (?, ?, ?, ?, ?) ON CONFLICT (dedupe_key) DO NOTHING",
            (dedupe_key, kind, text, priority, iso(utcnow())),
        )
        if not cursor.rowcount and not force:
            log.debug("Meldung %s schon bekannt -- nicht erneut gesendet", dedupe_key)
            return False
        notification_id = int(cursor.lastrowid or 0)

        if self.muted and priority > PRIORITY_URGENT:
            log.info("Stummschaltung aktiv, Meldung %s zurueckgehalten", dedupe_key)
            return False

        if not force and priority > PRIORITY_URGENT and self._is_quiet(utcnow()):
            # Nicht verwerfen, sondern auf das Ende der Ruhezeit legen.
            log.info("Ruhezeit -- Meldung %s wird spaeter zugestellt", dedupe_key)
            return False

        if not force and self._too_many_recently():
            log.warning("Zu viele Meldungen in der letzten Stunde -- %s zurueckgehalten", dedupe_key)
            return False

        return await self._send(notification_id, text, keyboard)

    async def _send(self, notification_id: int, text: str, keyboard: dict[str, Any] | None) -> bool:
        if self._sender is None:
            log.warning("Kein Zustellweg verfuegbar -- Meldung bleibt in der Warteschlange")
            return False
        try:
            ok = await self._sender(text, keyboard)
        except Exception as exc:
            log.error("Meldung konnte nicht zugestellt werden: %s", exc)
            return False
        if ok and notification_id:
            self.db.execute(
                "UPDATE notification SET sent_at = ? WHERE id = ?", (iso(utcnow()), notification_id)
            )
        return bool(ok)

    async def flush_pending(self, limit: int = 20) -> int:
        """Zurueckgehaltene Meldungen zustellen (nach der Ruhezeit, nach Neustart)."""
        if self._is_quiet(utcnow()) or self.muted:
            return 0
        rows = self.db.query(
            "SELECT id, text, dedupe_key FROM notification WHERE sent_at IS NULL "
            "AND created_at >= ? ORDER BY priority, id LIMIT ?",
            (iso(utcnow() - timedelta(days=2)), limit),
        )
        sent = 0
        for row in rows:
            if await self._send(row["id"], row["text"], None):
                sent += 1
        if sent:
            log.info("%s zurueckgehaltene Meldungen nachgeliefert", sent)
        return sent

    # ---------------------------------------------------------------------
    def _is_quiet(self, moment: datetime) -> bool:
        return in_quiet_hours(moment, self.tz, self.quiet_start, self.quiet_end)

    def next_active_time(self, moment: datetime | None = None) -> datetime:
        """Wann wieder zugestellt werden darf (Ende der Ruhezeit)."""
        moment = moment or utcnow()
        if not self._is_quiet(moment):
            return moment
        try:
            hour, minute = (int(x) for x in self.quiet_end.split(":")[:2])
        except ValueError:
            return moment
        local = to_local(moment, self.tz)
        candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= local:
            candidate += timedelta(days=1)
        return to_utc(candidate.replace(tzinfo=None), self.tz)

    def _too_many_recently(self) -> int:
        count = int(self.db.scalar(
            "SELECT COUNT(*) FROM notification WHERE sent_at >= ?",
            (iso(utcnow() - timedelta(hours=1)),),
        ) or 0)
        return count >= self.max_per_hour

    def recent(self, limit: int = 20) -> list[dict[str, Any]]:
        rows = self.db.query(
            "SELECT id, dedupe_key, kind, text, priority, sent_at, created_at "
            "FROM notification ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        return [dict(r) for r in rows]

    def purge_old(self, days: int = 30) -> int:
        return self.db.execute(
            "DELETE FROM notification WHERE created_at < ?",
            (iso(utcnow() - timedelta(days=days)),),
        ).rowcount or 0

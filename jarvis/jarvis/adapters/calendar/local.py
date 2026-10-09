"""Lokaler Kalender in der Jarvis-Datenbank.

Der Standard, solange kein externer Kalender verbunden ist: Jarvis kann
sofort Termine verwalten, ohne auf eine OAuth-Freigabe zu warten. Dient
ausserdem als Zwischenspeicher der externen Anbieter (dieselbe Tabelle,
Spalte ``provider``).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any

from ...db.database import Database, iso, parse_iso, utcnow
from ...errors import ToolError
from .base import CalendarAdapter, CalendarEvent

log = logging.getLogger(__name__)


def _row_to_event(row) -> CalendarEvent:
    return CalendarEvent(
        uid=row["uid"], title=row["title"],
        start=parse_iso(row["start_at"]) or utcnow(),
        end=parse_iso(row["end_at"]) or utcnow(),
        all_day=bool(row["all_day"]), location=row["location"],
        description=row["description"], calendar_id=row["calendar_id"],
        provider=row["provider"], etag=row["etag"],
    )


class LocalCalendar(CalendarAdapter):
    name = "local"

    def __init__(self, database: Database, calendar_id: str = "jarvis") -> None:
        self.db = database
        self.calendar_id = calendar_id

    async def list_events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        rows = self.db.query(
            "SELECT * FROM calendar_event WHERE provider = ? AND deleted = 0 "
            "AND end_at >= ? AND start_at <= ? ORDER BY start_at",
            (self.name, iso(start), iso(end)),
        )
        return [_row_to_event(r) for r in rows]

    async def get_event(self, uid: str) -> CalendarEvent | None:
        row = self.db.query_one(
            "SELECT * FROM calendar_event WHERE provider = ? AND uid = ? AND deleted = 0",
            (self.name, uid),
        )
        return _row_to_event(row) if row else None

    async def create_event(self, event: CalendarEvent) -> CalendarEvent:
        uid = event.uid or f"jarvis-{uuid.uuid4().hex[:16]}"
        now = iso(utcnow())
        self.db.execute(
            "INSERT INTO calendar_event (uid, provider, calendar_id, title, start_at, end_at, "
            "all_day, location, description, etag, deleted, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, ?, ?) "
            "ON CONFLICT (provider, uid) DO UPDATE SET title = excluded.title, "
            "start_at = excluded.start_at, end_at = excluded.end_at, "
            "all_day = excluded.all_day, location = excluded.location, "
            "description = excluded.description, deleted = 0, updated_at = excluded.updated_at",
            (uid, self.name, event.calendar_id or self.calendar_id, event.title,
             iso(event.start), iso(event.end), 1 if event.all_day else 0,
             event.location, event.description, now, now),
        )
        # Nachlesen: erst damit gilt der Termin als angelegt.
        created = await self.get_event(uid)
        if created is None:
            raise ToolError("Der Termin konnte nicht gespeichert werden.")
        return created

    async def update_event(self, uid: str, **changes: Any) -> CalendarEvent:
        existing = await self.get_event(uid)
        if existing is None:
            raise ToolError(f"Einen Termin mit der Kennung '{uid}' gibt es hier nicht.")
        mapping = {
            "title": "title", "titel": "title", "location": "location", "ort": "location",
            "description": "description", "beschreibung": "description",
        }
        values: dict[str, Any] = {}
        for key, value in changes.items():
            if value is None:
                continue
            if key in mapping:
                values[mapping[key]] = value
            elif key in {"start", "beginn"}:
                values["start_at"] = iso(value)
            elif key in {"end", "ende"}:
                values["end_at"] = iso(value)
            elif key in {"all_day", "ganztaegig"}:
                values["all_day"] = 1 if value else 0
        if not values:
            return existing
        values["updated_at"] = iso(utcnow())
        assignments = ", ".join(f"{k} = ?" for k in values)
        self.db.execute(
            f"UPDATE calendar_event SET {assignments} WHERE provider = ? AND uid = ?",
            [*values.values(), self.name, uid],
        )
        updated = await self.get_event(uid)
        if updated is None:
            raise ToolError("Die Aenderung wurde nicht gespeichert.")
        return updated

    async def delete_event(self, uid: str) -> bool:
        cursor = self.db.execute(
            "UPDATE calendar_event SET deleted = 1, updated_at = ? "
            "WHERE provider = ? AND uid = ? AND deleted = 0",
            (iso(utcnow()), self.name, uid),
        )
        if not cursor.rowcount:
            # Entweder gab es den Termin nie, oder er war schon weg -- beides ist
            # kein Erfolg dieser Aktion.
            return False
        # Gegenpruefung: der Termin darf nicht mehr auffindbar sein.
        return await self.get_event(uid) is None

    async def health(self) -> tuple[bool, str]:
        count = int(self.db.scalar(
            "SELECT COUNT(*) FROM calendar_event WHERE provider = ? AND deleted = 0", (self.name,)
        ) or 0)
        return True, f"Lokaler Kalender, {count} Termine gespeichert"

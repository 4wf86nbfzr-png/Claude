"""Kalender-Schnittstelle.

Alle Anbieter liefern und nehmen ``CalendarEvent``. Wichtig ist die Regel:
**jede Aenderung wird nachgelesen.** ``create``/``update``/``delete`` gelten
erst als erfolgreich, wenn der Anbieter den neuen Stand bestaetigt --
sonst meldet Jarvis einen Fehler statt eines erfundenen Erfolgs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from ...core.timeutil import format_local, to_local


@dataclass(slots=True)
class CalendarEvent:
    uid: str
    title: str
    start: datetime
    end: datetime
    all_day: bool = False
    location: str = ""
    description: str = ""
    calendar_id: str = ""
    provider: str = "local"
    etag: str = ""
    extra: dict[str, Any] = field(default_factory=dict)

    def duration(self) -> timedelta:
        return self.end - self.start

    def line(self, tz: ZoneInfo) -> str:
        if self.all_day:
            when = to_local(self.start, tz).strftime("%d.%m.") + " (ganztaegig)"
        else:
            start_local = to_local(self.start, tz)
            end_local = to_local(self.end, tz)
            when = f"{format_local(self.start, tz)}–{end_local.strftime('%H:%M')}"
            if start_local.date() != end_local.date():
                when = f"{format_local(self.start, tz)} bis {format_local(self.end, tz)}"
        parts = [f"{when}  {self.title}"]
        if self.location:
            parts.append(f"({self.location})")
        return " ".join(parts)

    def as_dict(self, tz: ZoneInfo | None = None) -> dict[str, Any]:
        data = {
            "uid": self.uid, "titel": self.title,
            "beginn": self.start.isoformat(), "ende": self.end.isoformat(),
            "ganztaegig": self.all_day, "ort": self.location,
            "beschreibung": self.description[:500], "kalender": self.calendar_id,
            "anbieter": self.provider,
        }
        if tz is not None:
            data["beginn_lokal"] = to_local(self.start, tz).strftime("%d.%m.%Y %H:%M")
            data["ende_lokal"] = to_local(self.end, tz).strftime("%d.%m.%Y %H:%M")
        return data


class CalendarAdapter:
    """Basis aller Kalenderanbieter."""

    name = "basis"
    writable = True

    async def list_events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        raise NotImplementedError

    async def create_event(self, event: CalendarEvent) -> CalendarEvent:
        raise NotImplementedError

    async def update_event(self, uid: str, **changes: Any) -> CalendarEvent:
        raise NotImplementedError

    async def delete_event(self, uid: str) -> bool:
        raise NotImplementedError

    async def get_event(self, uid: str) -> CalendarEvent | None:
        raise NotImplementedError

    async def health(self) -> tuple[bool, str]:
        raise NotImplementedError

    async def close(self) -> None:
        return None

    # --- gemeinsame Hilfen ------------------------------------------------
    async def find_events(
        self, query: str, *, start: datetime, end: datetime, limit: int = 10
    ) -> list[CalendarEvent]:
        """Termine nach Stichwort. Ohne Stichwort: alle im Zeitraum."""
        events = await self.list_events(start, end)
        if not query:
            return events[:limit]
        needle = query.strip().lower()
        hits = [
            e for e in events
            if needle in e.title.lower() or needle in e.location.lower()
            or needle in e.description.lower() or needle == e.uid
        ]
        return hits[:limit]

    async def free_slots(
        self, start: datetime, end: datetime, *, minimum_minutes: int = 30,
        tz: ZoneInfo | None = None, day_start_hour: int = 8, day_end_hour: int = 19,
    ) -> list[tuple[datetime, datetime]]:
        """Freie Zeitfenster innerhalb der Arbeitszeiten."""
        events = [e for e in await self.list_events(start, end) if not e.all_day]
        events.sort(key=lambda e: e.start)
        slots: list[tuple[datetime, datetime]] = []
        minimum = timedelta(minutes=minimum_minutes)

        day = start
        while day <= end:
            local_day = to_local(day, tz) if tz else day
            window_start = local_day.replace(
                hour=day_start_hour, minute=0, second=0, microsecond=0
            )
            window_end = local_day.replace(hour=day_end_hour, minute=0, second=0, microsecond=0)
            cursor = max(window_start.astimezone(start.tzinfo or window_start.tzinfo), start)
            limit = min(window_end.astimezone(cursor.tzinfo), end)
            for event in events:
                if event.end <= cursor or event.start >= limit:
                    continue
                if event.start - cursor >= minimum:
                    slots.append((cursor, event.start))
                cursor = max(cursor, event.end)
            if limit - cursor >= minimum:
                slots.append((cursor, limit))
            day = day + timedelta(days=1)
        return slots

"""Terminvorschläge aus Geschäftszeiten minus belegte Zeiten (interne Termine + optional Google-Kalender)."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.models.core import Tenant
from app.models.crm import Appointment

DEFAULT_HOURS = {
    "mon": [["08:00", "16:00"]],
    "tue": [["08:00", "16:00"]],
    "wed": [["08:00", "16:00"]],
    "thu": [["08:00", "16:00"]],
    "fri": [["08:00", "14:00"]],
    "sat": [],
    "sun": [],
}
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
DAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]


def _parse(t: str) -> time:
    h, m = t.split(":")
    return time(int(h), int(m))


async def busy_intervals(db: AsyncSession, tenant_id: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    rows = (
        (
            await db.execute(
                select(Appointment).where(
                    Appointment.tenant_id == tenant_id,
                    Appointment.status.in_(["proposed", "confirmed"]),
                    Appointment.ends_at > start,
                    Appointment.starts_at < end,
                )
            )
        )
        .scalars()
        .all()
    )
    return [(a.starts_at, a.ends_at) for a in rows]


async def propose_slots(
    db: AsyncSession,
    tenant: Tenant,
    *,
    duration_minutes: int = 60,
    count: int = 3,
    days_ahead: int = 10,
    earliest: datetime | None = None,
    external_busy: list[tuple[datetime, datetime]] | None = None,
) -> list[dict]:
    """Freie Slots in Geschäftszeiten, frühestens am nächsten Werktag (Betrieb braucht Vorlauf)."""
    tz = ZoneInfo(tenant.timezone or "Europe/Berlin")
    hours = tenant.business_hours or DEFAULT_HOURS
    lead = tenant.settings.get("appointment_lead_hours", 20)
    start_search = (earliest or utcnow()) + timedelta(hours=lead)
    end_search = start_search + timedelta(days=days_ahead)
    busy = await busy_intervals(db, tenant.id, start_search, end_search)
    busy += external_busy or []
    slots: list[dict] = []
    day = start_search.astimezone(tz).date()
    step = timedelta(minutes=30)
    dur = timedelta(minutes=duration_minutes)
    for _ in range(days_ahead + 1):
        for window in hours.get(DAYS[day.weekday()], []):
            w_start = datetime.combine(day, _parse(window[0]), tz)
            w_end = datetime.combine(day, _parse(window[1]), tz)
            cursor = w_start
            while cursor + dur <= w_end:
                if cursor >= start_search and not any(b0 < cursor + dur and b1 > cursor for b0, b1 in busy):
                    # Max. ein Slot pro Tag, damit Vorschläge über mehrere Tage streuen
                    slots.append(
                        {
                            "starts_at": cursor.isoformat(),
                            "ends_at": (cursor + dur).isoformat(),
                            "label": f"{DAY_LABELS[cursor.weekday()]}, {cursor.strftime('%d.%m.%Y um %H:%M')} Uhr",
                        }
                    )
                    break
                cursor += step
            if len(slots) >= count:
                return slots
        day += timedelta(days=1)
    return slots

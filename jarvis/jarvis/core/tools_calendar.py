"""Kalender-Werkzeuge.

Anlegen geht ohne Rueckfrage (es nimmt niemandem etwas weg). Verschieben
und Loeschen sind Stufe 2 und laufen ueber eine Bestaetigung -- und zwar
mit einer *eindeutig benannten* Kennung, damit nicht der falsche Termin
erwischt wird.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from ..adapters.calendar.base import CalendarEvent
from ..db.database import utcnow
from ..errors import JarvisError
from .timeutil import format_local, parse_when, to_local, to_utc
from .toolkit import ToolResult, int_field, schema, text_field
from .tools_builtin import confirmed

if TYPE_CHECKING:
    from .services import Services

log = logging.getLogger(__name__)


def _day_bounds(services: "Services", raw: str, days: int = 1):
    tz = services.settings.tz
    base = parse_when(raw, tz, default_time=None) if raw else utcnow()
    if base is None:
        base = utcnow()
    local = to_local(base, tz)
    start = to_utc(local.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None), tz)
    return start, start + timedelta(days=max(1, days))


def register(services: "Services") -> None:
    tz = services.settings.tz

    async def termine_anzeigen(zeitraum: str = "heute", tage: int = 1) -> ToolResult:
        start, end = _day_bounds(services, zeitraum, tage)
        try:
            events = await services.calendar.list_events(start, end)
        except JarvisError as exc:
            return ToolResult.failure(f"Der Kalender antwortet nicht: {exc.message}")
        if not events:
            return ToolResult.success(
                f"Keine Termine {('heute' if tage == 1 and not zeitraum else 'im Zeitraum')}.",
                anzahl=0, termine=[],
            )
        return ToolResult.success(
            "\n".join(f"• {e.line(tz)}" for e in events), anzahl=len(events),
            termine=[e.as_dict(tz) for e in events],
        )

    services.toolkit.register(
        "termine_anzeigen", "Zeigt die Termine eines Tages oder Zeitraums.",
        schema(zeitraum=text_field("Welcher Tag, z. B. 'heute', 'morgen', '5.11.'"),
               tage=int_field("Wie viele Tage ab da (Standard 1, Woche = 7)")),
        termine_anzeigen, category="kalender",
    )

    async def termin_anlegen(
        titel: str, beginn: str, ende: str = "", dauer_minuten: int = 60,
        ort: str = "", beschreibung: str = "", ganztaegig: bool = False,
    ) -> ToolResult:
        start = parse_when(beginn, tz)
        if start is None:
            return ToolResult.failure(
                f"Den Beginn '{beginn}' verstehe ich nicht. Bitte Tag und Uhrzeit nennen."
            )
        end = parse_when(ende, tz) if ende else None
        if end is None:
            end = start + timedelta(minutes=max(5, dauer_minuten or 60))
        if end <= start:
            return ToolResult.failure("Das Ende liegt vor dem Beginn.")
        event = CalendarEvent(
            uid="", title=titel.strip(), start=start, end=end, all_day=bool(ganztaegig),
            location=ort.strip(), description=beschreibung.strip(),
        )
        try:
            created = await services.calendar.create_event(event)
        except JarvisError as exc:
            return ToolResult.failure(f"Der Termin wurde nicht angelegt: {exc.message}")
        services.memory.remember_event(
            "termin_angelegt", created.title,
            {"uid": created.uid, "beginn": created.start.isoformat(),
             "anbieter": services.calendar.name},
        )
        return ToolResult.success(
            f"Termin steht: {created.line(tz)}", uid=created.uid, titel=created.title,
            beginn=format_local(created.start, tz),
        )

    services.toolkit.register(
        "termin_anlegen", "Legt einen Termin im Kalender an.",
        schema(
            titel=text_field("Titel des Termins", pflicht=True),
            beginn=text_field("Beginn, z. B. 'morgen 14:00'", pflicht=True),
            ende=text_field("Ende (sonst ueber dauer_minuten)"),
            dauer_minuten=int_field("Dauer in Minuten (Standard 60)"),
            ort=text_field("Ort"),
            beschreibung=text_field("Notiz zum Termin"),
            ganztaegig=text_field("true, wenn ganztaegig"),
        ),
        termin_anlegen, category="kalender",
    )

    async def termin_suchen(stichwort: str = "", zeitraum: str = "", tage: int = 14) -> ToolResult:
        start, end = _day_bounds(services, zeitraum, tage)
        try:
            events = await services.calendar.find_events(
                stichwort, start=start, end=end, limit=10
            )
        except JarvisError as exc:
            return ToolResult.failure(f"Der Kalender antwortet nicht: {exc.message}")
        if not events:
            return ToolResult.success(
                f"Nichts gefunden zu '{stichwort}' in den naechsten {tage} Tagen.", anzahl=0
            )
        lines = [f"• {e.line(tz)}  [Kennung: {e.uid}]" for e in events]
        return ToolResult.success(
            "\n".join(lines), anzahl=len(events), termine=[e.as_dict(tz) for e in events]
        )

    services.toolkit.register(
        "termin_suchen",
        "Sucht Termine nach Stichwort und liefert deren Kennung "
        "(die man zum Verschieben oder Loeschen braucht).",
        schema(stichwort=text_field("Suchwort (leer = alle im Zeitraum)"),
               zeitraum=text_field("Ab wann gesucht wird"),
               tage=int_field("Wie viele Tage (Standard 14)")),
        termin_suchen, category="kalender",
    )

    async def freie_zeiten(
        zeitraum: str = "heute", tage: int = 1, mindestens_minuten: int = 30,
    ) -> ToolResult:
        start, end = _day_bounds(services, zeitraum, tage)
        try:
            slots = await services.calendar.free_slots(
                start, end, minimum_minutes=mindestens_minuten, tz=tz
            )
        except JarvisError as exc:
            return ToolResult.failure(f"Der Kalender antwortet nicht: {exc.message}")
        slots = [(a, b) for a, b in slots if b > utcnow()]
        if not slots:
            return ToolResult.success("Keine freien Fenster in dem Zeitraum.", anzahl=0)
        lines = [
            f"• {format_local(a, tz)} – {to_local(b, tz).strftime('%H:%M')} "
            f"({int((b - a).total_seconds() // 60)} Min)"
            for a, b in slots[:12]
        ]
        return ToolResult.success("\n".join(lines), anzahl=len(slots))

    services.toolkit.register(
        "freie_zeiten", "Findet freie Zeitfenster (werktags 8–19 Uhr).",
        schema(zeitraum=text_field("Ab wann"), tage=int_field("Wie viele Tage"),
               mindestens_minuten=int_field("Mindestlaenge eines Fensters")),
        freie_zeiten, category="kalender",
    )

    # --- Verschieben und Loeschen: Stufe 2 --------------------------------
    async def _resolve(stichwort: str) -> tuple[CalendarEvent | None, list[CalendarEvent], str]:
        start = utcnow() - timedelta(days=1)
        end = utcnow() + timedelta(days=120)
        try:
            events = await services.calendar.find_events(stichwort, start=start, end=end, limit=8)
        except JarvisError as exc:
            return None, [], exc.message
        if len(events) == 1:
            return events[0], events, ""
        return None, events, ""

    async def termin_verschieben(
        termin: str, neuer_beginn: str, neues_ende: str = "", chat_id: str = "",
    ) -> ToolResult:
        event, candidates, error = await _resolve(termin)
        if error:
            return ToolResult.failure(f"Der Kalender antwortet nicht: {error}")
        if event is None:
            if not candidates:
                return ToolResult.failure(f"Keinen Termin zu '{termin}' gefunden.")
            return ToolResult.failure(
                "Mehrere Termine passen. Welcher ist gemeint?\n"
                + "\n".join(f"• {e.line(tz)} [{e.uid}]" for e in candidates[:5]),
                mehrdeutig=[e.uid for e in candidates[:5]],
            )
        start = parse_when(neuer_beginn, tz)
        if start is None:
            return ToolResult.failure(f"Den neuen Beginn '{neuer_beginn}' verstehe ich nicht.")
        end = parse_when(neues_ende, tz) if neues_ende else start + event.duration()
        request = services.permissions.request(
            "termin_aendern",
            {"uid": event.uid, "beginn": start.isoformat(), "ende": end.isoformat(),
             "titel": event.title},
            summary=f"'{event.title}' von {format_local(event.start, tz)} "
                    f"auf {format_local(start, tz)} verschieben",
            chat_id=chat_id,
        )
        return ToolResult(
            ok=True,
            text=f"Ich verschiebe „{event.title}“ von {format_local(event.start, tz)} "
                 f"auf {format_local(start, tz)}. Einverstanden?",
            confirmation_token=request.token,
            buttons=[("Ja, verschieben", f"bestaetigen:{request.token}"),
                     ("Abbrechen", f"ablehnen:{request.token}")],
        )

    services.toolkit.register(
        "termin_verschieben",
        "Verschiebt einen Termin. Fragt vorher nach, weil es den Kalender aendert.",
        schema(termin=text_field("Stichwort oder Kennung des Termins", pflicht=True),
               neuer_beginn=text_field("Neuer Beginn", pflicht=True),
               neues_ende=text_field("Neues Ende (sonst gleiche Dauer)")),
        termin_verschieben, action="termin_aendern", category="kalender",
    )

    @confirmed("termin_aendern")
    async def _execute_move(services: "Services", payload: dict[str, Any]) -> ToolResult:
        from datetime import datetime
        uid = str(payload.get("uid", ""))
        start = datetime.fromisoformat(str(payload["beginn"]))
        end = datetime.fromisoformat(str(payload["ende"]))
        try:
            updated = await services.calendar.update_event(uid, start=start, end=end)
        except JarvisError as exc:
            return ToolResult.failure(f"Verschieben fehlgeschlagen: {exc.message}")
        services.memory.remember_event(
            "termin_verschoben", updated.title,
            {"uid": uid, "neuer_beginn": updated.start.isoformat()},
        )
        return ToolResult.success(
            f"Verschoben, bestaetigt vom Kalender: {updated.line(services.settings.tz)}"
        )

    async def termin_loeschen(termin: str, chat_id: str = "") -> ToolResult:
        event, candidates, error = await _resolve(termin)
        if error:
            return ToolResult.failure(f"Der Kalender antwortet nicht: {error}")
        if event is None:
            if not candidates:
                return ToolResult.failure(f"Keinen Termin zu '{termin}' gefunden.")
            return ToolResult.failure(
                "Mehrere Termine passen. Welcher soll weg?\n"
                + "\n".join(f"• {e.line(tz)} [{e.uid}]" for e in candidates[:5])
            )
        request = services.permissions.request(
            "termin_loeschen", {"uid": event.uid, "titel": event.title},
            summary=f"Termin '{event.title}' am {format_local(event.start, tz)} loeschen",
            chat_id=chat_id,
        )
        return ToolResult(
            ok=True,
            text=f"Soll „{event.title}“ am {format_local(event.start, tz)} "
                 "wirklich geloescht werden?",
            confirmation_token=request.token,
            buttons=[("Ja, loeschen", f"bestaetigen:{request.token}"),
                     ("Abbrechen", f"ablehnen:{request.token}")],
        )

    services.toolkit.register(
        "termin_loeschen", "Loescht einen Termin. Fragt vorher nach.",
        schema(termin=text_field("Stichwort oder Kennung", pflicht=True)),
        termin_loeschen, action="termin_loeschen", category="kalender",
    )

    @confirmed("termin_loeschen")
    async def _execute_delete(services: "Services", payload: dict[str, Any]) -> ToolResult:
        uid = str(payload.get("uid", ""))
        title = str(payload.get("titel", "Termin"))
        try:
            removed = await services.calendar.delete_event(uid)
        except JarvisError as exc:
            return ToolResult.failure(f"Loeschen fehlgeschlagen: {exc.message}")
        if not removed:
            return ToolResult.failure(
                "Der Kalender meldet den Termin weiterhin -- ich verbuche ihn nicht als geloescht."
            )
        services.memory.remember_event("termin_geloescht", title, {"uid": uid})
        return ToolResult.success(f"„{title}“ ist geloescht (vom Kalender bestaetigt).")

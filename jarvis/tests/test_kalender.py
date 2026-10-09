"""Kalender: lokaler Anbieter, Nachlesen von Aenderungen, CalDAV-Parser."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from jarvis.adapters.calendar.base import CalendarEvent
from jarvis.adapters.calendar.caldav import build_vevent, parse_vevent
from jarvis.adapters.calendar.local import LocalCalendar
from jarvis.db.database import utcnow


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def kalender(database):
    return LocalCalendar(database)


def test_anlegen_wird_nachgelesen(kalender):
    beginn = utcnow() + timedelta(days=1)
    angelegt = run(kalender.create_event(CalendarEvent(
        uid="", title="Personalplanung", start=beginn, end=beginn + timedelta(hours=1),
        location="Buero Hamburg",
    )))
    assert angelegt.uid
    # Entscheidend: der Termin kommt aus der Quelle zurueck, nicht aus der Eingabe.
    gelesen = run(kalender.get_event(angelegt.uid))
    assert gelesen is not None
    assert gelesen.title == "Personalplanung"
    assert gelesen.location == "Buero Hamburg"


def test_zeitraum_abfrage(kalender):
    heute = utcnow()
    run(kalender.create_event(CalendarEvent(
        uid="a", title="Heute", start=heute + timedelta(hours=1),
        end=heute + timedelta(hours=2))))
    run(kalender.create_event(CalendarEvent(
        uid="b", title="Naechste Woche", start=heute + timedelta(days=8),
        end=heute + timedelta(days=8, hours=1))))
    heutige = run(kalender.list_events(heute, heute + timedelta(days=1)))
    assert [e.title for e in heutige] == ["Heute"]


def test_verschieben_und_loeschen_werden_bestaetigt(kalender):
    beginn = utcnow() + timedelta(days=2)
    event = run(kalender.create_event(CalendarEvent(
        uid="", title="Zahnarzt", start=beginn, end=beginn + timedelta(minutes=30))))

    neuer_beginn = beginn + timedelta(days=7)
    verschoben = run(kalender.update_event(event.uid, start=neuer_beginn,
                                           end=neuer_beginn + timedelta(minutes=30)))
    assert abs((verschoben.start - neuer_beginn).total_seconds()) < 2

    assert run(kalender.delete_event(event.uid)) is True
    assert run(kalender.get_event(event.uid)) is None
    # Ein zweites Loeschen meldet ehrlich "nichts passiert".
    assert run(kalender.delete_event(event.uid)) is False


def test_suche_nach_stichwort(kalender):
    beginn = utcnow() + timedelta(days=1)
    run(kalender.create_event(CalendarEvent(
        uid="x", title="Zahnarzt Dr. Meyer", start=beginn, end=beginn + timedelta(hours=1))))
    run(kalender.create_event(CalendarEvent(
        uid="y", title="Teambesprechung", start=beginn + timedelta(hours=3),
        end=beginn + timedelta(hours=4))))
    treffer = run(kalender.find_events(
        "zahnarzt", start=utcnow(), end=utcnow() + timedelta(days=3)))
    assert len(treffer) == 1
    assert treffer[0].uid == "x"


def test_freie_zeiten_beruecksichtigen_termine(kalender):
    from zoneinfo import ZoneInfo
    tz = ZoneInfo("Europe/Berlin")
    tag = datetime(2026, 10, 12, 0, 0, tzinfo=timezone.utc)   # Montag
    run(kalender.create_event(CalendarEvent(
        uid="t1", title="Besprechung",
        start=datetime(2026, 10, 12, 8, 0, tzinfo=timezone.utc),    # 10:00 Ortszeit
        end=datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc))))
    fenster = run(kalender.free_slots(
        tag, tag + timedelta(days=1), minimum_minutes=30, tz=tz))
    assert fenster
    # Kein Fenster darf sich mit dem Termin ueberschneiden.
    for anfang, ende in fenster:
        assert not (anfang < datetime(2026, 10, 12, 9, 0, tzinfo=timezone.utc)
                    and ende > datetime(2026, 10, 12, 8, 0, tzinfo=timezone.utc))


def test_caldav_parser_und_erzeuger():
    ics = (
        "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abc-123\r\n"
        "DTSTART;TZID=Europe/Berlin:20261110T090000\r\n"
        "DTEND;TZID=Europe/Berlin:20261110T100000\r\n"
        "SUMMARY:Personalplanung November\r\nLOCATION:Buero\r\n"
        "DESCRIPTION:Mit Alex\\, kurz\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )
    event = parse_vevent(ics)
    assert event.uid == "abc-123"
    assert event.title == "Personalplanung November"
    assert event.description == "Mit Alex, kurz"
    assert event.start == datetime(2026, 11, 10, 8, 0, tzinfo=timezone.utc)

    erzeugt = build_vevent(event)
    assert "SUMMARY:Personalplanung November" in erzeugt
    # Sonderzeichen muessen maskiert sein, sonst zerbricht die Datei.
    assert "Mit Alex\\, kurz" in erzeugt
    wieder = parse_vevent(erzeugt)
    assert wieder.title == event.title and wieder.start == event.start


def test_ganztaegige_termine():
    ics = (
        "BEGIN:VEVENT\r\nUID:g1\r\nDTSTART;VALUE=DATE:20261224\r\n"
        "DTEND;VALUE=DATE:20261225\r\nSUMMARY:Heiligabend\r\nEND:VEVENT"
    )
    event = parse_vevent(ics)
    assert event.all_day is True
    assert event.start.strftime("%Y-%m-%d") == "2026-12-24"

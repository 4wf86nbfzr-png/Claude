"""Zeitangaben -- das Nadeloehr fuer Erinnerungen."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from jarvis.core.timeutil import (
    describe_recurrence, format_local, in_quiet_hours, is_vague_time,
    next_occurrence, parse_recurrence, parse_when,
)

TZ = ZoneInfo("Europe/Berlin")
# Freitag, 9. Oktober 2026, 16:30 Ortszeit
REFERENCE = datetime(2026, 10, 9, 14, 30, tzinfo=timezone.utc)


@pytest.mark.parametrize("eingabe,erwartet", [
    ("morgen 8:30", "2026-10-10 08:30"),
    ("in 10 minuten", "2026-10-09 16:40"),
    ("in 2 stunden", "2026-10-09 18:30"),
    ("heute 23:00", "2026-10-09 23:00"),
    ("uebermorgen 9 uhr", "2026-10-11 09:00"),
    ("naechsten montag 9:00", "2026-10-12 09:00"),
    ("2026-11-05T09:00:00", "2026-11-05 09:00"),
    ("5.11. um 14:00", "2026-11-05 14:00"),
    ("17.12.2026 8 uhr", "2026-12-17 08:00"),
    ("morgen frueh", "2026-10-10 07:00"),
])
def test_parse_when(eingabe, erwartet):
    moment = parse_when(eingabe, TZ, reference=REFERENCE)
    assert moment is not None, eingabe
    assert moment.astimezone(TZ).strftime("%Y-%m-%d %H:%M") == erwartet


def test_unverstaendliche_angabe_wird_nicht_geraten():
    assert parse_when("irgendwann mal", TZ, reference=REFERENCE) is None
    assert parse_when("", TZ) is None


def test_datum_wird_nicht_als_uhrzeit_gelesen():
    moment = parse_when("5.11.", TZ, reference=REFERENCE)
    assert moment.astimezone(TZ).strftime("%H:%M") == "09:00"


def test_vage_angaben_werden_erkannt():
    assert is_vague_time("morgen frueh")
    assert is_vague_time("heute abend")
    assert not is_vague_time("morgen 8:30")
    assert not is_vague_time("in 10 minuten")


def test_wiederholungen():
    assert parse_recurrence("jeden Montag") == "woechentlich:mo"
    assert parse_recurrence("taeglich") == "taeglich"
    assert parse_recurrence("wochentags") == "wochentags"
    assert parse_recurrence("monatlich am 5") == "monatlich:5"
    assert parse_recurrence("nein") == ""
    assert describe_recurrence("woechentlich:mo") == "jeden Montag"


def test_naechstes_vorkommen_ueberspringt_wochenende():
    following = next_occurrence("wochentags", REFERENCE, TZ)   # Freitag
    assert following.astimezone(TZ).strftime("%A") in {"Monday"}


def test_ruhezeit_ueber_mitternacht():
    nacht = datetime(2026, 10, 9, 21, 0, tzinfo=timezone.utc)   # 23:00 Ortszeit
    tag = datetime(2026, 10, 9, 8, 0, tzinfo=timezone.utc)      # 10:00 Ortszeit
    assert in_quiet_hours(nacht, TZ, "22:00", "07:00")
    assert not in_quiet_hours(tag, TZ, "22:00", "07:00")


def test_formatierung_relativ():
    assert format_local(REFERENCE, TZ).startswith("heute")

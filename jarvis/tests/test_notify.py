"""Tests fuer den Benachrichtigungsmanager."""

import time

import pytest

from jarvis.notify.manager import (
    NotificationManager, NotifyConfig, Priority,
)


class Clock:
    """Steuerbare Uhr -- Tests warten nicht auf echte Sekunden."""

    def __init__(self, start: float = 1000.0, hour: int = 12) -> None:
        self.now = start
        self.hour = hour

    def __call__(self) -> float:
        return self.now

    def localtime(self, _ts: float | None = None) -> time.struct_time:
        return time.struct_time((2026, 10, 9, self.hour, 0, 0, 4, 282, 0))

    def advance(self, seconds: float) -> None:
        self.now += seconds


def manager(**cfg) -> tuple[NotificationManager, Clock]:
    clock = Clock()
    nm = NotificationManager(NotifyConfig(**cfg), clock=clock, localtime=clock.localtime)
    return nm, clock


def test_unwichtiges_wird_nicht_gesprochen():
    nm, _ = manager()
    note = nm.push("Zwischenstand", Priority.INFO)
    assert note.silenced_reason.startswith("unter der Schwelle")
    assert nm.next_to_speak() is None
    # Sichtbar bleibt es trotzdem.
    assert len(nm.history()) == 1


def test_wichtiges_wird_gesprochen():
    nm, _ = manager()
    nm.push("Aufgabe erledigt", Priority.IMPORTANT)
    note = nm.next_to_speak()
    assert note is not None and note.text == "Aufgabe erledigt"


def test_dringendes_kommt_zuerst():
    nm, _ = manager(min_gap_seconds=0)
    nm.push("fertig", Priority.IMPORTANT)
    nm.push("Entscheidung noetig", Priority.URGENT)
    assert nm.next_to_speak().text == "Entscheidung noetig"


def test_dopplung_wird_verworfen():
    nm, _ = manager()
    erste = nm.push("Datei geprueft", Priority.IMPORTANT, dedupe_key="pruefung:7")
    zweite = nm.push("Datei geprueft", Priority.IMPORTANT, dedupe_key="pruefung:7")
    assert erste is not None
    assert zweite is None
    assert len(nm.history()) == 1


def test_dopplung_nach_fenster_wieder_erlaubt():
    nm, clock = manager(min_gap_seconds=0)
    nm.push("Erinnerung", Priority.IMPORTANT, dedupe_key="k", dedupe_window=100)
    clock.advance(101)
    assert nm.push("Erinnerung", Priority.IMPORTANT, dedupe_key="k", dedupe_window=100)


def test_sperrzeit_haelt_meldungen_zurueck():
    """Drei fertige Teilschritte sollen nicht dreimal hintereinander ansagen."""
    nm, clock = manager(min_gap_seconds=30)
    erste = nm.push("Schritt 1 fertig", Priority.IMPORTANT)
    nm.mark_spoken(nm.next_to_speak())
    nm.push("Schritt 2 fertig", Priority.IMPORTANT)
    assert nm.next_to_speak() is None
    clock.advance(31)
    nm.retry_silenced()
    assert nm.next_to_speak().text == "Schritt 2 fertig"


def test_dringendes_durchbricht_sperrzeit():
    nm, _ = manager(min_gap_seconds=300)
    nm.mark_spoken(nm.push("erste", Priority.IMPORTANT))
    nm.push("Berechtigung fehlt", Priority.URGENT)
    assert nm.next_to_speak().text == "Berechtigung fehlt"


def test_ruhezeit_schweigt():
    clock = Clock(hour=23)
    nm = NotificationManager(NotifyConfig(quiet_hours=(22, 8), min_gap_seconds=0),
                             clock=clock, localtime=clock.localtime)
    note = nm.push("Aufgabe erledigt", Priority.IMPORTANT)
    assert note.silenced_reason == "Ruhezeit"
    assert nm.next_to_speak() is None


def test_ruhezeit_ueber_mitternacht():
    for stunde, still in [(23, True), (3, True), (7, True), (9, False), (21, False)]:
        clock = Clock(hour=stunde)
        nm = NotificationManager(NotifyConfig(quiet_hours=(22, 8), min_gap_seconds=0),
                                 clock=clock, localtime=clock.localtime)
        note = nm.push("x", Priority.IMPORTANT)
        assert (note.silenced_reason == "Ruhezeit") is still, f"Stunde {stunde}"


def test_dringendes_durchbricht_ruhezeit():
    clock = Clock(hour=3)
    nm = NotificationManager(NotifyConfig(quiet_hours=(22, 8), min_gap_seconds=0),
                             clock=clock, localtime=clock.localtime)
    nm.push("Entscheidung noetig", Priority.URGENT)
    assert nm.next_to_speak() is not None


def test_lautlos_schaltet_alles_stumm():
    nm, _ = manager(silent=True)
    note = nm.push("Entscheidung noetig", Priority.URGENT)
    assert note.silenced_reason == "lautlos geschaltet"
    assert nm.next_to_speak() is None


def test_unterbrechung_verwirft_veraltete_ansagen():
    """Wenn der Nutzer zu sprechen beginnt, sind alte Ansagen stoerend."""
    nm, _ = manager(min_gap_seconds=0)
    nm.push("fertig 1", Priority.IMPORTANT)
    nm.push("fertig 2", Priority.IMPORTANT)
    nm.push("Entscheidung noetig", Priority.URGENT)
    verworfen = nm.interrupt()
    assert verworfen == 2
    rest = nm.pending()
    assert len(rest) == 1 and rest[0].priority is Priority.URGENT

"""Proaktive Meldungen: keine Doppelungen, Ruhezeiten, Nachlieferung."""

import asyncio
from zoneinfo import ZoneInfo

import pytest

from jarvis.core.notifier import Notifier, PRIORITY_NORMAL, PRIORITY_URGENT

TZ = ZoneInfo("Europe/Berlin")


def run(coroutine):
    return asyncio.run(coroutine)


@pytest.fixture
def notifier(database):
    instance = Notifier(database, TZ, quiet_start="", quiet_end="")
    return instance


def sammler():
    gesendet: list[str] = []

    async def sender(text, keyboard=None):
        gesendet.append(text)
        return True

    return gesendet, sender


def test_meldung_wird_zugestellt(notifier):
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    assert run(notifier.notify("termin:1", "Termin in 10 Minuten")) is True
    assert gesendet == ["Termin in 10 Minuten"]


def test_dieselbe_meldung_kommt_nur_einmal(notifier):
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    run(notifier.notify("termin:1", "Termin in 10 Minuten"))
    run(notifier.notify("termin:1", "Termin in 10 Minuten"))
    assert len(gesendet) == 1


def test_ruhezeit_haelt_normales_zurueck_aber_nicht_dringendes(database):
    notifier = Notifier(database, TZ, quiet_start="00:00", quiet_end="23:59")
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    assert run(notifier.notify("a", "Kann warten", priority=PRIORITY_NORMAL)) is False
    assert run(notifier.notify("b", "Erinnerung", priority=PRIORITY_URGENT)) is True
    assert gesendet == ["Erinnerung"]


def test_zurueckgehaltene_meldungen_werden_nachgeliefert(database):
    notifier = Notifier(database, TZ, quiet_start="00:00", quiet_end="23:59")
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    run(notifier.notify("a", "Wartet", priority=PRIORITY_NORMAL))
    assert gesendet == []

    # Ruhezeit vorbei
    notifier.quiet_start, notifier.quiet_end = "", ""
    assert run(notifier.flush_pending()) == 1
    assert gesendet == ["Wartet"]
    # Und danach nicht noch einmal.
    assert run(notifier.flush_pending()) == 0


def test_stummschaltung(notifier):
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    notifier.muted = True
    assert run(notifier.notify("a", "normal", priority=PRIORITY_NORMAL)) is False
    assert run(notifier.notify("b", "dringend", priority=PRIORITY_URGENT)) is True


def test_flut_wird_gebremst(notifier):
    gesendet, sender = sammler()
    notifier.set_sender(sender)
    notifier.max_per_hour = 3
    for index in range(6):
        run(notifier.notify(f"m{index}", f"Meldung {index}"))
    assert len(gesendet) == 3


def test_ohne_zustellweg_bleibt_die_meldung_in_der_warteschlange(notifier):
    assert run(notifier.notify("a", "Niemand da")) is False
    offen = [n for n in notifier.recent() if n["sent_at"] is None]
    assert len(offen) == 1


def test_ende_der_ruhezeit_wird_berechnet(database):
    notifier = Notifier(database, TZ, quiet_start="22:00", quiet_end="07:00")
    from datetime import datetime, timezone
    nacht = datetime(2026, 10, 9, 21, 30, tzinfo=timezone.utc)   # 23:30 Ortszeit
    naechste = notifier.next_active_time(nacht)
    assert naechste.astimezone(TZ).strftime("%H:%M") == "07:00"
    assert naechste > nacht

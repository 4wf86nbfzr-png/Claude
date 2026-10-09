"""CalDAV vollstaendig gegen einen Server-Stellvertreter.

Geprueft wird der Weg, den Apple iCloud und Nextcloud genauso gehen:
Sammlung finden (PROPFIND), Zeitraum abfragen (REPORT), anlegen und aendern
(PUT), loeschen (DELETE) -- und die Regel, dass jede Aenderung per GET
nachgelesen wird, bevor Jarvis sie als erfolgreich meldet.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from jarvis.adapters.calendar.base import CalendarEvent
from jarvis.adapters.calendar.caldav import CalDAVCalendar
from jarvis.errors import CredentialsMissing, ExternalServiceError
from tests.stub_caldav import CalDavStub

BENUTZER = "ich"
PASSWORT = "geheim"

_schleife: asyncio.AbstractEventLoop | None = None


@pytest.fixture(autouse=True)
def schleife():
    global _schleife
    _schleife = asyncio.new_event_loop()
    asyncio.set_event_loop(_schleife)
    yield _schleife
    _schleife.close()
    _schleife = None


def run(coroutine):
    assert _schleife is not None
    return _schleife.run_until_complete(coroutine)


def ics(uid: str, *, tag: str = "20261110", titel: str = "Termin",
        von: str = "090000", bis: str = "100000") -> str:
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\n"
        f"UID:{uid}\r\nDTSTAMP:{tag}T080000Z\r\n"
        f"DTSTART:{tag}T{von}Z\r\nDTEND:{tag}T{bis}Z\r\n"
        f"SUMMARY:{titel}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
    )


@pytest.fixture
def stub():
    server = CalDavStub(port=8848, user=BENUTZER, password=PASSWORT)
    server.start()
    yield server
    server.stop()


@pytest.fixture
def kalender(stub):
    adapter = CalDAVCalendar(stub.base_url, BENUTZER, PASSWORT, timeout=10.0)
    yield adapter
    run(adapter.close())


# --- Lesen --------------------------------------------------------------------
def test_sammlung_wird_gefunden(kalender, stub):
    adresse = run(kalender.collection_url())
    assert adresse.endswith("/kalender/privat/")
    assert ("PROPFIND", "/kalender") in stub.requests


def test_bestimmter_kalender_wird_ausgewaehlt(stub):
    adapter = CalDAVCalendar(stub.base_url, BENUTZER, PASSWORT, calendar="Arbeit", timeout=10.0)
    assert run(adapter.collection_url()).endswith("/kalender/arbeit/")
    run(adapter.close())


def test_termine_im_zeitraum(kalender, stub):
    stub.add_event("a.ics", ics("uid-a", tag="20261110", titel="Personalplanung"))
    stub.add_event("b.ics", ics("uid-b", tag="20270101", titel="Weit weg"))

    termine = run(kalender.list_events(
        datetime(2026, 11, 1, tzinfo=timezone.utc), datetime(2026, 11, 30, tzinfo=timezone.utc)
    ))

    assert [t.title for t in termine] == ["Personalplanung"]
    assert termine[0].uid == "uid-a"
    assert termine[0].start == datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)
    assert termine[0].etag


def test_suche_nach_stichwort(kalender, stub):
    stub.add_event("a.ics", ics("uid-a", titel="Zahnarzt Dr. Meyer"))
    stub.add_event("b.ics", ics("uid-b", titel="Teamrunde"))
    treffer = run(kalender.find_events(
        "zahnarzt",
        start=datetime(2026, 11, 1, tzinfo=timezone.utc),
        end=datetime(2026, 11, 30, tzinfo=timezone.utc),
    ))
    assert [t.uid for t in treffer] == ["uid-a"]


def test_einzelner_termin_wird_geholt(kalender, stub):
    stub.add_event("uid-a.ics", ics("uid-a", titel="Einzeln"))
    termin = run(kalender.get_event("uid-a"))
    assert termin is not None and termin.title == "Einzeln"
    assert run(kalender.get_event("gibtsnicht")) is None


# --- Schreiben ----------------------------------------------------------------
def test_anlegen_wird_nachgelesen(kalender, stub):
    beginn = datetime(2026, 11, 12, 14, 0, tzinfo=timezone.utc)
    angelegt = run(kalender.create_event(CalendarEvent(
        uid="", title="Begehung Objekt Nord", start=beginn,
        end=beginn + timedelta(hours=1), location="Hamburg Nord",
        description="Mit Jan; Schluessel mitnehmen",
    )))

    # Der Server hat die Datei wirklich bekommen ...
    assert any(m == "PUT" for m, _ in stub.requests)
    gespeichert = next(iter(stub.items.values()))
    assert "SUMMARY:Begehung Objekt Nord" in gespeichert
    assert "LOCATION:Hamburg Nord" in gespeichert
    # Sonderzeichen sind maskiert, sonst zerbricht die Datei.
    assert r"Mit Jan\; Schluessel" in gespeichert
    # ... und Jarvis hat ihn danach gelesen, statt den Erfolg zu behaupten.
    assert any(m == "GET" for m, _ in stub.requests)
    assert angelegt.title == "Begehung Objekt Nord"
    assert angelegt.location == "Hamburg Nord"


def test_nicht_bestaetigtes_anlegen_gilt_als_fehler(kalender, stub):
    """Server nimmt den PUT an, speichert aber nicht -- kein erfundener Erfolg."""
    stub.swallow_writes = True
    beginn = datetime(2026, 11, 12, 14, 0, tzinfo=timezone.utc)
    with pytest.raises(ExternalServiceError) as fehler:
        run(kalender.create_event(CalendarEvent(
            uid="", title="Verschwindet", start=beginn, end=beginn + timedelta(hours=1))))
    assert "nicht bestaetigt" in fehler.value.message


def test_verschieben_behaelt_die_dauer(kalender, stub):
    stub.add_event("uid-a.ics", ics("uid-a", titel="Zahnarzt", von="090000", bis="093000"))
    neuer_beginn = datetime(2026, 11, 17, 11, 0, tzinfo=timezone.utc)

    geaendert = run(kalender.update_event(
        "uid-a", start=neuer_beginn, end=neuer_beginn + timedelta(minutes=30)))

    assert geaendert.start == neuer_beginn
    assert geaendert.duration() == timedelta(minutes=30)
    assert "20261117T110000Z" in stub.items["uid-a.ics"]
    assert geaendert.title == "Zahnarzt"      # Titel bleibt erhalten


def test_aendern_eines_unbekannten_termins(kalender):
    with pytest.raises(ExternalServiceError) as fehler:
        run(kalender.update_event("gibtsnicht", start=datetime.now(timezone.utc)))
    assert "nicht gefunden" in fehler.value.message


def test_loeschen_wird_gegengeprueft(kalender, stub):
    stub.add_event("uid-a.ics", ics("uid-a", titel="Weg damit"))
    assert run(kalender.delete_event("uid-a")) is True
    assert "uid-a.ics" not in stub.items
    # Ein zweites Loeschen meldet ehrlich, dass nichts passiert ist.
    assert run(kalender.delete_event("uid-a")) is True   # schon weg -> Ziel erreicht


def test_nicht_bestaetigtes_loeschen_meldet_fehler(kalender, stub):
    stub.add_event("uid-a.ics", ics("uid-a", titel="Bleibt trotzdem"))
    stub.swallow_writes = True
    assert run(kalender.delete_event("uid-a")) is False


# --- Fehlerfaelle -------------------------------------------------------------
def test_abgelehnte_anmeldung_nennt_app_passwort(kalender, stub):
    stub.reject_auth = True
    with pytest.raises(CredentialsMissing) as fehler:
        run(kalender.list_events(
            datetime(2026, 11, 1, tzinfo=timezone.utc),
            datetime(2026, 11, 2, tzinfo=timezone.utc)))
    assert "app-spezifisches Passwort" in fehler.value.user_text()


def test_nicht_erreichbarer_server(stub):
    adapter = CalDAVCalendar("http://127.0.0.1:8899/kalender", BENUTZER, PASSWORT, timeout=2.0)
    with pytest.raises(ExternalServiceError) as fehler:
        run(adapter.list_events(
            datetime(2026, 11, 1, tzinfo=timezone.utc),
            datetime(2026, 11, 2, tzinfo=timezone.utc)))
    assert "nicht erreichbar" in fehler.value.message
    run(adapter.close())


def test_zustandspruefung(kalender, stub):
    stub.add_event("a.ics", ics("uid-a"))
    ok, hinweis = run(kalender.health())
    assert ok and "CalDAV erreichbar" in hinweis


# --- Zusammenspiel mit Jarvis -------------------------------------------------
def test_werkzeuge_arbeiten_mit_dem_echten_caldav_server(services, kalender, stub):
    """Vom Werkzeugaufruf bis zur bestaetigten Loeschung -- echte Verbindungen."""
    services.calendar = kalender

    anlegen = run(services.toolkit.execute("termin_anlegen", {
        "titel": "Einsatzbesprechung", "beginn": "2026-11-12T14:00",
        "dauer_minuten": 90, "ort": "Buero",
    }))
    assert anlegen.ok, anlegen.text
    assert "Einsatzbesprechung" in anlegen.text
    assert stub.items, "Der Server hat keinen Termin erhalten"

    anzeigen = run(services.toolkit.execute(
        "termine_anzeigen", {"zeitraum": "2026-11-12", "tage": 1}))
    assert "Einsatzbesprechung" in anzeigen.text

    # Der Standardzeitraum der Suche sind 14 Tage ab heute -- der Termin liegt
    # weiter weg, also wird er ausdruecklich angegeben.
    suchen = run(services.toolkit.execute(
        "termin_suchen", {"stichwort": "Einsatz", "zeitraum": "2026-11-01", "tage": 30}))
    assert suchen.ok and "Kennung" in suchen.text

    # Loeschen braucht eine Bestaetigung ...
    anfrage = run(services.toolkit.execute(
        "termin_loeschen", {"termin": "Einsatzbesprechung"}, chat_id="42"))
    assert anfrage.confirmation_token
    assert stub.items, "Der Termin wurde ohne Bestaetigung geloescht"

    # ... und wird danach wirklich geloescht.
    ergebnis = run(services.build_agent().confirm(anfrage.confirmation_token, chat_id="42"))
    assert "geloescht" in ergebnis.text
    assert stub.items == {}

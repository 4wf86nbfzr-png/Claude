"""Tests fuer den Aufgabenmanager.

Schwerpunkt: JARVIS darf keine Aufgabe als erledigt fuehren, die nicht
ausgefuehrt und geprueft wurde -- und nach einem Neustart muss er offene
Aufgaben korrekt wiederfinden.
"""

import pytest

from jarvis.memory.db import Database
from jarvis.tasks.manager import Status, TaskError, TaskManager


@pytest.fixture()
def tm():
    with Database() as db:
        yield TaskManager(db)


def test_neue_aufgabe_ist_geplant(tm):
    t = tm.create("Angebot an Halle 45 schicken", detail="Gastro, 12 Leute")
    assert t.status is Status.PLANNED
    assert t.is_open
    assert t.result is None


def test_titel_darf_nicht_leer_sein(tm):
    with pytest.raises(TaskError):
        tm.create("   ")


def test_erledigt_nur_mit_pruefvermerk(tm):
    """Der Kern der Regel: ohne Pruefung kein 'erledigt'."""
    t = tm.create("Datei pruefen")
    tm.start(t.id)
    with pytest.raises(TaskError, match="Pruefvermerk"):
        tm.complete(t.id, result="Fertig!", verification="")
    # Status bleibt unveraendert -- es wurde nichts stillschweigend gesetzt.
    assert tm.get(t.id).status is Status.RUNNING


def test_erledigt_mit_pruefvermerk(tm):
    t = tm.create("Datei pruefen")
    tm.start(t.id)
    done = tm.complete(t.id, result="2 Einträge fehlen",
                       verification="Datei gelesen, 2 Zeilen ohne Wert in Spalte B")
    assert done.status is Status.DONE
    assert done.verification.startswith("Datei gelesen")
    assert not done.is_open


def test_blockieren_braucht_grund(tm):
    t = tm.create("Mail senden")
    tm.start(t.id)
    with pytest.raises(TaskError):
        tm.block(t.id, "  ")
    blocked = tm.block(t.id, "Keine Freigabe fuer externen Versand")
    assert blocked.status is Status.BLOCKED
    assert "Freigabe" in blocked.summary()


def test_unerlaubter_uebergang_wirft(tm):
    t = tm.create("Irgendwas")
    tm.start(t.id)
    tm.complete(t.id, "ok", "geprueft")
    # Eine erledigte Aufgabe wird nicht wieder geoeffnet.
    with pytest.raises(TaskError, match="nicht vorgesehen"):
        tm.start(t.id)


def test_fehlgeschlagene_aufgabe_darf_neu_beginnen(tm):
    t = tm.create("Netzwerkabfrage")
    tm.start(t.id)
    tm.fail(t.id, "Zeitueberschreitung")
    assert tm.start(t.id).status is Status.RUNNING


def test_teilschritte_blockieren_abschluss(tm):
    parent = tm.create("Bewerbung bearbeiten")
    steps = tm.plan_steps(parent.id, ["Unterlagen lesen", "Antwort schreiben"])
    tm.start(parent.id)
    with pytest.raises(TaskError, match="offene Teilschritte"):
        tm.complete(parent.id, "fertig", "geprueft")
    for s in steps:
        tm.start(s.id)
        tm.complete(s.id, "ok", "geprueft")
    assert tm.complete(parent.id, "fertig", "beide Schritte geprueft").status is Status.DONE


def test_neustart_macht_laufende_aufgaben_ehrlich():
    """Nach einem Absturz laeuft nichts mehr -- der Status darf das nicht behaupten."""
    db = Database()
    tm1 = TaskManager(db)
    a = tm1.create("Lange Auswertung")
    tm1.start(a.id)
    tm1.create("Noch nicht begonnen")

    # Neuer Manager auf derselben Datenbank = Neustart des Prozesses.
    tm2 = TaskManager(db)
    offen = tm2.resume_after_restart()

    wieder = tm2.get(a.id)
    assert wieder.status is Status.BLOCKED
    assert "Neustart" in wieder.blocked_reason
    assert {t.title for t in offen} == {"Lange Auswertung", "Noch nicht begonnen"}
    db.close()


def test_statusbericht_unterscheidet_zustaende(tm):
    done = tm.create("a"); tm.start(done.id); tm.complete(done.id, "r", "v")
    failed = tm.create("b"); tm.start(failed.id); tm.fail(failed.id, "kaputt")
    tm.create("c")
    assert tm.status_report() == {"done": 1, "failed": 1, "planned": 1}


def test_ereignisse_werden_protokolliert(tm):
    t = tm.create("Ablauf")
    tm.start(t.id)
    tm.complete(t.id, "ok", "geprueft")
    kinds = [e["kind"] for e in tm.events(t.id)]
    assert kinds == ["created", "running", "done"]

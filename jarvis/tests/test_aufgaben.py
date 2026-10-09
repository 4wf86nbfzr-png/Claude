"""Aufgaben und Erinnerungen."""

from datetime import timedelta
from zoneinfo import ZoneInfo

from jarvis.core.tasks import ReminderStore, TaskStore
from jarvis.db.database import utcnow

TZ = ZoneInfo("Europe/Berlin")


def test_aufgabe_anlegen_und_abschliessen(database):
    tasks = TaskStore(database)
    task = tasks.create("Alex anrufen", priority="hoch", due_at=utcnow() + timedelta(hours=2))
    assert task.id > 0
    assert task.priority == 1
    assert task.status == "offen"

    offen = tasks.list()
    assert [t.id for t in offen] == [task.id]

    erledigt = tasks.complete(task.id, "hat abgenommen")
    assert erledigt.status == "erledigt"
    assert erledigt.result == "hat abgenommen"
    assert erledigt.completed_at is not None
    assert tasks.list() == []


def test_aufgaben_sortierung_und_suche(database):
    tasks = TaskStore(database)
    tasks.create("Unwichtig", priority="niedrig")
    dringend = tasks.create("Dringend", priority="hoch")
    tasks.create("Mittel")
    assert tasks.list()[0].id == dringend.id
    assert [t.title for t in tasks.find("dring")] == ["Dringend"]
    assert tasks.find(f"#{dringend.id}")[0].id == dringend.id


def test_ueberfaellige_aufgaben(database):
    tasks = TaskStore(database)
    tasks.create("Laengst faellig", due_at=utcnow() - timedelta(hours=3))
    tasks.create("Spaeter", due_at=utcnow() + timedelta(days=1))
    ueberfaellig = tasks.overdue()
    assert len(ueberfaellig) == 1
    assert ueberfaellig[0].title == "Laengst faellig"


def test_abhaengigkeiten(database):
    tasks = TaskStore(database)
    erst = tasks.create("Angebot schreiben")
    dann = tasks.create("Angebot senden", depends_on=erst.id)
    assert dann.depends_on == erst.id
    assert "wartet auf" in dann.line(TZ)


def test_erinnerung_bleibt_bestehen_und_wird_faellig(database):
    reminders = ReminderStore(database)
    vergangen = reminders.create("Alex anrufen", utcnow() - timedelta(minutes=1))
    zukunft = reminders.create("Spaeter", utcnow() + timedelta(hours=5))

    faellig = reminders.due()
    assert [r.id for r in faellig] == [vergangen.id]
    assert zukunft.id not in [r.id for r in faellig]

    reminders.mark_triggered(vergangen.id)
    assert reminders.get(vergangen.id).status == "ausgeloest"
    assert reminders.due() == []

    reminders.confirm(vergangen.id)
    assert reminders.get(vergangen.id).status == "bestaetigt"


def test_wiederkehrende_erinnerung_wird_neu_eingeplant(database):
    reminders = ReminderStore(database)
    reminder = reminders.create(
        "Wochenplanung", utcnow() - timedelta(minutes=5), recurrence="woechentlich:mo"
    )
    reminders.mark_triggered(reminder.id)
    naechster = reminders.reschedule_recurring(reminders.get(reminder.id), TZ)
    assert naechster is not None and naechster > utcnow()
    aktuell = reminders.get(reminder.id)
    assert aktuell.status == "geplant"
    assert aktuell.attempts == 0


def test_wiederholung_ueberspringt_lange_stillstaende(database):
    """Nach einem langen Ausfall darf nicht die Vergangenheit abgearbeitet werden."""
    reminders = ReminderStore(database)
    reminder = reminders.create(
        "Taeglich", utcnow() - timedelta(days=40), recurrence="taeglich"
    )
    naechster = reminders.reschedule_recurring(reminder, TZ)
    assert naechster > utcnow()
    assert naechster < utcnow() + timedelta(days=2)


def test_verschieben_und_abbrechen(database):
    reminders = ReminderStore(database)
    reminder = reminders.create("Test", utcnow() + timedelta(hours=1))
    ziel = utcnow() + timedelta(days=1)
    verschoben = reminders.snooze(reminder.id, ziel)
    assert abs((verschoben.due_at - ziel).total_seconds()) < 2
    assert reminders.cancel(reminder.id).status == "abgebrochen"


def test_unbestaetigte_fuer_eskalation(database):
    reminders = ReminderStore(database)
    reminder = reminders.create(
        "Wichtig", utcnow() - timedelta(hours=1), escalate_phone=True, max_attempts=3
    )
    database.execute(
        "UPDATE reminder SET status = 'ausgeloest', triggered_at = ?, attempts = 1 WHERE id = ?",
        ("2020-01-01T00:00:00Z", reminder.id),
    )
    offen = reminders.unconfirmed(older_than_minutes=15)
    assert [r.id for r in offen] == [reminder.id]

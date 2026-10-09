"""Hintergrunddienst: Warteschlange, Wiederholungen, Schutz vor Doppelausfuehrung."""

import asyncio
from datetime import timedelta
from zoneinfo import ZoneInfo

import pytest

from jarvis.core.jobs import JobQueue, Scheduler
from jarvis.db.database import utcnow

TZ = ZoneInfo("Europe/Berlin")


@pytest.fixture
def queue(database):
    return JobQueue(database, TZ)


def test_idempotenzschluessel_verhindert_doppelte_auftraege(queue):
    erster = queue.enqueue("erinnerung", idempotency_key="erinnerung:1:2026")
    zweiter = queue.enqueue("erinnerung", idempotency_key="erinnerung:1:2026")
    assert erster is not None
    assert zweiter is None
    assert len(queue.pending()) == 1


def test_nur_faellige_auftraege_werden_uebernommen(queue):
    queue.enqueue("a", run_at=utcnow() - timedelta(minutes=1))
    queue.enqueue("b", run_at=utcnow() + timedelta(hours=1))
    uebernommen = queue.claim_due()
    assert [job.kind for job in uebernommen] == ["a"]
    # Ein zweiter Durchlauf darf denselben Auftrag nicht erneut bekommen.
    assert queue.claim_due() == []


def test_fehler_fuehrt_zu_neuem_versuch_dann_zu_aufgabe(queue):
    job = queue.enqueue("flattert", max_attempts=2)
    uebernommen = queue.claim_due()[0]
    queue.fail(uebernommen, "Netz weg")
    wieder = queue.get(job.id)
    assert wieder.status == "geplant"
    assert wieder.run_at > utcnow()

    database = queue.db
    database.execute("UPDATE job SET run_at = ? WHERE id = ?", ("2020-01-01T00:00:00Z", job.id))
    zweiter = queue.claim_due()[0]
    queue.fail(zweiter, "immer noch weg")
    endgueltig = queue.get(job.id)
    assert endgueltig.status == "fehler"
    assert "immer noch weg" in endgueltig.last_error
    assert [j.id for j in queue.failed()] == [job.id]


def test_wiederkehrender_auftrag_wird_neu_eingeplant(queue):
    queue.enqueue("sicherung", recurrence="taeglich", idempotency_key="s1")
    job = queue.claim_due()[0]
    queue.finish(job)
    offen = queue.pending()
    assert len(offen) == 1
    assert offen[0].recurrence == "taeglich"
    assert offen[0].run_at > utcnow()


def test_wiederkehrender_auftrag_verstummt_nicht_nach_fehler(queue):
    queue.enqueue("email_pruefen", recurrence="alle:5:min", max_attempts=1, idempotency_key="e1")
    job = queue.claim_due()[0]
    queue.fail(job, "Postfach weg")
    assert any(j.kind == "email_pruefen" for j in queue.pending())


def test_haengengebliebene_auftraege_werden_befreit(queue):
    queue.enqueue("langsam")
    job = queue.claim_due()[0]
    queue.db.execute(
        "UPDATE job SET locked_at = ? WHERE id = ?", ("2020-01-01T00:00:00Z", job.id)
    )
    assert queue.recover_stuck(older_than_minutes=5) == 1
    assert queue.get(job.id).status == "geplant"


def test_scheduler_fuehrt_aus_und_faengt_fehler(queue):
    laeufe: list[str] = []

    async def gut(job):
        laeufe.append(job.kind)
        return "fertig"

    async def schlecht(job):
        raise RuntimeError("kaputt")

    scheduler = Scheduler(queue, tick_seconds=5)
    scheduler.register("gut", gut)
    scheduler.register("schlecht", schlecht)
    queue.enqueue("gut", idempotency_key="g")
    queue.enqueue("schlecht", max_attempts=1, idempotency_key="s")

    verarbeitet = asyncio.run(scheduler.tick())
    assert verarbeitet == 2
    assert laeufe == ["gut"]
    assert [j.kind for j in queue.failed()] == ["schlecht"]
    assert scheduler.last_tick is not None


def test_unbekannte_auftragsart_scheitert_verstaendlich(queue):
    scheduler = Scheduler(queue)
    queue.enqueue("gibtsnicht", max_attempts=1, idempotency_key="x")
    asyncio.run(scheduler.tick())
    fehlgeschlagen = queue.failed()[0]
    assert "Keine Behandlung" in fehlgeschlagen.last_error

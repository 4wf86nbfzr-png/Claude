"""Persistente Auftragswarteschlange und Hintergrunddienst.

Jeder geplante Vorgang -- faellige Erinnerung, Postfachpruefung, Anruf,
Sicherung -- ist ein Datensatz in ``job``. Dadurch uebersteht alles einen
Neustart: beim Start werden haengengebliebene Auftraege (Status ``laeuft``)
wieder freigegeben und faellige nachgeholt.

Schutz vor doppelter Ausfuehrung auf zwei Ebenen:

1. ``idempotency_key`` (UNIQUE) verhindert, dass derselbe Auftrag zweimal
   in die Warteschlange kommt -- etwa wenn ein Zeitgeber doppelt feuert.
2. Das Setzen auf ``laeuft`` passiert mit ``UPDATE ... WHERE status='geplant'``;
   nur wer die Zeile tatsaechlich veraendert hat, fuehrt sie aus.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from ..db.database import Database, iso, parse_iso, utcnow
from .timeutil import next_occurrence

log = logging.getLogger(__name__)

JobHandler = Callable[["Job"], Awaitable[str | None]]

STATUS_PLANNED = "geplant"
STATUS_RUNNING = "laeuft"
STATUS_DONE = "fertig"
STATUS_FAILED = "fehler"
STATUS_CANCELLED = "abgebrochen"

#: Wartezeiten zwischen Wiederholungsversuchen (Minuten).
RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 180]


@dataclass(slots=True)
class Job:
    id: int
    kind: str
    payload: dict[str, Any]
    run_at: datetime
    status: str
    attempts: int
    max_attempts: int
    last_error: str
    recurrence: str
    idempotency_key: str | None


def _job(row) -> Job:
    try:
        payload = json.loads(row["payload"] or "{}")
    except json.JSONDecodeError:
        payload = {}
    return Job(
        id=row["id"], kind=row["kind"], payload=payload,
        run_at=parse_iso(row["run_at"]) or utcnow(), status=row["status"],
        attempts=row["attempts"], max_attempts=row["max_attempts"],
        last_error=row["last_error"], recurrence=row["recurrence"],
        idempotency_key=row["idempotency_key"],
    )


class JobQueue:
    """Warteschlange. Kennt die Datenbank, aber nicht die Fachlogik."""

    def __init__(self, database: Database, tz: ZoneInfo) -> None:
        self.db = database
        self.tz = tz

    def enqueue(
        self, kind: str, *, run_at: datetime | None = None, payload: dict[str, Any] | None = None,
        idempotency_key: str | None = None, max_attempts: int = 3, recurrence: str = "",
    ) -> Job | None:
        """Legt einen Auftrag an. ``None``, wenn er (per Schluessel) schon existiert."""
        now = iso(utcnow())
        values = {
            "kind": kind,
            "payload": json.dumps(payload or {}, ensure_ascii=False, default=str),
            "run_at": iso(run_at or utcnow()),
            "status": STATUS_PLANNED,
            "max_attempts": max(1, int(max_attempts)),
            "idempotency_key": idempotency_key,
            "recurrence": recurrence,
            "created_at": now, "updated_at": now,
        }
        columns = ", ".join(values)
        marks = ", ".join("?" for _ in values)
        cursor = self.db.execute(
            f"INSERT INTO job ({columns}) VALUES ({marks}) "
            "ON CONFLICT (idempotency_key) DO NOTHING",
            list(values.values()),
        )
        if not cursor.rowcount:
            log.debug("Auftrag %s bereits vorhanden (Schluessel %s)", kind, idempotency_key)
            return None
        job = self.get(int(cursor.lastrowid or 0))
        return job

    def ensure_recurring(
        self, kind: str, *, run_at: datetime, recurrence: str,
        payload: dict[str, Any] | None = None, key: str | None = None,
    ) -> Job | None:
        """Legt einen wiederkehrenden Auftrag an, falls er nicht schon geplant ist."""
        key = key or f"wiederkehrend:{kind}"
        existing = self.db.query_one(
            "SELECT * FROM job WHERE kind = ? AND recurrence <> '' AND status IN ('geplant','laeuft') "
            "ORDER BY id DESC LIMIT 1",
            (kind,),
        )
        if existing:
            return _job(existing)
        return self.enqueue(
            kind, run_at=run_at, payload=payload, recurrence=recurrence,
            idempotency_key=f"{key}:{iso(run_at)}", max_attempts=3,
        )

    def get(self, job_id: int) -> Job | None:
        row = self.db.query_one("SELECT * FROM job WHERE id = ?", (job_id,))
        return _job(row) if row else None

    def claim_due(self, limit: int = 10, reference: datetime | None = None) -> list[Job]:
        """Faellige Auftraege uebernehmen. Nur wer die Zeile aendert, bekommt sie."""
        rows = self.db.query(
            "SELECT * FROM job WHERE status = ? AND run_at <= ? ORDER BY run_at LIMIT ?",
            (STATUS_PLANNED, iso(reference or utcnow()), limit),
        )
        claimed: list[Job] = []
        for row in rows:
            cursor = self.db.execute(
                "UPDATE job SET status = ?, locked_at = ?, attempts = attempts + 1, updated_at = ? "
                "WHERE id = ? AND status = ?",
                (STATUS_RUNNING, iso(utcnow()), iso(utcnow()), row["id"], STATUS_PLANNED),
            )
            if cursor.rowcount:
                refreshed = self.get(row["id"])
                if refreshed:
                    claimed.append(refreshed)
        return claimed

    def finish(self, job: Job, note: str = "") -> None:
        """Erfolgreich beendet. Wiederkehrende Auftraege werden neu eingeplant."""
        following = next_occurrence(job.recurrence, utcnow(), self.tz) if job.recurrence else None
        with self.db.transaction():
            self.db.execute(
                "UPDATE job SET status = ?, last_error = '', finished_at = ?, updated_at = ?, "
                "locked_at = NULL WHERE id = ?",
                (STATUS_DONE, iso(utcnow()), iso(utcnow()), job.id),
            )
            if following is not None:
                self.enqueue(
                    job.kind, run_at=following, payload=job.payload, recurrence=job.recurrence,
                    idempotency_key=f"wiederkehrend:{job.kind}:{iso(following)}",
                    max_attempts=job.max_attempts,
                )
        if note:
            log.debug("Auftrag %s (%s) fertig: %s", job.id, job.kind, note)

    def fail(self, job: Job, error: str) -> None:
        """Fehlgeschlagen: entweder spaeter erneut versuchen oder endgueltig aufgeben."""
        error = (error or "")[:1000]
        if job.attempts < job.max_attempts:
            index = min(job.attempts - 1, len(RETRY_BACKOFF_MINUTES) - 1)
            delay = RETRY_BACKOFF_MINUTES[max(0, index)]
            self.db.execute(
                "UPDATE job SET status = ?, run_at = ?, last_error = ?, updated_at = ?, "
                "locked_at = NULL WHERE id = ?",
                (STATUS_PLANNED, iso(utcnow() + timedelta(minutes=delay)), error,
                 iso(utcnow()), job.id),
            )
            log.warning(
                "Auftrag %s (%s) fehlgeschlagen, neuer Versuch in %s min: %s",
                job.id, job.kind, delay, error,
            )
            return

        following = next_occurrence(job.recurrence, utcnow(), self.tz) if job.recurrence else None
        with self.db.transaction():
            self.db.execute(
                "UPDATE job SET status = ?, last_error = ?, finished_at = ?, updated_at = ?, "
                "locked_at = NULL WHERE id = ?",
                (STATUS_FAILED, error, iso(utcnow()), iso(utcnow()), job.id),
            )
            # Ein wiederkehrender Auftrag darf nicht wegen eines schlechten Tages
            # dauerhaft verstummen -- der naechste Termin wird trotzdem gesetzt.
            if following is not None:
                self.enqueue(
                    job.kind, run_at=following, payload=job.payload, recurrence=job.recurrence,
                    idempotency_key=f"wiederkehrend:{job.kind}:{iso(following)}",
                    max_attempts=job.max_attempts,
                )
        log.error("Auftrag %s (%s) endgueltig fehlgeschlagen: %s", job.id, job.kind, error)

    def recover_stuck(self, older_than_minutes: int = 10) -> int:
        """Nach einem Absturz: ``laeuft`` seit zu langer Zeit -> zurueck auf ``geplant``."""
        cutoff = iso(utcnow() - timedelta(minutes=older_than_minutes))
        cursor = self.db.execute(
            "UPDATE job SET status = ?, locked_at = NULL, updated_at = ? "
            "WHERE status = ? AND (locked_at IS NULL OR locked_at <= ?)",
            (STATUS_PLANNED, iso(utcnow()), STATUS_RUNNING, cutoff),
        )
        count = cursor.rowcount or 0
        if count:
            log.info("%s haengengebliebene Auftraege wieder eingeplant", count)
        return count

    def cancel(self, job_id: int) -> bool:
        return bool(self.db.execute(
            "UPDATE job SET status = ?, updated_at = ? WHERE id = ? AND status = ?",
            (STATUS_CANCELLED, iso(utcnow()), job_id, STATUS_PLANNED),
        ).rowcount)

    def failed(self, limit: int = 10) -> list[Job]:
        rows = self.db.query(
            "SELECT * FROM job WHERE status = ? ORDER BY id DESC LIMIT ?", (STATUS_FAILED, limit)
        )
        return [_job(r) for r in rows]

    def pending(self, limit: int = 20) -> list[Job]:
        rows = self.db.query(
            "SELECT * FROM job WHERE status IN (?, ?) ORDER BY run_at LIMIT ?",
            (STATUS_PLANNED, STATUS_RUNNING, limit),
        )
        return [_job(r) for r in rows]

    def counts(self) -> dict[str, int]:
        rows = self.db.query("SELECT status, COUNT(*) AS n FROM job GROUP BY status")
        return {r["status"]: r["n"] for r in rows}

    def purge_old(self, days: int = 30) -> int:
        cutoff = iso(utcnow() - timedelta(days=days))
        cursor = self.db.execute(
            "DELETE FROM job WHERE status IN (?, ?) AND finished_at IS NOT NULL AND finished_at < ?",
            (STATUS_DONE, STATUS_CANCELLED, cutoff),
        )
        return cursor.rowcount or 0


class Scheduler:
    """Der Hintergrunddienst: nimmt faellige Auftraege und fuehrt sie aus."""

    def __init__(
        self, queue: JobQueue, *, tick_seconds: int = 20, batch: int = 10,
        on_error: Callable[[str, Exception], None] | None = None,
    ) -> None:
        self.queue = queue
        self.tick_seconds = max(5, int(tick_seconds))
        self.batch = batch
        self._handlers: dict[str, JobHandler] = {}
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._on_error = on_error
        self.last_tick: datetime | None = None
        self.ticks = 0

    def register(self, kind: str, handler: JobHandler) -> None:
        self._handlers[kind] = handler

    def known_kinds(self) -> list[str]:
        return sorted(self._handlers)

    async def start(self) -> None:
        if self._task is not None:
            return
        self.queue.recover_stuck()
        self._stop.clear()
        self._task = asyncio.create_task(self._loop(), name="jarvis-scheduler")
        log.info("Hintergrunddienst gestartet (Takt %ss, %s Auftragsarten)",
                 self.tick_seconds, len(self._handlers))

    async def stop(self) -> None:
        """Sauberes Beenden: laufenden Takt abwarten, nichts abschneiden."""
        self._stop.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=30)
            except (TimeoutError, asyncio.TimeoutError):
                self._task.cancel()
            except asyncio.CancelledError:  # pragma: no cover
                pass
            self._task = None
        log.info("Hintergrunddienst beendet")

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                await self.tick()
            except Exception as exc:  # pragma: no cover - Dienst darf nie sterben
                log.exception("Fehler im Hintergrunddienst: %s", exc)
                if self._on_error:
                    self._on_error("scheduler", exc)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self.tick_seconds)
            except (TimeoutError, asyncio.TimeoutError):
                continue

    async def tick(self) -> int:
        """Ein Durchlauf. Gibt die Zahl der bearbeiteten Auftraege zurueck."""
        self.ticks += 1
        self.last_tick = utcnow()
        jobs = self.queue.claim_due(limit=self.batch)
        for job in jobs:
            await self._run_job(job)
        return len(jobs)

    async def _run_job(self, job: Job) -> None:
        handler = self._handlers.get(job.kind)
        if handler is None:
            self.queue.fail(job, f"Keine Behandlung fuer Auftragsart '{job.kind}' registriert")
            return
        started = time.monotonic()
        try:
            note = await handler(job)
        except Exception as exc:
            self.queue.fail(job, f"{type(exc).__name__}: {exc}")
            if self._on_error:
                self._on_error(job.kind, exc)
            return
        duration = int((time.monotonic() - started) * 1000)
        self.queue.finish(job, note or f"{duration} ms")

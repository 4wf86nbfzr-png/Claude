"""DB-gestützte Jobwarteschlange: Enqueue, Wiederholung mit Backoff, Fehlerwarteschlange (dead letter).
Bewusst ohne Fremddienst, damit Tests und kleine Deployments einfach bleiben. Redis ist optional."""

from __future__ import annotations

import hashlib
import traceback
from collections.abc import Awaitable, Callable
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.logging import get_logger
from app.core.system import kill_switch_active
from app.models.ops import ErrorReport, Job

log = get_logger("jobs")

Handler = Callable[[AsyncSession, Job], Awaitable[dict | None]]
_handlers: dict[str, Handler] = {}


def job_handler(job_type: str):
    def deco(fn: Handler):
        _handlers[job_type] = fn
        return fn

    return deco


def registered_handlers() -> dict[str, Handler]:
    return dict(_handlers)


async def enqueue(
    db: AsyncSession,
    job_type: str,
    payload: dict | None = None,
    *,
    tenant_id: str | None = None,
    delay_seconds: int = 0,
    dedupe_key: str | None = None,
    priority: int = 5,
    critical: bool = False,
    max_attempts: int | None = None,
) -> Job:
    if dedupe_key:
        existing = (await db.execute(select(Job).where(Job.dedupe_key == dedupe_key, Job.status.in_(["queued", "running"])))).scalar_one_or_none()
        if existing:
            return existing
    job = Job(
        type=job_type,
        tenant_id=tenant_id,
        payload=payload or {},
        run_at=utcnow() + timedelta(seconds=delay_seconds),
        max_attempts=max_attempts or get_settings().job_max_attempts,
        dedupe_key=dedupe_key,
        priority=priority,
        critical=critical,
    )
    db.add(job)
    await db.flush()
    return job


def categorize_error(exc: BaseException) -> str:
    name = type(exc).__name__
    msg = str(exc).lower()
    if "budget" in msg or "kill" in name.lower() or "not-aus" in msg:
        return "budget_or_killswitch"
    if any(k in msg for k in ("timeout", "timed out", "connection", "unreachable", "502", "503")):
        return "transient_network"
    if any(k in msg for k in ("401", "403", "unauthorized", "forbidden", "invalid api key", "signature")):
        return "auth_or_config"
    if "schema" in msg or "json" in msg or "validation" in msg:
        return "invalid_output"
    return "unknown"


async def record_error(db: AsyncSession, *, source: str, message: str, stack: str | None, context: dict, tenant_id: str | None = None) -> ErrorReport:
    fp = hashlib.sha256(f"{source}:{message[:200]}".encode()).hexdigest()[:64]
    existing = (await db.execute(select(ErrorReport).where(ErrorReport.fingerprint == fp))).scalar_one_or_none()
    now = utcnow()
    if existing:
        existing.occurrences += 1
        existing.last_seen_at = now
        existing.context = context
        if existing.status == "fixed":
            existing.status = "open"  # Regression!
        await db.flush()
        return existing
    rep = ErrorReport(fingerprint=fp, source=source, message=message[:4000], stacktrace=stack, context=context, tenant_id=tenant_id, last_seen_at=now)
    db.add(rep)
    await db.flush()
    return rep


async def claim_next(db: AsyncSession) -> Job | None:
    """Holt den nächsten fälligen Job. Bei Not-Aus nur kritische Jobs (Monitoring/Sicherheit)."""
    now = utcnow()
    q = select(Job).where(Job.status == "queued", Job.run_at <= now)
    if await kill_switch_active(db):
        q = q.where(Job.critical.is_(True))
    q = q.order_by(Job.priority, Job.run_at).limit(1)
    job = (await db.execute(q)).scalar_one_or_none()
    if job is None:
        return None
    # Optimistisches Claimen: nur wer das Update gewinnt, führt aus.
    res = await db.execute(update(Job).where(Job.id == job.id, Job.status == "queued").values(status="running", started_at=now, attempts=Job.attempts + 1))
    await db.commit()
    if res.rowcount != 1:
        return None
    await db.refresh(job)
    return job


async def run_job(db: AsyncSession, job: Job) -> bool:
    handler = _handlers.get(job.type)
    if handler is None:
        job.status = "dead"
        job.last_error = f"Kein Handler für Jobtyp '{job.type}'."
        job.error_category = "config"
        job.finished_at = utcnow()
        await db.commit()
        return False
    try:
        result = await handler(db, job)
        job.status = "done"
        job.result = result or {}
        job.finished_at = utcnow()
        job.last_error = None
        await db.commit()
        return True
    except Exception as e:  # noqa: BLE001
        stack = traceback.format_exc()
        await db.rollback()
        await db.refresh(job)  # Objekt nach Rollback neu laden (Status 'running' ist bereits committed)
        category = categorize_error(e)
        job.last_error = str(e)[:2000]
        job.error_category = category
        retry = job.attempts < job.max_attempts and category not in ("auth_or_config", "budget_or_killswitch")
        if retry:
            backoff = min(2**job.attempts * 15, 3600)
            job.status = "queued"
            job.run_at = utcnow() + timedelta(seconds=backoff)
        else:
            job.status = "dead"
            job.finished_at = utcnow()
        db.add(job)
        await record_error(
            db, source=f"job:{job.type}", message=str(e), stack=stack, context={"job_id": job.id, "attempt": job.attempts, "category": category}, tenant_id=job.tenant_id
        )
        await db.commit()
        log.warning("job.failed", type=job.type, attempt=job.attempts, retry=retry, error=str(e)[:200])
        return False


async def run_pending(db: AsyncSession, limit: int = 50) -> dict:
    """Führt bis zu `limit` fällige Jobs aus (für Worker-Schleife und Tests)."""
    ran = ok = 0
    while ran < limit:
        job = await claim_next(db)
        if job is None:
            break
        ran += 1
        if await run_job(db, job):
            ok += 1
    return {"ran": ran, "ok": ok}

"""Worker-Prozess: Jobwarteschlange + Zeitplan. Start: `python -m app.workers.runner`."""

from __future__ import annotations

import asyncio
import signal
from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import get_sessionmaker, utcnow
from app.core.logging import configure_logging, get_logger
from app.models.ops import ScheduleState
from app.services.jobs import enqueue, run_pending
from app.workers import handlers  # noqa: F401

log = get_logger("worker")

# name → (Intervall, Jobtyp, Payload, kritisch)
SCHEDULE: dict[str, tuple[timedelta, str, dict, bool]] = {
    "ops_check": (timedelta(minutes=15), "agent_run", {"agent": "ops"}, True),
    "quote_followups": (timedelta(hours=1), "quote_followups", {}, False),
    "support_agent": (timedelta(minutes=10), "agent_run", {"agent": "support"}, False),
    "sales_agent": (timedelta(hours=6), "agent_run", {"agent": "sales"}, False),
    "finance_agent": (timedelta(hours=24), "agent_run", {"agent": "finance"}, False),
    "marketing_agent": (timedelta(hours=24), "agent_run", {"agent": "marketing"}, False),
    "product_dev_agent": (timedelta(hours=12), "agent_run", {"agent": "product_dev"}, False),
    "director_agent": (timedelta(hours=24), "agent_run", {"agent": "director"}, False),
    "weekly_reports": (timedelta(days=7), "weekly_reports", {}, False),
    "retention": (timedelta(days=1), "retention", {}, True),
}


async def tick_schedule(db) -> int:
    now = utcnow()
    n = 0
    states = {s.name: s for s in (await db.execute(select(ScheduleState))).scalars().all()}
    for name, (interval, job_type, payload, critical) in SCHEDULE.items():
        st = states.get(name)
        if st is None:
            st = ScheduleState(name=name, last_run_at=None)
            db.add(st)
        if st.last_run_at is None or st.last_run_at + interval <= now:
            await enqueue(db, job_type, payload, dedupe_key=f"sched:{name}", priority=4, critical=critical)
            st.last_run_at = now
            st.last_status = "queued"
            n += 1
    await db.commit()
    return n


async def worker_loop(stop: asyncio.Event) -> None:
    s = get_settings()
    sm = get_sessionmaker()
    log.info("worker.start", poll=s.worker_poll_seconds)
    while not stop.is_set():
        try:
            async with sm() as db:
                await tick_schedule(db)
            async with sm() as db:
                res = await run_pending(db, limit=20)
                if res["ran"]:
                    log.info("worker.batch", **res)
        except Exception as e:  # noqa: BLE001
            log.error("worker.loop_error", error=str(e)[:300])
        try:
            await asyncio.wait_for(stop.wait(), timeout=s.worker_poll_seconds)
        except TimeoutError:
            pass
    log.info("worker.stop")


def main() -> None:
    configure_logging()
    stop = asyncio.Event()
    loop = asyncio.new_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    loop.run_until_complete(worker_loop(stop))


if __name__ == "__main__":
    main()

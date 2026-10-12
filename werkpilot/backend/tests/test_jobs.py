from sqlalchemy import select

from app.core.system import activate_kill_switch, deactivate_kill_switch
from app.models.ops import ErrorReport, Job
from app.services.jobs import enqueue, job_handler, run_pending


@job_handler("test_ok")
async def _ok(db, job):
    return {"hello": job.payload.get("x")}


@job_handler("test_fail")
async def _fail(db, job):
    raise RuntimeError("connection timeout to provider")


@job_handler("test_config_fail")
async def _cfg(db, job):
    raise RuntimeError("401 unauthorized: invalid api key")


async def test_enqueue_run_dedupe(db):
    j1 = await enqueue(db, "test_ok", {"x": 1}, dedupe_key="k1")
    j2 = await enqueue(db, "test_ok", {"x": 2}, dedupe_key="k1")
    await db.commit()
    assert j1.id == j2.id
    res = await run_pending(db)
    assert res == {"ran": 1, "ok": 1}
    j = await db.get(Job, j1.id)
    await db.refresh(j)
    assert j.status == "done" and j.result == {"hello": 1}


async def test_retry_backoff_then_dead_and_error_report(db):
    j = await enqueue(db, "test_fail", max_attempts=2)
    await db.commit()
    res = await run_pending(db)
    assert res["ran"] == 1 and res["ok"] == 0
    await db.refresh(j)
    assert j.status == "queued" and j.attempts == 1 and j.error_category == "transient_network" and j.run_at > j.created_at
    # zweiter Versuch sofort fällig machen
    from app.core.db import utcnow

    j.run_at = utcnow()
    await db.commit()
    await run_pending(db)
    await db.refresh(j)
    assert j.status == "dead" and j.attempts == 2
    rep = (await db.execute(select(ErrorReport))).scalars().all()
    assert len(rep) == 1 and rep[0].occurrences == 2 and rep[0].source == "job:test_fail"


async def test_config_error_no_retry(db):
    j = await enqueue(db, "test_config_fail")
    await db.commit()
    await run_pending(db)
    await db.refresh(j)
    assert j.status == "dead" and j.attempts == 1 and j.error_category == "auth_or_config"


async def test_unknown_handler_dead(db):
    j = await enqueue(db, "does_not_exist")
    await db.commit()
    await run_pending(db)
    await db.refresh(j)
    assert j.status == "dead"


async def test_kill_switch_blocks_non_critical_jobs(db):
    a = await enqueue(db, "test_ok", {"x": "normal"})
    b = await enqueue(db, "test_ok", {"x": "critical"}, critical=True)
    await activate_kill_switch(db, "test", "test")
    await db.commit()
    res = await run_pending(db)
    assert res["ran"] == 1
    await db.refresh(a)
    await db.refresh(b)
    assert a.status == "queued" and b.status == "done"
    await deactivate_kill_switch(db, "test")
    await db.commit()
    assert (await run_pending(db))["ran"] == 1


async def test_scheduler_enqueues_each_task_once(db):
    from app.workers.runner import SCHEDULE, tick_schedule

    n = await tick_schedule(db)
    assert n == len(SCHEDULE)
    assert await tick_schedule(db) == 0
    jobs = (await db.execute(select(Job))).scalars().all()
    assert {j.type for j in jobs} >= {"agent_run", "quote_followups", "weekly_reports", "retention"}

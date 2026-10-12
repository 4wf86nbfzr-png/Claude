"""Betreiber-API: Tarife, Not-Aus, Budgets, Freigaben, Agenten, Betriebsübersicht, Finanzen."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.db import get_db, utcnow
from app.core.deps import require_operator
from app.core.system import (
    KEY_AI_BUDGET,
    KEY_AUTONOMY,
    activate_kill_switch,
    all_settings,
    deactivate_kill_switch,
    set_setting,
)
from app.models.billing import AIUsage, ExpenseEntry, Plan
from app.models.core import Tenant, User
from app.models.crm import Report
from app.models.ops import AgentRun, AgentTask, Approval, ContentPiece, ErrorReport, Job, Lead, SupportTicket
from app.services.jobs import enqueue

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_operator)])


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str
    description: str = ""
    price_cents_monthly: int = Field(ge=0)
    features: list[str] = Field(default_factory=list)
    limits: dict = Field(default_factory=dict)
    stripe_price_id: str | None = None
    sort_order: int = 0
    is_active: bool = True
    is_public: bool = True


@router.get("/plans")
async def plans(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Plan).order_by(Plan.sort_order))).scalars().all()
    return [{"id": p.id, "code": p.code, "name": p.name, "description": p.description, "price_cents_monthly": p.price_cents_monthly, "features": p.features, "limits": p.limits, "stripe_price_id": p.stripe_price_id, "sort_order": p.sort_order, "is_active": p.is_active, "is_public": p.is_public} for p in rows]


@router.put("/plans/{code}")
async def upsert_plan(code: str, data: PlanIn, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    p = (await db.execute(select(Plan).where(Plan.code == code))).scalar_one_or_none()
    if p is None:
        p = Plan(code=code)
        db.add(p)
    for k, v in data.model_dump().items():
        if k != "code":
            setattr(p, k, v)
    await audit(db, "plan.updated", actor_type="user", actor_id=user.id, target_type="plan", target_id=code, details={"price": data.price_cents_monthly}, severity="security")
    await db.commit()
    return {"message": "Tarif gespeichert."}


@router.get("/system")
async def system(db: AsyncSession = Depends(get_db)):
    from app.core.config import get_settings
    from app.services import google_calendar
    from app.services.billing import stripe_configured
    from app.services.email import email_is_live
    from app.services.llm import get_provider

    s = get_settings()
    return {"settings": await all_settings(db), "providers": {"llm": get_provider().name, "email_live": email_is_live(), "stripe": stripe_configured(), "google_calendar": google_calendar.configured()},
            "env": s.env, "production_problems": s.validate_for_production(), "autonomy_enabled": s.autonomy_enabled}


@router.post("/kill-switch")
async def kill_switch(payload: dict, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    if payload.get("active"):
        res = await activate_kill_switch(db, str(payload.get("reason") or "manuell"), f"user:{user.id}")
        await audit(db, "system.kill_switch_on", actor_type="user", actor_id=user.id, details={"reason": payload.get("reason")}, severity="security")
    else:
        res = await deactivate_kill_switch(db, f"user:{user.id}")
        await audit(db, "system.kill_switch_off", actor_type="user", actor_id=user.id, severity="security")
    await db.commit()
    return res


@router.patch("/settings/{key}")
async def update_setting(key: str, payload: dict, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    if key not in (KEY_AI_BUDGET, KEY_AUTONOMY):
        raise HTTPException(404, "Unbekannte Einstellung.")
    res = await set_setting(db, key, payload, f"user:{user.id}")
    await audit(db, "system.setting_changed", actor_type="user", actor_id=user.id, details={"key": key, "value": payload}, severity="security")
    await db.commit()
    return res


@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    now = utcnow()
    day = now - timedelta(days=1)
    tenants = (await db.execute(select(func.count(Tenant.id)).where(Tenant.deleted_at.is_(None), Tenant.is_demo.is_(False)))).scalar_one()
    from app.models.billing import Subscription

    subs = (await db.execute(select(Subscription.status, func.count(Subscription.id)).group_by(Subscription.status))).all()
    jobs = (await db.execute(select(Job.status, func.count(Job.id)).group_by(Job.status))).all()
    dead = (await db.execute(select(Job).where(Job.status == "dead").order_by(Job.updated_at.desc()).limit(10))).scalars().all()
    errors_open = (await db.execute(select(func.count(ErrorReport.id)).where(ErrorReport.status == "open"))).scalar_one()
    ai_day = (await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at >= day))).scalar_one()
    ai_fail = (await db.execute(select(func.count(AIUsage.id)).where(AIUsage.created_at >= day, AIUsage.success.is_(False)))).scalar_one()
    approvals = (await db.execute(select(func.count(Approval.id)).where(Approval.status == "pending"))).scalar_one()
    tickets = (await db.execute(select(func.count(SupportTicket.id)).where(SupportTicket.status == "escalated"))).scalar_one()
    leads = (await db.execute(select(Lead.status, func.count(Lead.id)).group_by(Lead.status))).all()
    runs = (await db.execute(select(AgentRun).order_by(AgentRun.started_at.desc()).limit(20))).scalars().all()
    return {
        "tenants": tenants, "subscriptions": dict(subs), "jobs": dict(jobs),
        "dead_jobs": [{"id": j.id, "type": j.type, "error": (j.last_error or "")[:200], "category": j.error_category, "tenant_id": j.tenant_id} for j in dead],
        "errors_open": errors_open, "ai_cost_cents_24h": round(int(ai_day) / 1_000_000, 2), "ai_failures_24h": ai_fail,
        "approvals_pending": approvals, "tickets_escalated": tickets, "leads": dict(leads),
        "agent_runs": [{"id": r.id, "agent": r.agent, "status": r.status, "started_at": r.started_at.isoformat(), "summary": r.summary[:300], "cost_cents": round(r.cost_microcents / 1_000_000, 3)} for r in runs],
    }


@router.get("/approvals")
async def approvals(status: str = "pending", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Approval).where(Approval.status == status).order_by(Approval.created_at.desc()).limit(100))).scalars().all()
    return [{"id": a.id, "kind": a.kind, "title": a.title, "description": a.description, "payload": a.payload, "risk_level": a.risk_level, "requested_by": a.requested_by, "tenant_id": a.tenant_id, "created_at": a.created_at.isoformat(), "status": a.status} for a in rows]


@router.post("/approvals/{approval_id}/decide")
async def decide(approval_id: str, payload: dict, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    a = await db.get(Approval, approval_id)
    if not a or a.status != "pending":
        raise HTTPException(404, "Freigabe nicht gefunden oder bereits entschieden.")
    decision = payload.get("decision")
    if decision not in ("approved", "rejected"):
        raise HTTPException(422, "decision muss approved oder rejected sein.")
    a.status = decision
    a.decided_by = user.id
    a.decided_at = utcnow()
    a.decision_note = payload.get("note")
    await audit(db, f"approval.{decision}", actor_type="user", actor_id=user.id, target_type="approval", target_id=a.id, details={"kind": a.kind}, severity="security")
    if decision == "approved":
        await enqueue(db, "execute_approved", {"approval_id": a.id}, priority=2)
    await db.commit()
    return {"status": a.status}


@router.get("/tasks")
async def tasks(status: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(AgentTask)
    if status:
        stmt = stmt.where(AgentTask.status == status)
    rows = (await db.execute(stmt.order_by(AgentTask.priority, AgentTask.created_at.desc()).limit(200))).scalars().all()
    return [{"id": t.id, "title": t.title, "description": t.description, "assigned_to": t.assigned_to, "created_by": t.created_by, "priority": t.priority, "status": t.status, "requires_approval": t.requires_approval, "result": t.result, "lesson": t.lesson, "created_at": t.created_at.isoformat()} for t in rows]


@router.get("/agent-runs")
async def agent_runs(agent: str | None = None, limit: int = 50, db: AsyncSession = Depends(get_db)):
    stmt = select(AgentRun)
    if agent:
        stmt = stmt.where(AgentRun.agent == agent)
    rows = (await db.execute(stmt.order_by(AgentRun.started_at.desc()).limit(min(limit, 200)))).scalars().all()
    return [{"id": r.id, "agent": r.agent, "status": r.status, "trigger": r.trigger, "started_at": r.started_at.isoformat(), "finished_at": r.finished_at.isoformat() if r.finished_at else None, "summary": r.summary, "findings": r.findings, "actions": r.actions, "cost_cents": round(r.cost_microcents / 1_000_000, 3), "error": r.error} for r in rows]


@router.post("/agents/{agent}/run")
async def run_agent(agent: str, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    from app.agents.registry import AGENTS

    if agent not in AGENTS:
        raise HTTPException(404, f"Unbekannter Agent. Verfügbar: {', '.join(AGENTS)}")
    job = await enqueue(db, "agent_run", {"agent": agent, "trigger": f"manual:{user.id}"}, priority=1, critical=agent == "ops")
    await db.commit()
    return {"job_id": job.id}


@router.get("/errors")
async def errors(status: str = "open", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ErrorReport).where(ErrorReport.status == status).order_by(ErrorReport.last_seen_at.desc()).limit(100))).scalars().all()
    return [{"id": e.id, "source": e.source, "message": e.message[:500], "occurrences": e.occurrences, "last_seen_at": e.last_seen_at.isoformat(), "status": e.status, "reproducible": e.reproducible, "analysis": e.analysis, "context": e.context} for e in rows]


@router.patch("/errors/{error_id}")
async def update_error(error_id: str, payload: dict, db: AsyncSession = Depends(get_db)):
    e = await db.get(ErrorReport, error_id)
    if not e:
        raise HTTPException(404, "Nicht gefunden.")
    if payload.get("status") in ("open", "triaged", "fixed", "ignored"):
        e.status = payload["status"]
    await db.commit()
    return {"status": e.status}


@router.get("/jobs")
async def jobs(status: str = "dead", db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Job).where(Job.status == status).order_by(Job.updated_at.desc()).limit(100))).scalars().all()
    return [{"id": j.id, "type": j.type, "tenant_id": j.tenant_id, "attempts": j.attempts, "error": j.last_error, "category": j.error_category, "run_at": j.run_at.isoformat(), "payload": j.payload} for j in rows]


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str, db: AsyncSession = Depends(get_db)):
    j = await db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Job nicht gefunden.")
    j.status = "queued"
    j.attempts = 0
    j.run_at = utcnow()
    await db.commit()
    return {"message": "Erneut eingeplant."}


@router.get("/reports")
async def reports(kind: str | None = None, db: AsyncSession = Depends(get_db)):
    stmt = select(Report).where(Report.tenant_id.is_(None))
    if kind:
        stmt = stmt.where(Report.kind == kind)
    rows = (await db.execute(stmt.order_by(Report.created_at.desc()).limit(60))).scalars().all()
    return [{"id": r.id, "kind": r.kind, "created_at": r.created_at.isoformat(), "data": r.data, "summary_text": r.summary_text} for r in rows]


@router.get("/finance")
async def finance(db: AsyncSession = Depends(get_db)):
    from app.agents.finance import finance_snapshot

    return await finance_snapshot(db)


class ExpenseIn(BaseModel):
    category: str
    vendor: str
    amount_cents: int = Field(ge=0)
    period_month: str = Field(pattern=r"^\d{4}-\d{2}$")
    note: str | None = None


@router.post("/expenses", status_code=201)
async def add_expense(data: ExpenseIn, db: AsyncSession = Depends(get_db)):
    e = ExpenseEntry(**data.model_dump(), source="manual")
    db.add(e)
    await db.commit()
    return {"id": e.id}


@router.get("/leads")
async def leads(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Lead).order_by(Lead.created_at.desc()).limit(200))).scalars().all()
    return [{"id": l.id, "company": l.company, "contact_name": l.contact_name, "email": l.email, "trade": l.trade, "size": l.size, "source": l.source, "consent_basis": l.consent_basis, "fit_score": l.fit_score, "fit_reasons": l.fit_reasons, "status": l.status, "next_action": l.next_action, "next_action_at": l.next_action_at.isoformat() if l.next_action_at else None, "notes": l.notes} for l in rows]


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: dict, db: AsyncSession = Depends(get_db)):
    l = await db.get(Lead, lead_id)
    if not l:
        raise HTTPException(404, "Nicht gefunden.")
    for k in ("status", "notes", "next_action"):
        if k in payload:
            setattr(l, k, payload[k])
    await db.commit()
    return {"status": l.status}


@router.get("/content")
async def content(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ContentPiece).order_by(ContentPiece.updated_at.desc()).limit(100))).scalars().all()
    return [{"id": c.id, "slug": c.slug, "title": c.title, "kind": c.kind, "status": c.status, "target_keyword": c.target_keyword, "audience": c.audience, "checks": c.checks, "published_at": c.published_at.isoformat() if c.published_at else None, "metrics": c.metrics, "meta_description": c.meta_description, "body_markdown": c.body_markdown} for c in rows]


@router.get("/tickets")
async def tickets(status: str | None = "escalated", db: AsyncSession = Depends(get_db)):
    stmt = select(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    rows = (await db.execute(stmt.order_by(SupportTicket.created_at.desc()).limit(100))).scalars().all()
    return [{"id": t.id, "tenant_id": t.tenant_id, "subject": t.subject, "category": t.category, "priority": t.priority, "status": t.status, "escalation_reason": t.escalation_reason, "created_at": t.created_at.isoformat()} for t in rows]


@router.post("/tickets/{ticket_id}/reply")
async def operator_reply(ticket_id: str, payload: dict, user: User = Depends(require_operator), db: AsyncSession = Depends(get_db)):
    from app.models.ops import SupportMessage

    t = await db.get(SupportTicket, ticket_id)
    if not t:
        raise HTTPException(404, "Nicht gefunden.")
    db.add(SupportMessage(ticket_id=t.id, author_type="operator", author_id=user.id, body=str(payload.get("body", ""))[:10000]))
    t.status = payload.get("status") or "answered"
    if t.email:
        from app.services.email import send_email

        await send_email(db, to=t.email, subject=f"Re: {t.subject}", text=str(payload.get("body", "")), kind="transactional", tenant_id=t.tenant_id)
    await db.commit()
    return {"status": t.status}

"""Job-Handler, die nicht in den Fachmodulen liegen: Agentenläufe, Support-Antworten, Lead-Qualifizierung, Freigaben."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.db import utcnow
from app.models.ops import Approval, ContentPiece, Job
from app.services import followups, inquiries, webhooks_out  # noqa: F401 – registriert Handler
from app.services.jobs import job_handler


@job_handler("agent_run")
async def _agent_run(db: AsyncSession, job: Job) -> dict:
    from app.agents.registry import AGENTS

    agent_cls = AGENTS[job.payload["agent"]]
    run = await agent_cls().run(db, trigger=job.payload.get("trigger", "schedule"), tenant_id=job.payload.get("tenant_id"))
    return {"run_id": run.id, "status": run.status, "summary": run.summary[:300]}


@job_handler("support_answer")
async def _support_answer(db: AsyncSession, job: Job) -> dict:
    from app.agents.support import answer_ticket

    t = await answer_ticket(db, job.payload["ticket_id"])
    return {"status": t.status if t else "missing"}


@job_handler("qualify_lead")
async def _qualify_lead(db: AsyncSession, job: Job) -> dict:
    from app.agents.sales import qualify_lead

    lead = await qualify_lead(db, job.payload["lead_id"])
    return {"fit_score": lead.fit_score if lead else None}


@job_handler("execute_approved")
async def _execute_approved(db: AsyncSession, job: Job) -> dict:
    """Führt genehmigte Freigaben aus. Nur eng definierte Aktionen."""
    a = await db.get(Approval, job.payload["approval_id"], populate_existing=True)
    if not a or a.status != "approved":
        return {"skipped": True}
    if a.kind == "publish_content":
        c = await db.get(ContentPiece, a.payload.get("content_id", ""), populate_existing=True)
        if c and c.status in ("review", "approved") and (c.checks or {}).get("passed"):
            c.status = "approved"
            c.scheduled_for = c.scheduled_for or utcnow()
            await audit(db, "content.approved", actor_type="user", actor_id=a.decided_by, target_type="content", target_id=c.id)
            return {"content": c.slug, "status": c.status}
        return {"error": "Inhalt nicht gefunden oder Prüfung nicht bestanden"}
    if a.kind == "code_change":
        # Code-Änderungen werden nie automatisch produktiv gesetzt; die Freigabe erlaubt die Vorbereitung eines Branches.
        from sqlalchemy import select

        from app.models.ops import AgentTask

        t = (await db.execute(select(AgentTask).where(AgentTask.approval_id == a.id))).scalar_one_or_none()
        if t:
            t.status = "done"
            t.result = {"summary": "Freigegeben – Änderung wird auf separatem Branch vorbereitet (manueller Merge nach Tests)."}
        return {"task": t.id if t else None}
    return {"error": f"Unbekannte Freigabeart {a.kind}"}

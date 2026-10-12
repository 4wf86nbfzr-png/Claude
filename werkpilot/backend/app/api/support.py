from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import AuthContext, require_tenant
from app.models.ops import KnowledgeArticle, SupportMessage, SupportTicket
from app.services.jobs import enqueue

router = APIRouter(prefix="/api/support", tags=["support"])


@router.get("/articles")
async def articles(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.is_published.is_(True)).order_by(KnowledgeArticle.category, KnowledgeArticle.title))).scalars().all()
    return [{"slug": a.slug, "title": a.title, "category": a.category, "body": a.body} for a in rows]


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=5, max_length=10000)


@router.get("/tickets")
async def tickets(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(SupportTicket).where(SupportTicket.tenant_id == ctx.tenant_id).order_by(SupportTicket.created_at.desc()).limit(100))).scalars().all()
    return [{"id": t.id, "subject": t.subject, "category": t.category, "priority": t.priority, "status": t.status, "created_at": t.created_at.isoformat(), "source": t.source} for t in rows]


@router.post("/tickets", status_code=201)
async def create_ticket(data: TicketIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    t = SupportTicket(tenant_id=ctx.tenant_id, user_id=ctx.user.id, email=ctx.user.email, subject=data.subject, source="user")
    db.add(t)
    await db.flush()
    db.add(SupportMessage(ticket_id=t.id, author_type="user", author_id=ctx.user.id, body=data.body))
    await enqueue(db, "support_answer", {"ticket_id": t.id}, tenant_id=ctx.tenant_id, dedupe_key=f"support_answer:{t.id}", priority=3)
    await db.commit()
    return {"id": t.id}


@router.get("/tickets/{ticket_id}")
async def get_ticket(ticket_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Ticket nicht gefunden.")
    msgs = (await db.execute(select(SupportMessage).where(SupportMessage.ticket_id == t.id).order_by(SupportMessage.created_at))).scalars().all()
    return {"id": t.id, "subject": t.subject, "category": t.category, "priority": t.priority, "status": t.status, "resolution": t.resolution,
            "messages": [{"id": m.id, "author_type": m.author_type, "body": m.body, "created_at": m.created_at.isoformat(), "meta": m.meta} for m in msgs]}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(ticket_id: str, payload: dict, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Ticket nicht gefunden.")
    body = str(payload.get("body", "")).strip()
    if not body:
        raise HTTPException(422, "Nachricht fehlt.")
    db.add(SupportMessage(ticket_id=t.id, author_type="user", author_id=ctx.user.id, body=body[:10000]))
    t.status = "open"
    await enqueue(db, "support_answer", {"ticket_id": t.id}, tenant_id=ctx.tenant_id, priority=3)
    await db.commit()
    return {"message": "Gesendet."}


@router.post("/tickets/{ticket_id}/close")
async def close_ticket(ticket_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    t = await db.get(SupportTicket, ticket_id)
    if not t or t.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Ticket nicht gefunden.")
    t.status = "closed"
    await db.commit()
    return {"message": "Geschlossen."}

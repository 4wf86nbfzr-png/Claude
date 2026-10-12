from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.db import get_db, utcnow
from app.core.deps import AuthContext, require_tenant
from app.models.crm import (
    INQ_CLOSED,
    INQ_LOST,
    INQ_QUOTED,
    INQ_SCHEDULED,
    INQ_SPAM,
    INQ_WON,
    OPEN_STATES,
    Appointment,
    Customer,
    Draft,
    Inquiry,
    Message,
    Quote,
)
from app.services.features import F_APPOINTMENTS, F_INQUIRIES, F_QUOTE_FOLLOWUP, entitlements, require_feature
from app.services.inquiries import create_inquiry, process_inquiry, send_draft
from app.services.jobs import enqueue

router = APIRouter(prefix="/api", tags=["inquiries"])


def _inq(i: Inquiry) -> dict:
    return {
        "id": i.id,
        "channel": i.channel,
        "subject": i.subject,
        "body": i.body,
        "sender_name": i.sender_name,
        "sender_email": i.sender_email,
        "sender_phone": i.sender_phone,
        "status": i.status,
        "category": i.category,
        "priority": i.priority,
        "confidence": i.confidence,
        "summary": i.summary,
        "extracted": i.extracted,
        "missing_info": i.missing_info,
        "needs_human": i.needs_human,
        "needs_human_reason": i.needs_human_reason,
        "customer_id": i.customer_id,
        "created_at": i.created_at.isoformat(),
        "first_response_at": i.first_response_at.isoformat() if i.first_response_at else None,
        "last_activity_at": i.last_activity_at.isoformat() if i.last_activity_at else None,
        "ai_provider": (i.ai_notes or {}).get("provider"),
    }


def _draft(d: Draft) -> dict:
    return {
        "id": d.id,
        "inquiry_id": d.inquiry_id,
        "kind": d.kind,
        "subject": d.subject,
        "body": d.body,
        "status": d.status,
        "generated_by": d.generated_by,
        "confidence": d.confidence,
        "review_flags": d.review_flags,
        "proposed_slots": d.proposed_slots,
        "created_at": d.created_at.isoformat(),
        "approved_at": d.approved_at.isoformat() if d.approved_at else None,
    }


class InquiryCreate(BaseModel):
    subject: str = Field(default="", max_length=300)
    body: str = Field(min_length=3, max_length=20000)
    sender_name: str = Field(default="", max_length=200)
    sender_email: EmailStr | None = None
    sender_phone: str | None = Field(default=None, max_length=60)
    channel: str = "manual"


async def _monthly_limit_check(db: AsyncSession, tenant_id: str, ent: dict) -> None:
    cap = ent["limits"].get("inquiries_per_month")
    if cap is None:
        return
    since = utcnow() - timedelta(days=30)
    n = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tenant_id, Inquiry.created_at >= since))).scalar_one()
    if n >= cap:
        raise HTTPException(402, f"Das monatliche Anfragekontingent ({cap}) ist erreicht. Bitte Tarif anpassen.")


@router.get("/inquiries")
async def list_inquiries(
    status: str | None = None,
    q: str | None = None,
    open_only: bool = False,
    limit: int = Query(50, le=200),
    offset: int = 0,
    ctx: AuthContext = Depends(require_tenant),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Inquiry).where(Inquiry.tenant_id == ctx.tenant_id)
    if status:
        stmt = stmt.where(Inquiry.status == status)
    if open_only:
        stmt = stmt.where(Inquiry.status.in_(OPEN_STATES))
    if q:
        like = f"%{q[:100]}%"
        stmt = stmt.where((Inquiry.subject.ilike(like)) | (Inquiry.sender_name.ilike(like)) | (Inquiry.sender_email.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Inquiry.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"total": total, "items": [_inq(i) for i in rows]}


@router.post("/inquiries", status_code=201)
async def create(data: InquiryCreate, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    ent = await require_feature(db, ctx.tenant_id, F_INQUIRIES)
    await _monthly_limit_check(db, ctx.tenant_id, ent)
    inq = await create_inquiry(
        db,
        ctx.tenant,
        channel="manual" if data.channel not in ("manual", "phone") else data.channel,
        subject=data.subject,
        body=data.body,
        sender_name=data.sender_name,
        sender_email=data.sender_email,
        sender_phone=data.sender_phone,
        actor=f"user:{ctx.user.id}",
        process=False,
    )
    await db.commit()
    # synchron verarbeiten, damit der Nutzer sofort einen Entwurf sieht; bei Fehlern bleibt sie 'needs_review'
    try:
        await process_inquiry(db, inq.id)
        await db.commit()
    except Exception as e:  # noqa: BLE001
        await db.rollback()
        await enqueue(db, "process_inquiry", {"inquiry_id": inq.id}, tenant_id=ctx.tenant_id, dedupe_key=f"process_inquiry:{inq.id}")
        await db.commit()
        inq = await db.get(Inquiry, inq.id)
        inq.ai_notes = {"error": str(e)[:200]}
    inq = await db.get(Inquiry, inq.id)
    return _inq(inq)


@router.get("/inquiries/{inquiry_id}")
async def get_inquiry(inquiry_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq or inq.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Anfrage nicht gefunden.")
    msgs = (await db.execute(select(Message).where(Message.inquiry_id == inq.id).order_by(Message.created_at))).scalars().all()
    drafts = (await db.execute(select(Draft).where(Draft.inquiry_id == inq.id).order_by(Draft.created_at.desc()))).scalars().all()
    appts = (await db.execute(select(Appointment).where(Appointment.inquiry_id == inq.id).order_by(Appointment.starts_at))).scalars().all()
    quotes = (await db.execute(select(Quote).where(Quote.inquiry_id == inq.id))).scalars().all()
    customer = await db.get(Customer, inq.customer_id) if inq.customer_id else None
    return {
        **_inq(inq),
        "customer": {"id": customer.id, "name": customer.name, "email": customer.email, "phone": customer.phone, "address": customer.address} if customer else None,
        "messages": [
            {
                "id": m.id,
                "direction": m.direction,
                "channel": m.channel,
                "sender": m.sender,
                "recipient": m.recipient,
                "subject": m.subject,
                "body": m.body,
                "delivery_status": m.delivery_status,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
        "drafts": [_draft(d) for d in drafts],
        "appointments": [{"id": a.id, "title": a.title, "starts_at": a.starts_at.isoformat(), "ends_at": a.ends_at.isoformat(), "status": a.status} for a in appts],
        "quotes": [{"id": q.id, "title": q.title, "status": q.status, "amount_cents": q.amount_cents, "followup_count": q.followup_count} for q in quotes],
    }


class StatusIn(BaseModel):
    status: str


@router.patch("/inquiries/{inquiry_id}/status")
async def set_status(inquiry_id: str, data: StatusIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq or inq.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Anfrage nicht gefunden.")
    if data.status not in (*OPEN_STATES, INQ_WON, INQ_LOST, INQ_CLOSED, INQ_SPAM, INQ_QUOTED, INQ_SCHEDULED):
        raise HTTPException(422, "Ungültiger Status.")
    inq.status = data.status
    inq.last_activity_at = utcnow()
    if data.status in (INQ_WON, INQ_LOST, INQ_CLOSED, INQ_SPAM):
        inq.closed_at = utcnow()
    await audit(
        db,
        "inquiry.status_changed",
        actor_type="user",
        actor_id=ctx.user.id,
        tenant_id=ctx.tenant_id,
        target_type="inquiry",
        target_id=inq.id,
        details={"status": data.status},
    )
    from app.services.webhooks_out import emit

    await emit(db, ctx.tenant_id, "inquiry.status_changed", {"id": inq.id, "status": data.status})
    await db.commit()
    return _inq(inq)


@router.post("/inquiries/{inquiry_id}/reprocess")
async def reprocess(inquiry_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq or inq.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Anfrage nicht gefunden.")
    await require_feature(db, ctx.tenant_id, F_INQUIRIES)
    await process_inquiry(db, inq.id)
    await db.commit()
    return _inq(await db.get(Inquiry, inq.id))


class NoteIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


@router.post("/inquiries/{inquiry_id}/notes", status_code=201)
async def add_note(inquiry_id: str, data: NoteIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    inq = await db.get(Inquiry, inquiry_id)
    if not inq or inq.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Anfrage nicht gefunden.")
    m = Message(tenant_id=ctx.tenant_id, inquiry_id=inq.id, direction="note", channel="internal", sender=ctx.user.email, body=data.body)
    db.add(m)
    inq.last_activity_at = utcnow()
    await db.commit()
    return {"id": m.id}


# --- Entwürfe -------------------------------------------------------------------------


@router.get("/drafts")
async def list_drafts(status: str = "pending", ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Draft).where(Draft.tenant_id == ctx.tenant_id, Draft.status == status).order_by(Draft.created_at.desc()).limit(100))).scalars().all()
    out = []
    for d in rows:
        inq = await db.get(Inquiry, d.inquiry_id)
        out.append({**_draft(d), "inquiry": _inq(inq) if inq else None})
    return out


class ApproveIn(BaseModel):
    subject: str | None = Field(default=None, max_length=300)
    body: str | None = Field(default=None, max_length=20000)


@router.post("/drafts/{draft_id}/approve")
async def approve_draft(draft_id: str, data: ApproveIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    d = await db.get(Draft, draft_id)
    if not d or d.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Entwurf nicht gefunden.")
    if d.status != "pending":
        raise HTTPException(409, "Entwurf wurde bereits bearbeitet.")
    await require_feature(db, ctx.tenant_id, F_INQUIRIES)
    try:
        msg = await send_draft(db, ctx.tenant, d, approved_by=ctx.user.id, subject=data.subject, body=data.body)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await db.commit()
    return {"draft": _draft(d), "delivery_status": msg.delivery_status, "message_id": msg.id}


@router.post("/drafts/{draft_id}/reject")
async def reject_draft(draft_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    d = await db.get(Draft, draft_id)
    if not d or d.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Entwurf nicht gefunden.")
    d.status = "rejected"
    d.approved_by = ctx.user.id
    d.approved_at = utcnow()
    await audit(db, "draft.rejected", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, target_type="draft", target_id=d.id)
    await db.commit()
    return _draft(d)


# --- Kunden ---------------------------------------------------------------------------


@router.get("/customers")
async def list_customers(
    q: str | None = None, limit: int = Query(50, le=200), offset: int = 0, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)
):
    stmt = select(Customer).where(Customer.tenant_id == ctx.tenant_id)
    if q:
        like = f"%{q[:100]}%"
        stmt = stmt.where((Customer.name.ilike(like)) | (Customer.email.ilike(like)) | (Customer.phone.ilike(like)))
    rows = (await db.execute(stmt.order_by(Customer.updated_at.desc()).limit(limit).offset(offset))).scalars().all()
    out = []
    for c in rows:
        n = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.customer_id == c.id))).scalar_one()
        out.append(
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "phone": c.phone,
                "address": c.address,
                "notes": c.notes,
                "tags": c.tags,
                "inquiries": n,
                "created_at": c.created_at.isoformat(),
            }
        )
    return out


class CustomerIn(BaseModel):
    name: str = Field(default="", max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=60)
    address: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=5000)
    tags: list[str] = Field(default_factory=list)


@router.post("/customers", status_code=201)
async def create_customer(data: CustomerIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    c = Customer(tenant_id=ctx.tenant_id, **data.model_dump())
    if c.email:
        c.email = c.email.lower()
    db.add(c)
    await db.commit()
    return {"id": c.id}


@router.patch("/customers/{customer_id}")
async def update_customer(customer_id: str, data: CustomerIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    c = await db.get(Customer, customer_id)
    if not c or c.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Kunde nicht gefunden.")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(c, k, v.lower() if (k == "email" and v) else v)
    await db.commit()
    return {"message": "Gespeichert."}


@router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    c = await db.get(Customer, customer_id)
    if not c or c.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Kunde nicht gefunden.")
    await db.delete(c)
    await audit(
        db, "customer.deleted", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, target_type="customer", target_id=customer_id, severity="security"
    )
    await db.commit()
    return {"message": "Gelöscht."}


# --- Termine --------------------------------------------------------------------------


@router.get("/appointments")
async def list_appointments(upcoming: bool = True, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    stmt = select(Appointment).where(Appointment.tenant_id == ctx.tenant_id)
    if upcoming:
        stmt = stmt.where(Appointment.ends_at >= utcnow())
    rows = (await db.execute(stmt.order_by(Appointment.starts_at).limit(200))).scalars().all()
    return [
        {
            "id": a.id,
            "inquiry_id": a.inquiry_id,
            "title": a.title,
            "starts_at": a.starts_at.isoformat(),
            "ends_at": a.ends_at.isoformat(),
            "status": a.status,
            "location": a.location,
            "notes": a.notes,
            "external_calendar_id": a.external_calendar_id,
        }
        for a in rows
    ]


class AppointmentIn(BaseModel):
    title: str = Field(max_length=300)
    starts_at: datetime
    ends_at: datetime
    inquiry_id: str | None = None
    location: str | None = None
    notes: str | None = None
    status: str = "confirmed"


@router.post("/appointments", status_code=201)
async def create_appointment(data: AppointmentIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    await require_feature(db, ctx.tenant_id, F_APPOINTMENTS)
    if data.ends_at <= data.starts_at:
        raise HTTPException(422, "Ende muss nach dem Beginn liegen.")
    a = Appointment(tenant_id=ctx.tenant_id, **data.model_dump())
    if a.inquiry_id:
        inq = await db.get(Inquiry, a.inquiry_id)
        if not inq or inq.tenant_id != ctx.tenant_id:
            raise HTTPException(404, "Anfrage nicht gefunden.")
        inq.status = INQ_SCHEDULED
        a.customer_id = inq.customer_id
    db.add(a)
    await db.flush()
    from app.services.google_calendar import create_event

    ext = await create_event(db, ctx.tenant_id, title=a.title, start=a.starts_at, end=a.ends_at, description=a.notes or "")
    a.external_calendar_id = ext
    await db.commit()
    return {"id": a.id, "external_calendar_id": ext}


@router.patch("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, payload: dict, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    a = await db.get(Appointment, appointment_id)
    if not a or a.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Termin nicht gefunden.")
    status = payload.get("status")
    if status in ("proposed", "confirmed", "canceled", "done"):
        a.status = status
        if status == "confirmed" and a.inquiry_id:
            inq = await db.get(Inquiry, a.inquiry_id)
            if inq:
                inq.status = INQ_SCHEDULED
            # andere Vorschläge derselben Anfrage freigeben
            others = (
                (await db.execute(select(Appointment).where(Appointment.inquiry_id == a.inquiry_id, Appointment.id != a.id, Appointment.status == "proposed")))
                .scalars()
                .all()
            )
            for o in others:
                o.status = "canceled"
            if not a.external_calendar_id:
                from app.services.google_calendar import create_event

                a.external_calendar_id = await create_event(db, ctx.tenant_id, title=a.title, start=a.starts_at, end=a.ends_at, description=a.notes or "")
    for f in ("title", "location", "notes"):
        if f in payload:
            setattr(a, f, payload[f])
    await db.commit()
    return {"message": "Gespeichert.", "status": a.status}


@router.get("/appointments/slots")
async def slots(duration: int = 60, count: int = 3, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    from app.services.availability import propose_slots
    from app.services.google_calendar import freebusy

    now = utcnow()
    external = await freebusy(db, ctx.tenant_id, now, now + timedelta(days=14))
    return await propose_slots(db, ctx.tenant, duration_minutes=duration, count=min(count, 10), external_busy=external)


# --- Angebote -------------------------------------------------------------------------


@router.get("/quotes")
async def list_quotes(status: str | None = "open", ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    stmt = select(Quote).where(Quote.tenant_id == ctx.tenant_id)
    if status:
        stmt = stmt.where(Quote.status == status)
    rows = (await db.execute(stmt.order_by(Quote.created_at.desc()).limit(200))).scalars().all()
    return [
        {
            "id": q.id,
            "inquiry_id": q.inquiry_id,
            "title": q.title,
            "amount_cents": q.amount_cents,
            "status": q.status,
            "sent_at": q.sent_at.isoformat() if q.sent_at else None,
            "valid_until": q.valid_until.isoformat() if q.valid_until else None,
            "followup_count": q.followup_count,
            "next_followup_at": q.next_followup_at.isoformat() if q.next_followup_at else None,
            "notes": q.notes,
        }
        for q in rows
    ]


class QuoteIn(BaseModel):
    title: str = Field(max_length=300)
    inquiry_id: str | None = None
    amount_cents: int | None = Field(default=None, ge=0)
    sent_at: datetime | None = None
    valid_until: datetime | None = None
    notes: str | None = None


@router.post("/quotes", status_code=201)
async def create_quote(data: QuoteIn, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    ent = await entitlements(db, ctx.tenant_id)
    if not ent["active"]:
        raise HTTPException(402, "Kein aktives Abonnement.")
    q = Quote(tenant_id=ctx.tenant_id, **data.model_dump())
    q.sent_at = q.sent_at or utcnow()
    days = int(ctx.tenant.settings.get("quote_followup_days", 5))
    q.next_followup_at = (q.sent_at + timedelta(days=days)) if F_QUOTE_FOLLOWUP in ent["features"] else None
    if q.inquiry_id:
        inq = await db.get(Inquiry, q.inquiry_id)
        if not inq or inq.tenant_id != ctx.tenant_id:
            raise HTTPException(404, "Anfrage nicht gefunden.")
        inq.status = INQ_QUOTED
        q.customer_id = inq.customer_id
    db.add(q)
    await db.commit()
    return {"id": q.id, "next_followup_at": q.next_followup_at.isoformat() if q.next_followup_at else None}


@router.patch("/quotes/{quote_id}")
async def update_quote(quote_id: str, payload: dict, ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    q = await db.get(Quote, quote_id)
    if not q or q.tenant_id != ctx.tenant_id:
        raise HTTPException(404, "Angebot nicht gefunden.")
    st = payload.get("status")
    if st in ("open", "accepted", "declined", "expired"):
        q.status = st
        if st != "open":
            q.next_followup_at = None
        if q.inquiry_id:
            inq = await db.get(Inquiry, q.inquiry_id)
            if inq and st == "accepted":
                inq.status = INQ_WON
                inq.closed_at = utcnow()
            elif inq and st == "declined":
                inq.status = INQ_LOST
                inq.closed_at = utcnow()
    if "amount_cents" in payload:
        q.amount_cents = int(payload["amount_cents"]) if payload["amount_cents"] is not None else None
    if "notes" in payload:
        q.notes = payload["notes"]
    await db.commit()
    return {"message": "Gespeichert.", "status": q.status}

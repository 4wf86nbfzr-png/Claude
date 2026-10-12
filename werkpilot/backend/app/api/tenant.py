from __future__ import annotations

import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.db import get_db, utcnow
from app.core.deps import AuthContext, require_admin, require_owner, require_tenant
from app.models.billing import AIUsage
from app.models.core import ROLE_ADMIN, ROLE_MEMBER, ROLE_OWNER, AuditLog, Membership, User
from app.models.crm import OPEN_STATES, Appointment, Customer, Draft, Inquiry, Message, Quote
from app.models.ops import Integration, Job, SupportTicket
from app.services import auth as auth_service
from app.services.features import entitlements
from app.services.followups import weekly_tenant_report

router = APIRouter(prefix="/api/tenant", tags=["tenant"])

ALLOWED_SETTINGS = {
    "auto_reply_enabled": bool,
    "auto_reply_min_confidence": float,
    "signature": str,
    "quote_followup_days": int,
    "appointment_lead_hours": int,
    "weekly_report_enabled": bool,
    "appointment_duration_minutes": int,
}


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    trade: str | None = None
    contact_email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=60)
    address: str | None = Field(default=None, max_length=500)
    timezone: str | None = None
    settings: dict | None = None
    business_hours: dict | None = None
    data_retention_days: int | None = Field(default=None, ge=30, le=3650)


@router.get("")
async def get_tenant(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    t = ctx.tenant
    ent = await entitlements(db, t.id)
    return {
        "id": t.id,
        "name": t.name,
        "slug": t.slug,
        "trade": t.trade,
        "contact_email": t.contact_email,
        "phone": t.phone,
        "address": t.address,
        "timezone": t.timezone,
        "settings": t.settings,
        "business_hours": t.business_hours,
        "data_retention_days": t.data_retention_days,
        "role": ctx.role,
        "entitlements": ent,
        "is_demo": t.is_demo,
    }


@router.patch("")
async def update_tenant(data: TenantUpdate, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    t = ctx.tenant
    for field in ("name", "trade", "contact_email", "phone", "address", "timezone", "data_retention_days"):
        v = getattr(data, field)
        if v is not None:
            setattr(t, field, v)
    if data.settings is not None:
        ent = await entitlements(db, t.id)
        new = dict(t.settings or {})
        for k, v in data.settings.items():
            if k not in ALLOWED_SETTINGS:
                continue
            if k == "auto_reply_enabled" and v and "automations" not in ent["features"]:
                raise HTTPException(403, "Automatische Antworten sind erst ab dem Tarif Business verfügbar.")
            try:
                new[k] = ALLOWED_SETTINGS[k](v)
            except (TypeError, ValueError):
                raise HTTPException(422, f"Ungültiger Wert für {k}.") from None
        if "auto_reply_min_confidence" in new:
            new["auto_reply_min_confidence"] = min(1.0, max(0.5, new["auto_reply_min_confidence"]))
        t.settings = new
    if data.business_hours is not None:
        t.business_hours = data.business_hours
    await audit(
        db, "tenant.updated", actor_type="user", actor_id=ctx.user.id, tenant_id=t.id, details={"fields": [k for k, v in data.model_dump().items() if v is not None]}
    )
    await db.commit()
    return {"message": "Gespeichert."}


@router.get("/dashboard")
async def dashboard(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    """Echte Zahlen aus der Datenbank — keine Platzhalter."""
    tid = ctx.tenant_id
    from datetime import timedelta

    now = utcnow()
    week = now - timedelta(days=7)
    month = now - timedelta(days=30)

    async def count(q):
        return int((await db.execute(q)).scalar_one())

    open_inq = await count(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tid, Inquiry.status.in_(OPEN_STATES)))
    needs_review = await count(select(func.count(Draft.id)).where(Draft.tenant_id == tid, Draft.status == "pending"))
    urgent = await count(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tid, Inquiry.priority == "urgent", Inquiry.status.in_(OPEN_STATES)))
    new_week = await count(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tid, Inquiry.created_at >= week))
    replies_week = await count(select(func.count(Message.id)).where(Message.tenant_id == tid, Message.direction == "out", Message.created_at >= week))
    quotes_open = await count(select(func.count(Quote.id)).where(Quote.tenant_id == tid, Quote.status == "open"))
    appts = await count(select(func.count(Appointment.id)).where(Appointment.tenant_id == tid, Appointment.status == "confirmed", Appointment.starts_at >= now))
    customers = await count(select(func.count(Customer.id)).where(Customer.tenant_id == tid))
    failed_jobs = await count(select(func.count(Job.id)).where(Job.tenant_id == tid, Job.status == "dead"))
    tickets_open = await count(select(func.count(SupportTicket.id)).where(SupportTicket.tenant_id == tid, SupportTicket.status.in_(["open", "escalated"])))
    ai_calls = await count(select(func.count(AIUsage.id)).where(AIUsage.tenant_id == tid, AIUsage.created_at >= month))
    ai_cost = int(
        (await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.tenant_id == tid, AIUsage.created_at >= month))).scalar_one()
    )
    resp = (
        await db.execute(
            select(Inquiry.created_at, Inquiry.first_response_at).where(Inquiry.tenant_id == tid, Inquiry.first_response_at.is_not(None), Inquiry.created_at >= month)
        )
    ).all()
    avg_resp = round(sum((b - a).total_seconds() for a, b in resp) / len(resp) / 3600, 1) if resp else None
    integrations = (await db.execute(select(Integration.type, Integration.status).where(Integration.tenant_id == tid))).all()
    recent = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tid).order_by(AuditLog.created_at.desc()).limit(15))).scalars().all()
    ent = await entitlements(db, tid)
    from app.services.email import email_is_live
    from app.services.llm import llm_is_live

    return {
        "inquiries": {"open": open_inq, "needs_review": needs_review, "urgent": urgent, "new_7d": new_week},
        "replies_7d": replies_week,
        "quotes_open": quotes_open,
        "appointments_upcoming": appts,
        "customers": customers,
        "avg_first_response_hours_30d": avg_resp,
        "ai": {
            "calls_30d": ai_calls,
            "cost_cents_30d": round(ai_cost / 1_000_000, 2),
            "budget_cents_month": ent["limits"].get("ai_budget_cents_month"),
            "calls_cap": ent["limits"].get("ai_calls_total"),
            "provider_live": llm_is_live(),
        },
        "email_live": email_is_live(),
        "failed_jobs": failed_jobs,
        "support_open": tickets_open,
        "integrations": [{"type": t, "status": s} for t, s in integrations],
        "entitlements": ent,
        "automation": {
            "auto_reply_enabled": bool(ctx.tenant.settings.get("auto_reply_enabled")),
            "weekly_report": bool(ctx.tenant.settings.get("weekly_report_enabled", True)),
        },
        "recent_events": [{"at": e.created_at.isoformat(), "action": e.action, "actor": e.actor_type, "details": e.details} for e in recent],
    }


# --- Nutzerverwaltung -------------------------------------------------------------


@router.get("/members")
async def members(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Membership, User).join(User, User.id == Membership.user_id).where(Membership.tenant_id == ctx.tenant_id))).all()
    return [{"user_id": u.id, "email": u.email, "full_name": u.full_name, "role": m.role, "verified": u.email_verified_at is not None} for m, u in rows]


class InviteIn(BaseModel):
    email: EmailStr
    role: str = ROLE_MEMBER


@router.post("/members/invite", status_code=201)
async def invite(data: InviteIn, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if data.role not in (ROLE_ADMIN, ROLE_MEMBER):
        raise HTTPException(422, "Rolle muss admin oder member sein.")
    ent = await entitlements(db, ctx.tenant_id)
    inv = await auth_service.invite_member(db, ctx.tenant, email=data.email, role=data.role, invited_by=ctx.user.id, max_users=ent["limits"].get("users"))
    await audit(db, "member.invited", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, details={"email": data.email, "role": data.role})
    await db.commit()
    return {"invitation_id": inv.id}


@router.patch("/members/{user_id}")
async def change_role(user_id: str, payload: dict, ctx: AuthContext = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    role = payload.get("role")
    if role not in (ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER):
        raise HTTPException(422, "Ungültige Rolle.")
    m = (await db.execute(select(Membership).where(Membership.tenant_id == ctx.tenant_id, Membership.user_id == user_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Mitglied nicht gefunden.")
    if m.user_id == ctx.user.id and role != ROLE_OWNER:
        owners = (await db.execute(select(func.count(Membership.id)).where(Membership.tenant_id == ctx.tenant_id, Membership.role == ROLE_OWNER))).scalar_one()
        if owners <= 1:
            raise HTTPException(400, "Der letzte Inhaber kann seine Rolle nicht abgeben.")
    m.role = role
    await audit(
        db, "member.role_changed", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, target_id=user_id, details={"role": role}, severity="security"
    )
    await db.commit()
    return {"message": "Rolle geändert."}


@router.delete("/members/{user_id}")
async def remove_member(user_id: str, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    m = (await db.execute(select(Membership).where(Membership.tenant_id == ctx.tenant_id, Membership.user_id == user_id))).scalar_one_or_none()
    if not m:
        raise HTTPException(404, "Mitglied nicht gefunden.")
    if m.role == ROLE_OWNER:
        raise HTTPException(400, "Inhaber können nicht entfernt werden.")
    await db.delete(m)
    await audit(db, "member.removed", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, target_id=user_id, severity="security")
    await db.commit()
    return {"message": "Entfernt."}


# --- Berichte, Export, Löschung ------------------------------------------------------


@router.post("/reports/weekly")
async def generate_weekly(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    rep = await weekly_tenant_report(db, ctx.tenant, deliver=False)
    await db.commit()
    return {"id": rep.id, "data": rep.data, "summary_text": rep.summary_text}


@router.get("/reports")
async def list_reports(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    from app.models.crm import Report

    rows = (await db.execute(select(Report).where(Report.tenant_id == ctx.tenant_id).order_by(Report.created_at.desc()).limit(30))).scalars().all()
    return [{"id": r.id, "kind": r.kind, "created_at": r.created_at.isoformat(), "data": r.data, "summary_text": r.summary_text} for r in rows]


@router.get("/audit")
async def audit_log(limit: int = 100, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(AuditLog).where(AuditLog.tenant_id == ctx.tenant_id).order_by(AuditLog.created_at.desc()).limit(min(limit, 500)))).scalars().all()
    return [
        {
            "at": e.created_at.isoformat(),
            "action": e.action,
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "target": e.target_type,
            "target_id": e.target_id,
            "details": e.details,
            "severity": e.severity,
        }
        for e in rows
    ]


@router.get("/export")
async def export_data(ctx: AuthContext = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    """DSGVO-Datenexport: alle Daten des Betriebs als JSON."""
    tid = ctx.tenant_id

    def rows(objs, fields):
        return [{f: (getattr(o, f).isoformat() if hasattr(getattr(o, f), "isoformat") else getattr(o, f)) for f in fields} for o in objs]

    customers = (await db.execute(select(Customer).where(Customer.tenant_id == tid))).scalars().all()
    inqs = (await db.execute(select(Inquiry).where(Inquiry.tenant_id == tid))).scalars().all()
    msgs = (await db.execute(select(Message).where(Message.tenant_id == tid))).scalars().all()
    appts = (await db.execute(select(Appointment).where(Appointment.tenant_id == tid))).scalars().all()
    quotes = (await db.execute(select(Quote).where(Quote.tenant_id == tid))).scalars().all()
    payload = {
        "exported_at": utcnow().isoformat(),
        "tenant": {"id": tid, "name": ctx.tenant.name, "settings": ctx.tenant.settings},
        "customers": rows(customers, ["id", "name", "email", "phone", "address", "notes", "created_at"]),
        "inquiries": rows(
            inqs, ["id", "channel", "subject", "body", "sender_name", "sender_email", "sender_phone", "status", "category", "priority", "summary", "created_at"]
        ),
        "messages": rows(msgs, ["id", "inquiry_id", "direction", "sender", "recipient", "subject", "body", "created_at"]),
        "appointments": rows(appts, ["id", "title", "starts_at", "ends_at", "status", "location"]),
        "quotes": rows(quotes, ["id", "title", "amount_cents", "status", "sent_at", "followup_count"]),
    }
    await audit(db, "tenant.exported", actor_type="user", actor_id=ctx.user.id, tenant_id=tid, severity="security")
    await db.commit()
    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode())
    return StreamingResponse(buf, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="werkpilot-export-{ctx.tenant.slug}.json"'})


def _csv_safe(value: str | None) -> str:
    """Verhindert Formel-Ausführung in Tabellenkalkulationen (CWE-1236)."""
    v = value or ""
    if v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


@router.get("/export/customers.csv")
async def export_customers_csv(ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    customers = (await db.execute(select(Customer).where(Customer.tenant_id == ctx.tenant_id))).scalars().all()
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Name", "E-Mail", "Telefon", "Adresse", "Notizen"])
    for c in customers:
        w.writerow([_csv_safe(c.name), _csv_safe(c.email), _csv_safe(c.phone), _csv_safe(c.address), _csv_safe(c.notes)])
    return StreamingResponse(io.BytesIO(out.getvalue().encode("utf-8-sig")), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="kunden.csv"'})


@router.post("/delete")
async def delete_tenant(payload: dict, ctx: AuthContext = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    """Kontolöschung: Betrieb wird deaktiviert (Soft-Delete) und nach Frist endgültig gelöscht. Aktives Abo muss gekündigt sein."""
    if payload.get("confirm") != ctx.tenant.slug:
        raise HTTPException(400, "Zur Bestätigung bitte den Betriebs-Kurznamen eingeben.")
    ent = await entitlements(db, ctx.tenant_id)
    if ent["status"] in ("active", "past_due") and not ent.get("cancel_at_period_end"):
        raise HTTPException(400, "Bitte zuerst das Abonnement kündigen (Abo verwalten).")
    ctx.tenant.is_active = False
    ctx.tenant.deleted_at = utcnow()
    await audit(db, "tenant.deletion_requested", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, severity="security")
    await db.commit()
    return {"message": "Betrieb deaktiviert. Daten werden nach Ablauf der Aufbewahrungsfrist endgültig gelöscht."}

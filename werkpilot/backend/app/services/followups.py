"""Angebotsnachverfolgung, Terminbestätigung, wöchentliche Kundenberichte (geplante Jobs)."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.models.billing import AIUsage
from app.models.core import Membership, Tenant, User
from app.models.crm import OPEN_STATES, Appointment, Draft, Inquiry, Message, Quote, Report
from app.services.email import send_email
from app.services.features import F_QUOTE_FOLLOWUP, entitlements
from app.services.jobs import job_handler


async def due_quote_followups(db: AsyncSession) -> int:
    """Erinnert den Betrieb (nicht den Endkunden) an offene Angebote; legt Nachfass-Entwurf an."""
    now = utcnow()
    rows = (await db.execute(select(Quote).where(Quote.status == "open", Quote.next_followup_at <= now))).scalars().all()
    count = 0
    for q in rows:
        tenant = await db.get(Tenant, q.tenant_id)
        if not tenant:
            continue
        ent = await entitlements(db, tenant.id)
        if F_QUOTE_FOLLOWUP not in ent["features"]:
            continue
        interval = int(tenant.settings.get("quote_followup_days", 5))
        q.followup_count += 1
        q.last_followup_at = now
        q.next_followup_at = now + timedelta(days=interval) if q.followup_count < 3 else None
        if q.inquiry_id:
            inq = await db.get(Inquiry, q.inquiry_id)
            if inq and inq.sender_email:
                body = (
                    f"Guten Tag{(' ' + inq.sender_name) if inq.sender_name else ''},\n\n"
                    f"wir hatten Ihnen ein Angebot zu „{q.title}“ geschickt. Gibt es dazu noch Fragen oder "
                    f"können wir Sie bei der Entscheidung unterstützen?\n\nFreundliche Grüße\n{tenant.settings.get('signature') or tenant.name}"
                )
                db.add(
                    Draft(
                        tenant_id=tenant.id,
                        inquiry_id=inq.id,
                        kind="followup",
                        subject=f"Ihr Angebot: {q.title}"[:300],
                        body=body,
                        status="pending",
                        generated_by="rule",
                        confidence=0.9,
                        review_flags=["Nachfassen – bitte freigeben"],
                    )
                )
        if tenant.contact_email:
            await send_email(
                db,
                to=tenant.contact_email,
                subject=f"Erinnerung: Angebot „{q.title}“ ist noch offen",
                text=f"Das Angebot „{q.title}“ ist seit {q.sent_at.strftime('%d.%m.%Y') if q.sent_at else 'kurzem'} offen "
                f"(Nachfass-Nr. {q.followup_count}). Im Dashboard liegt ein Nachfass-Entwurf zur Freigabe.",
                kind="report",
                tenant_id=tenant.id,
            )
        await audit(
            db,
            "quote.followup_reminded",
            actor_type="system",
            actor_id="scheduler",
            tenant_id=tenant.id,
            target_type="quote",
            target_id=q.id,
            details={"followup_count": q.followup_count},
        )
        count += 1
    await db.flush()
    return count


async def expire_stale_proposals(db: AsyncSession) -> int:
    """Nicht bestätigte Terminvorschläge in der Vergangenheit freigeben."""
    now = utcnow()
    rows = (await db.execute(select(Appointment).where(Appointment.status == "proposed", Appointment.starts_at < now))).scalars().all()
    for a in rows:
        a.status = "canceled"
    await db.flush()
    return len(rows)


async def weekly_tenant_report(db: AsyncSession, tenant: Tenant, deliver: bool = True) -> Report:
    end = utcnow()
    start = end - timedelta(days=7)
    inqs = (await db.execute(select(Inquiry).where(Inquiry.tenant_id == tenant.id, Inquiry.created_at >= start))).scalars().all()
    open_count = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tenant.id, Inquiry.status.in_(OPEN_STATES)))).scalar_one()
    response_times = [(i.first_response_at - i.created_at).total_seconds() / 3600 for i in inqs if i.first_response_at]
    avg_resp = round(sum(response_times) / len(response_times), 1) if response_times else None
    sent = (await db.execute(select(func.count(Message.id)).where(Message.tenant_id == tenant.id, Message.direction == "out", Message.created_at >= start))).scalar_one()
    quotes_open = (await db.execute(select(func.count(Quote.id)).where(Quote.tenant_id == tenant.id, Quote.status == "open"))).scalar_one()
    appts = (
        await db.execute(select(func.count(Appointment.id)).where(Appointment.tenant_id == tenant.id, Appointment.status == "confirmed", Appointment.starts_at >= end))
    ).scalar_one()
    ai_cost = (
        await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.tenant_id == tenant.id, AIUsage.created_at >= start))
    ).scalar_one()
    by_cat: dict[str, int] = {}
    for i in inqs:
        by_cat[i.category or "unbekannt"] = by_cat.get(i.category or "unbekannt", 0) + 1
    data = {
        "inquiries_new": len(inqs),
        "inquiries_open": int(open_count),
        "avg_first_response_hours": avg_resp,
        "replies_sent": int(sent),
        "quotes_open": int(quotes_open),
        "appointments_upcoming": int(appts),
        "by_category": by_cat,
        "ai_cost_cents": round(int(ai_cost) / 1_000_000, 2),
        "urgent": sum(1 for i in inqs if i.priority == "urgent"),
    }
    lines = [
        f"Wochenbericht {start.strftime('%d.%m.')}–{end.strftime('%d.%m.%Y')} für {tenant.name}",
        "",
        f"Neue Anfragen: {data['inquiries_new']} (davon dringend: {data['urgent']})",
        f"Offene Vorgänge gesamt: {data['inquiries_open']}",
        f"Durchschnittliche Zeit bis zur ersten Antwort: {avg_resp if avg_resp is not None else '–'} Std.",
        f"Versendete Antworten: {data['replies_sent']}",
        f"Offene Angebote: {data['quotes_open']}",
        f"Bestätigte Termine (bevorstehend): {data['appointments_upcoming']}",
    ]
    if by_cat:
        lines += ["", "Nach Kategorie:"] + [f"- {k}: {v}" for k, v in sorted(by_cat.items(), key=lambda x: -x[1])]
    text = "\n".join(lines)
    rep = Report(created_at=end, tenant_id=tenant.id, kind="weekly_customer", period_start=start, period_end=end, data=data, summary_text=text)
    db.add(rep)
    await db.flush()
    if deliver and tenant.settings.get("weekly_report_enabled", True):
        recipients = (
            (
                await db.execute(
                    select(User.email).join(Membership, Membership.user_id == User.id).where(Membership.tenant_id == tenant.id, Membership.role.in_(["owner", "admin"]))
                )
            )
            .scalars()
            .all()
        )
        for r in recipients:
            await send_email(db, to=r, subject=f"Ihr Wochenbericht – {tenant.name}", text=text, kind="report", tenant_id=tenant.id)
        rep.delivered_at = utcnow()
    return rep


async def enforce_retention(db: AsyncSession) -> int:
    """Löscht abgeschlossene Vorgänge nach Ablauf der je Betrieb konfigurierten Frist; Mandanten nach Vertragsende."""
    s = get_settings()
    deleted = 0
    tenants = (await db.execute(select(Tenant))).scalars().all()
    for t in tenants:
        days = t.data_retention_days or s.data_retention_days_default
        cutoff = utcnow() - timedelta(days=days)
        rows = (
            (
                await db.execute(
                    select(Inquiry).where(
                        Inquiry.tenant_id == t.id, Inquiry.status.in_(["closed", "won", "lost", "spam"]), Inquiry.closed_at.is_not(None), Inquiry.closed_at < cutoff
                    )
                )
            )
            .scalars()
            .all()
        )
        for r in rows:
            await db.delete(r)
            deleted += 1
    await db.flush()
    return deleted


@job_handler("quote_followups")
async def _job_quote_followups(db, job):
    return {"reminded": await due_quote_followups(db), "expired_proposals": await expire_stale_proposals(db)}


@job_handler("weekly_reports")
async def _job_weekly_reports(db, job):
    tenants = (await db.execute(select(Tenant).where(Tenant.is_active.is_(True), Tenant.is_demo.is_(False)))).scalars().all()
    n = 0
    for t in tenants:
        ent = await entitlements(db, t.id)
        if ent["active"]:
            await weekly_tenant_report(db, t)
            n += 1
    return {"reports": n}


@job_handler("retention")
async def _job_retention(db, job):
    return {"deleted": await enforce_retention(db)}

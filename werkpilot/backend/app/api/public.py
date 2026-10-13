"""Öffentliche Endpunkte: Website-Formular je Betrieb, Inbound-E-Mail-Webhook, Interessenten-Kontakt, Demo."""

from __future__ import annotations

import hmac
import re
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import get_db, utcnow
from app.core.ratelimit import check_rate_limit, client_ip
from app.core.security import constant_time_equals, hash_token, sign_payload
from app.models.core import Tenant
from app.models.crm import Inquiry
from app.models.ops import Integration, Lead
from app.services.email import send_email
from app.services.features import entitlements
from app.services.inquiries import create_inquiry

router = APIRouter(prefix="/api/public", tags=["public"])


async def _limit(request: Request, bucket: str, n: int = 10) -> None:
    if not await check_rate_limit(f"{bucket}:{client_ip(request)}", n):
        raise HTTPException(429, "Zu viele Anfragen.")


async def _check_monthly_cap(db: AsyncSession, tenant: Tenant) -> bool:
    ent = await entitlements(db, tenant.id)
    if not ent["active"]:
        return False
    cap = ent["limits"].get("inquiries_per_month")
    if cap is None:
        return True
    n = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.tenant_id == tenant.id, Inquiry.created_at >= utcnow() - timedelta(days=30)))).scalar_one()
    return n < cap


@router.post("/forms/{tenant_id}", status_code=201)
async def website_form(tenant_id: str, request: Request, x_form_secret: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    """Kontaktformular einer Betriebs-Website → Anfrage. Geheimnis pro Betrieb, Honeypot-Feld 'website'."""
    await _limit(request, "form", 20)
    tenant = await db.get(Tenant, tenant_id)
    if not tenant or not tenant.is_active:
        raise HTTPException(404, "Unbekannt.")
    integ = (
        await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.type == "contact_form", Integration.status == "connected"))
    ).scalar_one_or_none()
    if not integ:
        raise HTTPException(404, "Formular-Integration nicht aktiv.")
    secret_hash = (integ.config or {}).get("secret_hash", "")
    if not x_form_secret or not constant_time_equals(hash_token(x_form_secret), secret_hash):
        raise HTTPException(401, "Ungültiges Formular-Secret.")
    ctype = request.headers.get("content-type", "")
    try:
        data = await request.json() if "json" in ctype else dict(await request.form())
    except Exception:  # noqa: BLE001
        raise HTTPException(422, "Ungültiger Anfrageinhalt.") from None
    if data.get("website"):  # Honeypot
        return {"message": "Danke."}
    body = str(data.get("message") or data.get("nachricht") or "").strip()
    if len(body) < 3:
        raise HTTPException(422, "Nachricht fehlt.")
    email = str(data.get("email") or "").strip() or None
    if email and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        email = None
    if not await _check_monthly_cap(db, tenant):
        # Anfrage trotzdem speichern, aber nicht per KI verarbeiten – nichts geht verloren
        inq = await create_inquiry(
            db,
            tenant,
            channel="form",
            subject=str(data.get("subject") or data.get("betreff") or "Website-Anfrage")[:300],
            body=body,
            sender_name=str(data.get("name") or "")[:200],
            sender_email=email,
            sender_phone=str(data.get("phone") or data.get("telefon") or "")[:60] or None,
            actor="form",
            process=False,
        )
        inq.needs_human = True
        inq.needs_human_reason = "Kontingent erschöpft oder kein aktives Abo – manuell bearbeiten."
        await db.commit()
        return {"message": "Danke, wir melden uns.", "id": inq.id}
    inq = await create_inquiry(
        db,
        tenant,
        channel="form",
        subject=str(data.get("subject") or data.get("betreff") or "Website-Anfrage")[:300],
        body=body,
        sender_name=str(data.get("name") or "")[:200],
        sender_email=email,
        sender_phone=str(data.get("phone") or data.get("telefon") or "")[:60] or None,
        actor="form",
    )
    await db.commit()
    return {"message": "Danke, wir melden uns.", "id": inq.id}


class InboundEmail(BaseModel):
    """Vereinheitlichtes Format. Adapter für Resend/Postmark/Mailgun liegen in docs/integrationen.md."""

    to: str
    from_email: EmailStr = Field(alias="from")
    from_name: str = ""
    subject: str = ""
    text: str = ""
    message_id: str | None = None

    model_config = {"populate_by_name": True}


@router.post("/inbound-email", status_code=201)
async def inbound_email(data: InboundEmail, request: Request, x_inbound_signature: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    s = get_settings()
    if not s.inbound_email_webhook_secret:
        raise HTTPException(503, "Inbound-E-Mail ist nicht konfiguriert.")
    raw = (await request.body()).decode()
    expected = sign_payload(raw, s.inbound_email_webhook_secret)
    if not x_inbound_signature or not hmac.compare_digest(expected, x_inbound_signature):
        raise HTTPException(401, "Ungültige Signatur.")
    # Empfängeradresse anfragen+<slug>@... → Betrieb
    m = re.search(r"\+([a-z0-9-]+)@", data.to.lower())
    if not m:
        raise HTTPException(404, "Kein Betrieb zur Empfängeradresse.")
    tenant = (await db.execute(select(Tenant).where(Tenant.slug == m.group(1)))).scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(404, "Betrieb nicht gefunden.")
    body = data.text.strip()
    if not body:
        raise HTTPException(422, "Leere Nachricht.")
    process = await _check_monthly_cap(db, tenant)
    inq = await create_inquiry(
        db,
        tenant,
        channel="email",
        subject=data.subject[:300],
        body=body[:20000],
        sender_name=data.from_name[:200],
        sender_email=str(data.from_email),
        external_id=data.message_id,
        actor="inbound_email",
        process=process,
    )
    if not process:
        inq.needs_human = True
        inq.needs_human_reason = "Kontingent erschöpft oder kein aktives Abo."
    await db.commit()
    return {"id": inq.id}


class ContactIn(BaseModel):
    """Interessenten-Kontakt für Clairify selbst (Inbound-Lead)."""

    company: str = Field(min_length=2, max_length=200)
    name: str = Field(min_length=2, max_length=200)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=60)
    trade: str | None = None
    size: str | None = None
    message: str = Field(default="", max_length=5000)
    consent: bool
    website: str | None = None  # Honeypot


@router.post("/contact", status_code=201)
async def contact(data: ContactIn, request: Request, db: AsyncSession = Depends(get_db)):
    await _limit(request, "contact", 5)
    if data.website:
        return {"message": "Danke."}
    if not data.consent:
        raise HTTPException(422, "Bitte der Kontaktaufnahme zustimmen.")
    lead = Lead(
        company=data.company,
        contact_name=data.name,
        email=str(data.email).lower(),
        phone=data.phone,
        trade=data.trade,
        size=data.size,
        source="website_form",
        consent_basis="Kontaktanfrage über Website (Art. 6 Abs. 1 lit. b DSGVO)",
        consent_at=utcnow(),
        notes=data.message,
        status="new",
        next_action="Erstkontakt per E-Mail",
        next_action_at=utcnow(),
    )
    db.add(lead)
    await db.flush()
    from app.services.jobs import enqueue

    await enqueue(db, "qualify_lead", {"lead_id": lead.id}, dedupe_key=f"qualify_lead:{lead.id}")
    s = get_settings()
    if s.ops_alert_email:
        await send_email(
            db,
            to=s.ops_alert_email,
            subject=f"Neuer Interessent: {data.company}",
            text=f"{data.name} <{data.email}>\nGewerk: {data.trade}\nGröße: {data.size}\n\n{data.message}",
            kind="alert",
        )
    await send_email(
        db,
        to=str(data.email),
        subject="Danke für Ihre Anfrage – Clairify",
        text=f"Moin {data.name},\n\ndanke für Ihr Interesse an Clairify. Wir melden uns innerhalb eines Werktags.\n\nBis dahin können Sie die Demo ausprobieren: {s.frontend_url}/demo\n\nClairify",
    )
    await audit(db, "lead.created", actor_type="system", actor_id="website", target_type="lead", target_id=lead.id)
    await db.commit()
    return {"message": "Danke! Wir melden uns innerhalb eines Werktags."}


# --- Interaktive Demo (ohne Konto, streng limitiert, regelbasiert oder mit kleinem Budget) ------


class DemoIn(BaseModel):
    text: str = Field(min_length=10, max_length=2000)
    trade: str = "shk"


@router.post("/demo/classify")
async def demo_classify(data: DemoIn, request: Request, db: AsyncSession = Depends(get_db)):
    """Zeigt, wie eine Anfrage klassifiziert und beantwortet würde. Hartes Limit pro IP, keine Speicherung."""
    await _limit(request, "demo", 5)
    from app.services import ai_tasks  # noqa: F401
    from app.services.ai_tasks import Classification, ReplyDraft
    from app.services.llm import LLMError, MockProvider, run_structured, wrap_untrusted

    # Demo nutzt bewusst den Mock-Anbieter (regelbasiert), damit keine API-Kosten durch Besucher entstehen.

    provider = MockProvider()
    trade_label = {"shk": "Sanitär- und Heizungsbetrieb", "elektro": "Elektrobetrieb", "maler": "Malerbetrieb", "dach": "Dachdeckerbetrieb"}.get(
        data.trade, "Handwerksbetrieb"
    )
    ctx = f"Betrieb: Muster {trade_label}\nGewerk: {trade_label}\nOrt: -\n"
    try:
        cls = await run_structured(
            db,
            task="classify_inquiry",
            schema=Classification,
            instructions="Klassifiziere.",
            data=ctx + "Anfrage:\n" + wrap_untrusted(data.text),
            tenant_id=None,
            provider=provider,
        )
        reply = await run_structured(
            db,
            task="draft_reply",
            schema=ReplyDraft,
            instructions="Antwort.",
            data=ctx
            + "Absender: \nKategorie: "
            + cls.category
            + "\nFehlende Angaben: "
            + "; ".join(cls.missing_info)
            + "\nTerminvorschläge: Di, 09:00 Uhr; Do, 14:00 Uhr\nSignatur: Muster "
            + trade_label
            + "\n\nAnfrage:\n"
            + wrap_untrusted(data.text),
            tenant_id=None,
            provider=provider,
        )
    except LLMError as e:
        raise HTTPException(503, str(e)) from e
    await db.commit()
    return {"classification": cls.model_dump(), "draft": reply.model_dump(), "note": "Demo-Ergebnis regelbasiert. Mit aktivem KI-Anbieter sind Entwürfe individueller."}


# --- Terminbestätigung durch den Endkunden (Einmal-Link aus der Antwort-Mail) -----------------


@router.get("/appointments/confirm")
async def appointment_preview(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    await _limit(request, "confirm", 20)
    from app.core.security import hash_token as _hash
    from app.models.crm import Appointment

    appt = (await db.execute(select(Appointment).where(Appointment.confirm_token_hash == _hash(token)))).scalar_one_or_none()
    if not appt:
        raise HTTPException(404, "Link ungültig oder bereits verwendet.")
    tenant = await db.get(Tenant, appt.tenant_id)
    return {"starts_at": appt.starts_at.isoformat(), "ends_at": appt.ends_at.isoformat(), "status": appt.status, "business": tenant.name if tenant else ""}


@router.post("/appointments/confirm")
async def appointment_confirm(payload: dict, request: Request, db: AsyncSession = Depends(get_db)):
    await _limit(request, "confirm", 20)
    from app.services.inquiries import confirm_appointment_by_token

    try:
        appt = await confirm_appointment_by_token(db, str(payload.get("token", "")))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    await db.commit()
    return {"status": appt.status, "starts_at": appt.starts_at.isoformat()}


# --- Veröffentlichte Ratgeber-Inhalte ----------------------------------------------------


@router.get("/content")
async def public_content(db: AsyncSession = Depends(get_db)):
    from app.models.ops import ContentPiece

    rows = (await db.execute(select(ContentPiece).where(ContentPiece.status == "published").order_by(ContentPiece.published_at.desc()).limit(100))).scalars().all()
    return [
        {"slug": c.slug, "title": c.title, "meta_description": c.meta_description, "published_at": c.published_at.isoformat() if c.published_at else None} for c in rows
    ]


@router.get("/content/{slug}")
async def public_content_item(slug: str, db: AsyncSession = Depends(get_db)):
    from app.models.ops import ContentPiece

    c = (await db.execute(select(ContentPiece).where(ContentPiece.slug == slug, ContentPiece.status == "published"))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Artikel nicht gefunden.")
    c.metrics = {**(c.metrics or {}), "views": int((c.metrics or {}).get("views", 0)) + 1}
    await db.commit()
    return {
        "slug": c.slug,
        "title": c.title,
        "meta_description": c.meta_description,
        "body_markdown": c.body_markdown,
        "published_at": c.published_at.isoformat() if c.published_at else None,
    }

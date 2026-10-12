"""Anfrage-Pipeline: Eingang → Klassifizierung → Antwortentwurf (+ Rückfrage/Terminvorschläge) → Freigabe → Versand."""

from __future__ import annotations

import secrets
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.logging import get_logger
from app.core.security import hash_token
from app.models.core import Tenant
from app.models.crm import (
    INQ_NEEDS_REVIEW,
    INQ_NEW,
    INQ_PROCESSING,
    INQ_SCHEDULED,
    INQ_SPAM,
    INQ_WAITING_CUSTOMER,
    Appointment,
    Customer,
    Draft,
    Inquiry,
    Message,
)
from app.services import ai_tasks  # noqa: F401 – registriert Mock-Handler
from app.services.ai_tasks import Classification, ReplyDraft
from app.services.availability import propose_slots
from app.services.email import send_email
from app.services.features import F_APPOINTMENTS, F_AUTOMATIONS, entitlements
from app.services.jobs import enqueue, job_handler
from app.services.llm import LLMError, get_provider, looks_like_injection, run_structured, wrap_untrusted

log = get_logger("inquiries")

TRADE_LABELS = {
    "elektro": "Elektrobetrieb",
    "shk": "Sanitär- und Heizungsbetrieb",
    "maler": "Malerbetrieb",
    "dach": "Dachdeckerbetrieb",
    "reinigung": "Gebäudereinigung",
    "galabau": "Garten- und Landschaftsbau",
    "bau": "Bauunternehmen",
    "sonstiges": "Handwerksbetrieb",
}


async def find_or_create_customer(db: AsyncSession, tenant_id: str, *, name: str, email: str | None, phone: str | None) -> Customer | None:
    if not email and not phone:
        return None
    q = select(Customer).where(Customer.tenant_id == tenant_id)
    q = q.where(Customer.email == email.lower()) if email else q.where(Customer.phone == phone)
    cust = (await db.execute(q)).scalar_one_or_none()
    if cust:
        if name and not cust.name:
            cust.name = name
        if phone and not cust.phone:
            cust.phone = phone
        return cust
    cust = Customer(tenant_id=tenant_id, name=name or "", email=email.lower() if email else None, phone=phone)
    db.add(cust)
    await db.flush()
    return cust


async def create_inquiry(
    db: AsyncSession,
    tenant: Tenant,
    *,
    channel: str,
    subject: str,
    body: str,
    sender_name: str = "",
    sender_email: str | None = None,
    sender_phone: str | None = None,
    external_id: str | None = None,
    actor: str = "system",
    process: bool = True,
) -> Inquiry:
    if external_id:
        dup = (await db.execute(select(Inquiry).where(Inquiry.tenant_id == tenant.id, Inquiry.external_id == external_id))).scalar_one_or_none()
        if dup:
            return dup
    customer = await find_or_create_customer(db, tenant.id, name=sender_name, email=sender_email, phone=sender_phone)
    inq = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id if customer else None,
        channel=channel,
        external_id=external_id,
        subject=subject[:300],
        body=body,
        sender_name=sender_name[:200],
        sender_email=sender_email.lower() if sender_email else None,
        sender_phone=sender_phone,
        status=INQ_NEW,
        last_activity_at=utcnow(),
    )
    db.add(inq)
    await db.flush()
    db.add(
        Message(
            tenant_id=tenant.id,
            inquiry_id=inq.id,
            direction="in",
            channel=channel,
            sender=sender_email or sender_name or "unbekannt",
            subject=subject[:300],
            body=body,
            external_id=external_id,
        )
    )
    await audit(db, "inquiry.created", actor_type="system", actor_id=actor, tenant_id=tenant.id, target_type="inquiry", target_id=inq.id, details={"channel": channel})
    if process:
        await enqueue(db, "process_inquiry", {"inquiry_id": inq.id}, tenant_id=tenant.id, dedupe_key=f"process_inquiry:{inq.id}", priority=2)
    from app.services.webhooks_out import emit

    await emit(
        db, tenant.id, "inquiry.created", {"id": inq.id, "channel": channel, "subject": inq.subject, "sender_name": inq.sender_name, "sender_email": inq.sender_email}
    )
    return inq


def _tenant_context(tenant: Tenant) -> str:
    return f"Betrieb: {tenant.name}\nGewerk: {TRADE_LABELS.get(tenant.trade, tenant.trade)}\nOrt: {tenant.address or '-'}\n"


async def classify(db: AsyncSession, tenant: Tenant, inq: Inquiry, limits: dict) -> Classification:
    data = _tenant_context(tenant) + "\nAnfrage:\n" + wrap_untrusted(f"Betreff: {inq.subject[:200]}\n\n{inq.body}")
    return await run_structured(
        db,
        task="classify_inquiry",
        schema=Classification,
        tenant_id=tenant.id,
        tenant_limits=limits,
        instructions=(
            "Klassifiziere die Kundenanfrage für den Betrieb. Bestimme Kategorie, Priorität (Notfälle wie "
            "Wasserschaden/Stromausfall/Gasgeruch = urgent), fasse sie in 1-2 Sätzen zusammen, extrahiere "
            "Name/Adresse/Zeitwunsch falls genannt und liste fehlende Angaben auf, die der Betrieb zur "
            "Einschätzung braucht. Setze needs_human bei Beschwerden, rechtlichen Themen oder Unklarheit."
        ),
        data=data,
    )


async def draft_reply(db: AsyncSession, tenant: Tenant, inq: Inquiry, limits: dict, slots: list[dict]) -> ReplyDraft:
    sig = tenant.settings.get("signature") or tenant.name
    data = (
        _tenant_context(tenant)
        + f"Absender: {inq.sender_name or ''}\n"
        + f"Kategorie: {inq.category}\n"
        + f"Fehlende Angaben: {'; '.join(inq.missing_info) if inq.missing_info else '-'}\n"
        + f"Terminvorschläge: {'; '.join(s['label'] for s in slots) if slots else '-'}\n"
        + f"Signatur: {sig}\n"
        + "\nAnfrage:\n"
        + wrap_untrusted(inq.body)
    )
    return await run_structured(
        db,
        task="draft_reply",
        schema=ReplyDraft,
        tenant_id=tenant.id,
        tenant_limits=limits,
        instructions=(
            "Schreibe eine kurze, freundliche, professionelle Antwort (Sie-Form, Deutsch) im Namen des Betriebs. "
            "Bestätige den Eingang, frage die fehlenden Angaben konkret nach, biete – falls vorhanden – die "
            "Terminvorschläge an. Keine Preise, keine Diagnosen, keine Zusagen zur Machbarkeit. "
            "Schließe mit der Signatur."
        ),
        data=data,
    )


async def process_inquiry(db: AsyncSession, inquiry_id: str) -> Inquiry:
    inq = await db.get(Inquiry, inquiry_id)
    if inq is None:
        raise ValueError("Anfrage nicht gefunden")
    tenant = await db.get(Tenant, inq.tenant_id)
    assert tenant is not None
    ent = await entitlements(db, tenant.id)
    if not ent["active"]:
        inq.status = INQ_NEEDS_REVIEW
        inq.needs_human = True
        inq.needs_human_reason = "Kein aktives Abonnement – KI-Verarbeitung ausgesetzt."
        await db.flush()
        return inq
    limits = ent["limits"]
    inq.status = INQ_PROCESSING
    await db.flush()

    injection = looks_like_injection(inq.body)
    try:
        cls = await classify(db, tenant, inq, limits)
    except LLMError as e:
        inq.status = INQ_NEEDS_REVIEW
        inq.needs_human = True
        inq.needs_human_reason = f"KI nicht verfügbar: {str(e)[:150]}"
        inq.ai_notes = {"error": str(e)[:300]}
        await db.flush()
        return inq

    inq.category = cls.category
    inq.priority = cls.priority if cls.priority in ("low", "normal", "high", "urgent") else "normal"
    inq.confidence = cls.confidence
    inq.summary = cls.summary
    inq.extracted = {"customer_name": cls.customer_name, "address": cls.address, "preferred_time": cls.preferred_time}
    inq.missing_info = cls.missing_info
    inq.needs_human = cls.needs_human or injection
    inq.needs_human_reason = "Mögliche Prompt-Injection im Text" if injection else cls.needs_human_reason
    inq.ai_notes = {"provider": get_provider().name}
    if cls.customer_name and inq.customer_id:
        cust = await db.get(Customer, inq.customer_id)
        if cust and not cust.name:
            cust.name = cls.customer_name

    if cls.category == "spam":
        inq.status = INQ_SPAM
        await db.flush()
        return inq

    slots: list[dict] = []
    if F_APPOINTMENTS in ent["features"] and cls.category in ("reparatur", "neuinstallation", "wartung", "terminfrage", "notfall"):
        slots = await propose_slots(db, tenant, count=2 if cls.category != "notfall" else 1)

    try:
        reply = await draft_reply(db, tenant, inq, limits, slots)
    except LLMError as e:
        inq.status = INQ_NEEDS_REVIEW
        inq.needs_human = True
        inq.needs_human_reason = f"Entwurf fehlgeschlagen: {str(e)[:150]}"
        await db.flush()
        return inq

    flags: list[str] = []
    if reply.contains_price_or_diagnosis:
        flags.append("Preis- oder Diagnoseaussage im Entwurf")
    if inq.needs_human:
        flags.append(inq.needs_human_reason or "Menschliche Prüfung empfohlen")
    if cls.confidence < tenant.settings.get("auto_reply_min_confidence", 0.8):
        flags.append("Geringe Sicherheit der Klassifizierung")
    if get_provider().name == "mock":
        flags.append("Entwurf regelbasiert (kein KI-Anbieter konfiguriert)")

    draft = Draft(
        tenant_id=tenant.id,
        inquiry_id=inq.id,
        kind="appointment" if slots else ("missing_info" if cls.missing_info else "reply"),
        subject=reply.subject[:300],
        body=reply.body,
        status="pending",
        generated_by=f"ai:{get_provider().name}",
        confidence=reply.confidence,
        review_flags=flags,
        proposed_slots=slots,
    )
    db.add(draft)
    await db.flush()
    inq.status = INQ_NEEDS_REVIEW
    inq.last_activity_at = utcnow()

    auto_reply = F_AUTOMATIONS in ent["features"] and tenant.settings.get("auto_reply_enabled", False) and not flags and inq.sender_email
    if auto_reply:
        await send_draft(db, tenant, draft, approved_by="auto", auto=True)
    await db.flush()
    return inq


async def send_draft(
    db: AsyncSession, tenant: Tenant, draft: Draft, *, approved_by: str, auto: bool = False, subject: str | None = None, body: str | None = None
) -> Message:
    inq = await db.get(Inquiry, draft.inquiry_id)
    assert inq is not None
    if not inq.sender_email:
        raise ValueError("Keine E-Mail-Adresse des Absenders bekannt – Antwort bitte telefonisch.")
    if subject is not None:
        draft.subject = subject[:300]
    if body is not None:
        draft.body = body
    reply_to = tenant.contact_email or None
    # Terminvorschläge zuerst als „proposed“ anlegen (blockieren die Zeit) und Bestätigungslinks in den Text aufnehmen.
    # Der Kunde bestätigt selbst über einen Einmal-Link – vom Kunden initiiert, ohne Konto.
    links: list[str] = []
    for s in draft.proposed_slots or []:
        token = secrets.token_urlsafe(24)
        db.add(
            Appointment(
                tenant_id=tenant.id,
                inquiry_id=inq.id,
                customer_id=inq.customer_id,
                title=f"Vor-Ort-Termin: {inq.subject[:120] or inq.category or 'Anfrage'}",
                starts_at=datetime.fromisoformat(s["starts_at"]),
                ends_at=datetime.fromisoformat(s["ends_at"]),
                status="proposed",
                confirm_token_hash=hash_token(token),
            )
        )
        links.append(f"{s['label']}: {get_settings().frontend_url}/termin?token={token}")
    text = draft.body
    if links:
        text += "\n\nTermin direkt bestätigen (ein Klick genügt):\n" + "\n".join(f"- {line}" for line in links)
    if auto:
        text += "\n\nDiese Eingangsbestätigung wurde automatisch mit Unterstützung eines KI-Assistenten erstellt. Ein Mensch aus dem Betrieb meldet sich persönlich."
    result = await send_email(
        db,
        to=inq.sender_email,
        subject=draft.subject,
        text=text,
        reply_to=reply_to,
        kind="inquiry_reply",
        tenant_id=tenant.id,
    )
    msg = Message(
        tenant_id=tenant.id,
        inquiry_id=inq.id,
        direction="out",
        channel="email",
        sender=tenant.contact_email or "werkpilot",
        recipient=inq.sender_email,
        subject=draft.subject,
        body=text,
        delivery_status=result.status,
        meta={"draft_id": draft.id, "auto": auto, "provider": result.provider, "error": result.error},
    )
    db.add(msg)
    await db.flush()
    draft.status = "sent" if result.status != "failed" else "approved"
    draft.approved_by = approved_by
    draft.approved_at = utcnow()
    draft.sent_message_id = msg.id
    if inq.first_response_at is None:
        inq.first_response_at = utcnow()
    inq.last_activity_at = utcnow()
    inq.status = INQ_WAITING_CUSTOMER
    await audit(
        db,
        "draft.sent",
        actor_type="agent" if auto else "user",
        actor_id=approved_by,
        tenant_id=tenant.id,
        target_type="draft",
        target_id=draft.id,
        details={"auto": auto, "delivery": result.status},
    )
    return msg


@job_handler("process_inquiry")
async def _job_process_inquiry(db: AsyncSession, job) -> dict:
    inq = await process_inquiry(db, job.payload["inquiry_id"])
    return {"status": inq.status, "category": inq.category}


async def confirm_appointment_by_token(db: AsyncSession, token: str) -> Appointment:
    """Vom Endkunden ausgelöste Terminbestätigung über Einmal-Link."""
    appt = (await db.execute(select(Appointment).where(Appointment.confirm_token_hash == hash_token(token)))).scalar_one_or_none()
    if appt is None:
        raise ValueError("Link ungültig.")
    if appt.status == "confirmed":
        return appt
    if appt.status != "proposed" or appt.starts_at < utcnow():
        raise ValueError("Dieser Terminvorschlag ist nicht mehr verfügbar. Bitte antworten Sie auf die E-Mail des Betriebs.")
    appt.status = "confirmed"
    appt.confirm_token_hash = None
    others = (
        (await db.execute(select(Appointment).where(Appointment.inquiry_id == appt.inquiry_id, Appointment.id != appt.id, Appointment.status == "proposed")))
        .scalars()
        .all()
    )
    for o in others:
        o.status = "canceled"
        o.confirm_token_hash = None
    tenant = await db.get(Tenant, appt.tenant_id)
    inq = await db.get(Inquiry, appt.inquiry_id) if appt.inquiry_id else None
    if inq:
        inq.status = INQ_SCHEDULED
        inq.last_activity_at = utcnow()
        db.add(
            Message(
                tenant_id=appt.tenant_id,
                inquiry_id=inq.id,
                direction="in",
                channel="link",
                sender=inq.sender_email or "kunde",
                subject="Termin bestätigt",
                body=f"Kunde hat den Termin am {appt.starts_at.strftime('%d.%m.%Y %H:%M')} per Link bestätigt.",
            )
        )
    from app.services.google_calendar import create_event

    if tenant:
        appt.external_calendar_id = await create_event(
            db, tenant.id, title=appt.title, start=appt.starts_at, end=appt.ends_at, description=(inq.summary if inq else "") or ""
        )
        if tenant.contact_email:
            await send_email(
                db,
                to=tenant.contact_email,
                subject=f"Termin bestätigt: {appt.starts_at.strftime('%d.%m.%Y %H:%M')}",
                text=f"{inq.sender_name if inq else 'Ein Kunde'} hat den Termin „{appt.title}“ am {appt.starts_at.strftime('%d.%m.%Y um %H:%M')} Uhr bestätigt.",
                kind="transactional",
                tenant_id=tenant.id,
            )
    await audit(
        db, "appointment.confirmed_by_customer", actor_type="system", actor_id="customer_link", tenant_id=appt.tenant_id, target_type="appointment", target_id=appt.id
    )
    await db.flush()
    return appt

"""Stripe Billing: Checkout, Kundenportal, Webhooks (signiert, idempotent). Keine Kartendaten bei uns."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.logging import get_logger
from app.models.billing import (
    SUB_ACTIVE,
    SUB_CANCELED,
    SUB_INCOMPLETE,
    SUB_PAST_DUE,
    SUB_TRIALING,
    Invoice,
    Plan,
    Subscription,
    WebhookEvent,
)
from app.models.core import Tenant
from app.services.features import get_subscription

log = get_logger("billing")


def stripe_configured() -> bool:
    s = get_settings()
    return bool(s.stripe_secret_key and s.stripe_webhook_secret)


def _stripe():
    import stripe

    stripe.api_key = get_settings().stripe_secret_key
    return stripe


def _ts(v) -> datetime | None:
    return datetime.fromtimestamp(v, tz=UTC) if v else None


async def ensure_customer(db: AsyncSession, tenant: Tenant, email: str) -> str:
    if tenant.stripe_customer_id:
        return tenant.stripe_customer_id
    stripe = _stripe()
    cust = stripe.Customer.create(email=email, name=tenant.name, metadata={"tenant_id": tenant.id})
    tenant.stripe_customer_id = cust.id
    await db.flush()
    return cust.id


async def create_checkout_session(db: AsyncSession, tenant: Tenant, plan: Plan, email: str) -> str:
    if not stripe_configured():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Zahlungsanbieter ist noch nicht konfiguriert (Stripe-Schlüssel fehlen).")
    if not plan.stripe_price_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Für den Tarif {plan.name} ist noch keine Stripe-Preis-ID hinterlegt.")
    s = get_settings()
    stripe = _stripe()
    customer_id = await ensure_customer(db, tenant, email)
    session = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        line_items=[{"price": plan.stripe_price_id, "quantity": 1}],
        success_url=f"{s.frontend_url}/app/abonnement?erfolg=1&session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{s.frontend_url}/app/abonnement?abgebrochen=1",
        client_reference_id=tenant.id,
        metadata={"tenant_id": tenant.id, "plan_code": plan.code},
        subscription_data={"metadata": {"tenant_id": tenant.id, "plan_code": plan.code}},
        allow_promotion_codes=True,
        locale="de",
        automatic_tax={"enabled": False},
        billing_address_collection="required",
        tax_id_collection={"enabled": True},
    )
    await audit(db, "billing.checkout_started", actor_type="user", tenant_id=tenant.id, details={"plan": plan.code})
    return session.url


async def create_portal_session(tenant: Tenant) -> str:
    if not stripe_configured() or not tenant.stripe_customer_id:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Kein Stripe-Kunde vorhanden.")
    stripe = _stripe()
    session = stripe.billing_portal.Session.create(customer=tenant.stripe_customer_id, return_url=f"{get_settings().frontend_url}/app/abonnement")
    return session.url


def verify_webhook(payload: bytes, signature: str | None) -> dict:
    s = get_settings()
    if not s.stripe_webhook_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Webhook-Secret fehlt.")
    stripe = _stripe()
    try:
        event = stripe.Webhook.construct_event(payload, signature or "", s.stripe_webhook_secret)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Ungültige Signatur: {str(e)[:100]}") from e
    return event.to_dict() if hasattr(event, "to_dict") else dict(event)


STATUS_MAP = {
    "trialing": SUB_TRIALING,
    "active": SUB_ACTIVE,
    "past_due": SUB_PAST_DUE,
    "canceled": SUB_CANCELED,
    "unpaid": SUB_PAST_DUE,
    "incomplete": SUB_INCOMPLETE,
    "incomplete_expired": SUB_CANCELED,
    "paused": SUB_PAST_DUE,
}


async def _plan_from_subscription_obj(db: AsyncSession, sub_obj: dict) -> Plan | None:
    """Die Preis-ID auf den Positionen ist die Wahrheit (Portal-Wechsel ändern Metadaten nicht);
    plan_code aus den Metadaten dient nur als Rückfall, wenn keine Preis-ID zugeordnet werden kann."""
    items = (sub_obj.get("items") or {}).get("data") or []
    for it in items:
        price_id = (it.get("price") or {}).get("id")
        if price_id:
            plan = (await db.execute(select(Plan).where(Plan.stripe_price_id == price_id))).scalar_one_or_none()
            if plan:
                return plan
    code = (sub_obj.get("metadata") or {}).get("plan_code")
    if code:
        return (await db.execute(select(Plan).where(Plan.code == code))).scalar_one_or_none()
    return None


async def _tenant_for(db: AsyncSession, sub_obj: dict) -> Tenant | None:
    tid = (sub_obj.get("metadata") or {}).get("tenant_id")
    if tid:
        t = await db.get(Tenant, tid)
        if t:
            return t
    cust = sub_obj.get("customer")
    if cust:
        return (await db.execute(select(Tenant).where(Tenant.stripe_customer_id == cust))).scalar_one_or_none()
    return None


def _period_end(sub_obj: dict):
    # Stripe API ≥ 2025: current_period_end liegt auf den Items
    v = sub_obj.get("current_period_end")
    if v is None:
        items = (sub_obj.get("items") or {}).get("data") or []
        if items:
            v = items[0].get("current_period_end")
    return _ts(v)


async def apply_subscription(db: AsyncSession, sub_obj: dict) -> Subscription | None:
    tenant = await _tenant_for(db, sub_obj)
    if tenant is None:
        log.warning("billing.unknown_tenant", stripe_subscription=sub_obj.get("id"))
        return None
    plan = await _plan_from_subscription_obj(db, sub_obj)
    sub = await get_subscription(db, tenant.id)
    stripe_id = sub_obj.get("id")
    if sub is None or (sub.stripe_subscription_id and sub.stripe_subscription_id != stripe_id and sub.status != SUB_TRIALING):
        sub = Subscription(tenant_id=tenant.id)
        db.add(sub)
    sub.stripe_subscription_id = stripe_id
    sub.stripe_customer_id = sub_obj.get("customer")
    sub.plan_id = plan.id if plan else sub.plan_id
    sub.status = STATUS_MAP.get(sub_obj.get("status", ""), SUB_INCOMPLETE)
    sub.current_period_end = _period_end(sub_obj)
    sub.cancel_at_period_end = bool(sub_obj.get("cancel_at_period_end"))
    sub.canceled_at = _ts(sub_obj.get("canceled_at"))
    sub.ended_at = _ts(sub_obj.get("ended_at"))
    sub.trial_ends_at = _ts(sub_obj.get("trial_end")) or sub.trial_ends_at
    if not tenant.stripe_customer_id and sub_obj.get("customer"):
        tenant.stripe_customer_id = sub_obj["customer"]
    await db.flush()
    await audit(
        db,
        "billing.subscription_synced",
        actor_type="webhook",
        actor_id="stripe",
        tenant_id=tenant.id,
        target_type="subscription",
        target_id=sub.id,
        details={"status": sub.status, "plan": plan.code if plan else None},
    )
    return sub


async def apply_invoice(db: AsyncSession, inv_obj: dict, paid: bool) -> None:
    cust = inv_obj.get("customer")
    tenant = (await db.execute(select(Tenant).where(Tenant.stripe_customer_id == cust))).scalar_one_or_none() if cust else None
    if tenant is None:
        return
    inv = (await db.execute(select(Invoice).where(Invoice.stripe_invoice_id == inv_obj["id"]))).scalar_one_or_none()
    if inv is None:
        inv = Invoice(tenant_id=tenant.id, stripe_invoice_id=inv_obj["id"])
        db.add(inv)
    inv.amount_cents = int(inv_obj.get("amount_paid") or inv_obj.get("amount_due") or 0)
    inv.currency = (inv_obj.get("currency") or "eur").upper()
    inv.status = inv_obj.get("status") or ("paid" if paid else "open")
    inv.paid_at = _ts((inv_obj.get("status_transitions") or {}).get("paid_at")) if paid else None
    inv.period_start = _ts(inv_obj.get("period_start"))
    inv.period_end = _ts(inv_obj.get("period_end"))
    inv.hosted_url = inv_obj.get("hosted_invoice_url")
    sub = await get_subscription(db, tenant.id)
    if sub:
        if paid:
            sub.last_payment_failed_at = None
        else:
            sub.last_payment_failed_at = utcnow()
            sub.status = SUB_PAST_DUE
    await db.flush()
    await audit(
        db,
        "billing.invoice_paid" if paid else "billing.payment_failed",
        actor_type="webhook",
        actor_id="stripe",
        tenant_id=tenant.id,
        details={"amount_cents": inv.amount_cents},
        severity="info" if paid else "warning",
    )


async def handle_event(db: AsyncSession, event: dict) -> str:
    """Idempotente Verarbeitung. Rückgabe: 'processed' | 'duplicate' | 'ignored'."""
    event_id = event["id"]
    etype = event["type"]
    existing = (await db.execute(select(WebhookEvent).where(WebhookEvent.event_id == event_id))).scalar_one_or_none()
    if existing and existing.status == "processed":
        return "duplicate"
    rec = existing or WebhookEvent(provider="stripe", event_id=event_id, event_type=etype, received_at=utcnow(), payload={"type": etype})
    db.add(rec)
    await db.flush()
    obj = (event.get("data") or {}).get("object") or {}
    try:
        if etype in ("customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"):
            await apply_subscription(db, obj)
        elif etype == "checkout.session.completed":
            sub_id = obj.get("subscription")
            if sub_id and stripe_configured():
                stripe = _stripe()
                sub_obj = stripe.Subscription.retrieve(sub_id, expand=["items"])
                await apply_subscription(db, sub_obj.to_dict() if hasattr(sub_obj, "to_dict") else dict(sub_obj))
        elif etype in ("invoice.paid", "invoice.payment_succeeded"):
            await apply_invoice(db, obj, paid=True)
        elif etype == "invoice.payment_failed":
            await apply_invoice(db, obj, paid=False)
        else:
            rec.status = "ignored"
            rec.processed_at = utcnow()
            await db.flush()
            return "ignored"
        rec.status = "processed"
        rec.processed_at = utcnow()
        await db.flush()
        return "processed"
    except Exception as e:  # noqa: BLE001
        rec.status = "failed"
        rec.error = str(e)[:1000]
        await db.flush()
        raise

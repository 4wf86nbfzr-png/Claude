from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import AuthContext, require_owner, require_tenant
from app.models.billing import Invoice, Plan
from app.services import billing
from app.services.features import entitlements

router = APIRouter(prefix="/api/billing", tags=["billing"])


def plan_dict(p: Plan) -> dict:
    return {"code": p.code, "name": p.name, "description": p.description, "price_cents_monthly": p.price_cents_monthly,
            "currency": p.currency, "features": p.features, "limits": p.limits, "checkout_available": bool(p.stripe_price_id and billing.stripe_configured())}


@router.get("/plans")
async def plans(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Plan).where(Plan.is_active.is_(True), Plan.is_public.is_(True)).order_by(Plan.sort_order))).scalars().all()
    return [plan_dict(p) for p in rows]


@router.get("/status")
async def status(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    ent = await entitlements(db, ctx.tenant_id)
    invoices = (await db.execute(select(Invoice).where(Invoice.tenant_id == ctx.tenant_id).order_by(Invoice.created_at.desc()).limit(24))).scalars().all()
    return {"entitlements": ent, "stripe_configured": billing.stripe_configured(), "has_customer": bool(ctx.tenant.stripe_customer_id),
            "invoices": [{"id": i.stripe_invoice_id, "amount_cents": i.amount_cents, "currency": i.currency, "status": i.status,
                          "paid_at": i.paid_at.isoformat() if i.paid_at else None, "url": i.hosted_url} for i in invoices]}


@router.post("/checkout")
async def checkout(payload: dict, ctx: AuthContext = Depends(require_owner), db: AsyncSession = Depends(get_db)):
    code = str(payload.get("plan", ""))
    plan = (await db.execute(select(Plan).where(Plan.code == code, Plan.is_active.is_(True)))).scalar_one_or_none()
    if not plan:
        raise HTTPException(404, "Tarif nicht gefunden.")
    url = await billing.create_checkout_session(db, ctx.tenant, plan, ctx.user.email)
    await db.commit()
    return {"url": url}


@router.post("/portal")
async def portal(ctx: AuthContext = Depends(require_owner)):
    return {"url": await billing.create_portal_session(ctx.tenant)}


@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, stripe_signature: str | None = Header(default=None), db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    event = billing.verify_webhook(payload, stripe_signature)
    try:
        result = await billing.handle_event(db, event)
        await db.commit()
    except Exception as e:  # noqa: BLE001
        await db.commit()  # Fehlerstatus des Events speichern
        raise HTTPException(500, f"Verarbeitung fehlgeschlagen: {str(e)[:100]}") from e
    return {"result": result}

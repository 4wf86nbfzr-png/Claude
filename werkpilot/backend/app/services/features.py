"""Funktionsfreischaltung je Tarif. Serverseitig geprüft, nicht nur im Frontend versteckt."""

from __future__ import annotations

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.models.billing import SUB_ACTIVE, SUB_PAST_DUE, SUB_TRIALING, Plan, Subscription

# Feature-Codes
F_INQUIRIES = "inquiries"  # Anfrageverwaltung
F_AI_DRAFTS = "ai_drafts"  # KI-Antwortentwürfe
F_CUSTOMERS = "customers"
F_REPORTS_BASIC = "reports_basic"
F_AUTOMATIONS = "automations"  # Auto-Antwort, Regeln
F_APPOINTMENTS = "appointments"
F_QUOTE_FOLLOWUP = "quote_followup"
F_WORKFLOWS = "workflows"
F_INTEGRATIONS_ADV = "integrations_advanced"
F_RULES_CUSTOM = "rules_custom"
F_REPORTS_ADV = "reports_advanced"
F_PRIORITY_SUPPORT = "priority_support"

TRIAL_FEATURES = [F_INQUIRIES, F_AI_DRAFTS, F_CUSTOMERS, F_REPORTS_BASIC, F_APPOINTMENTS, F_QUOTE_FOLLOWUP]

DEFAULT_PLANS = [
    {
        "code": "starter",
        "name": "Starter",
        "description": "Anfrageverwaltung, KI-Antwortentwürfe, Kundenübersicht, Standardberichte.",
        "price_cents_monthly": 7900,
        "features": [F_INQUIRIES, F_AI_DRAFTS, F_CUSTOMERS, F_REPORTS_BASIC],
        "limits": {"inquiries_per_month": 150, "ai_budget_cents_month": 400, "users": 2},
        "sort_order": 1,
    },
    {
        "code": "business",
        "name": "Business",
        "description": "Alles aus Starter plus Automatisierungen, Terminorganisation, Angebotsnachverfolgung, individuelle Abläufe.",
        "price_cents_monthly": 14900,
        "features": [
            F_INQUIRIES, F_AI_DRAFTS, F_CUSTOMERS, F_REPORTS_BASIC,
            F_AUTOMATIONS, F_APPOINTMENTS, F_QUOTE_FOLLOWUP, F_WORKFLOWS,
        ],
        "limits": {"inquiries_per_month": 500, "ai_budget_cents_month": 1000, "users": 5},
        "sort_order": 2,
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "Alles aus Business plus erweiterte Integrationen, eigene Automatisierungsregeln, umfangreiche Auswertungen, priorisierter Support.",
        "price_cents_monthly": 24900,
        "features": [
            F_INQUIRIES, F_AI_DRAFTS, F_CUSTOMERS, F_REPORTS_BASIC,
            F_AUTOMATIONS, F_APPOINTMENTS, F_QUOTE_FOLLOWUP, F_WORKFLOWS,
            F_INTEGRATIONS_ADV, F_RULES_CUSTOM, F_REPORTS_ADV, F_PRIORITY_SUPPORT,
        ],
        "limits": {"inquiries_per_month": 2000, "ai_budget_cents_month": 2500, "users": 15},
        "sort_order": 3,
    },
]


async def ensure_default_plans(db: AsyncSession) -> None:
    existing = {p.code for p in (await db.execute(select(Plan))).scalars().all()}
    for p in DEFAULT_PLANS:
        if p["code"] not in existing:
            db.add(Plan(**p))
    await db.flush()


async def get_subscription(db: AsyncSession, tenant_id: str) -> Subscription | None:
    return (
        await db.execute(
            select(Subscription)
            .where(Subscription.tenant_id == tenant_id)
            .order_by(Subscription.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def start_trial(db: AsyncSession, tenant_id: str) -> Subscription:
    s = get_settings()
    sub = Subscription(
        tenant_id=tenant_id,
        plan_id=None,
        status=SUB_TRIALING,
        trial_ends_at=utcnow() + timedelta(days=s.trial_days),
    )
    db.add(sub)
    await db.flush()
    return sub


async def entitlements(db: AsyncSession, tenant_id: str) -> dict:
    """Gibt Status, Features und Limits zurück — die Wahrheit für Backend UND Dashboard."""
    s = get_settings()
    sub = await get_subscription(db, tenant_id)
    now = utcnow()
    if sub is None:
        return {"status": "none", "plan": None, "features": [], "limits": {}, "active": False}
    plan = await db.get(Plan, sub.plan_id) if sub.plan_id else None
    if sub.status == SUB_TRIALING:
        expired = sub.trial_ends_at is not None and sub.trial_ends_at < now
        return {
            "status": "trial_expired" if expired else "trialing",
            "plan": None,
            "features": [] if expired else TRIAL_FEATURES,
            "limits": {
                "inquiries_per_month": 30,
                "ai_calls_total": s.trial_ai_calls_max,
                "ai_budget_cents_month": s.ai_trial_total_budget_cents,
                "users": 1,
            },
            "active": not expired,
            "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        }
    active = sub.status in (SUB_ACTIVE, SUB_PAST_DUE) and plan is not None
    return {
        "status": sub.status,
        "plan": plan.code if plan else None,
        "plan_name": plan.name if plan else None,
        "features": list(plan.features) if (plan and active) else [],
        "limits": dict(plan.limits) if (plan and active) else {},
        "active": active,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end,
        "past_due": sub.status == SUB_PAST_DUE,
    }


async def require_feature(db: AsyncSession, tenant_id: str, feature: str) -> dict:
    ent = await entitlements(db, tenant_id)
    if not ent["active"]:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Kein aktives Abonnement oder Testphase abgelaufen.")
    if feature not in ent["features"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Funktion '{feature}' ist im aktuellen Tarif nicht enthalten.")
    return ent

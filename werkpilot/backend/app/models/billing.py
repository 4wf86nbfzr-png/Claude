"""Tarife, Abonnements, Stripe-Ereignisse, KI-Verbrauch."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

SUB_TRIALING = "trialing"
SUB_ACTIVE = "active"
SUB_PAST_DUE = "past_due"
SUB_CANCELED = "canceled"
SUB_INCOMPLETE = "incomplete"
SUB_EXPIRED = "expired"


class Plan(IdMixin, TimestampMixin, Base):
    """Tarife sind Daten, kein Code — Preise, Grenzen und Funktionen lassen sich jederzeit ändern."""

    __tablename__ = "plans"

    code: Mapped[str] = mapped_column(String(40), unique=True)  # starter | business | pro
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    price_cents_monthly: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    stripe_price_id: Mapped[str | None] = mapped_column(String(80))
    features: Mapped[list] = mapped_column(JSON, default=list)  # Feature-Codes, siehe services/features.py
    limits: Mapped[dict] = mapped_column(JSON, default=dict)  # z.B. inquiries_per_month, ai_budget_cents
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)


class Subscription(IdMixin, TimestampMixin, Base):
    __tablename__ = "subscriptions"

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("plans.id"))
    status: Mapped[str] = mapped_column(String(20), default=SUB_TRIALING, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(80), index=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(80))
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_payment_failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WebhookEvent(IdMixin, Base):
    """Idempotenz: jede Stripe-Event-ID wird genau einmal verarbeitet."""

    __tablename__ = "webhook_events"

    provider: Mapped[str] = mapped_column(String(20))
    event_id: Mapped[str] = mapped_column(String(120), unique=True)
    event_type: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="received")
    error: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)


class Invoice(IdMixin, TimestampMixin, Base):
    """Spiegel der Stripe-Rechnungen für Umsatzberichte (keine Kartendaten)."""

    __tablename__ = "invoices"

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    stripe_invoice_id: Mapped[str] = mapped_column(String(80), unique=True)
    amount_cents: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    status: Mapped[str] = mapped_column(String(20))  # paid | open | void | uncollectible
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    hosted_url: Mapped[str | None] = mapped_column(String(500))


class AIUsage(IdMixin, Base):
    """Jeder KI-Aufruf wird mit Kosten erfasst — Grundlage für Budgets und Berichte."""

    __tablename__ = "ai_usage"
    __table_args__ = (Index("ix_ai_usage_tenant_created", "tenant_id", "created_at"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(80))
    task: Mapped[str] = mapped_column(String(60), index=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_cents: Mapped[int] = mapped_column(Integer, default=0)  # gerundet, in Hundertstel-Cent? Nein: Cent*100
    cost_microcents: Mapped[int] = mapped_column(BigInteger, default=0)  # präzise: 1 Cent = 1_000_000
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)


class ExpenseEntry(IdMixin, TimestampMixin, Base):
    """Laufende Kosten (Hosting, APIs, Tools) – manuell oder automatisch erfasst, für Liquiditätsübersicht."""

    __tablename__ = "expense_entries"

    category: Mapped[str] = mapped_column(String(40))  # hosting | llm | email | payments | tools | other
    vendor: Mapped[str] = mapped_column(String(80))
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    period_month: Mapped[str] = mapped_column(String(7), index=True)  # YYYY-MM
    source: Mapped[str] = mapped_column(String(20), default="manual")  # manual | auto
    note: Mapped[str | None] = mapped_column(Text)

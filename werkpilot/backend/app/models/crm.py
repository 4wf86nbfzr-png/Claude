"""Kundenanfragen, Endkunden, Entwürfe, Termine, Angebote — das Kernprodukt."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin

INQ_NEW = "new"
INQ_PROCESSING = "processing"
INQ_NEEDS_REVIEW = "needs_review"  # Entwurf wartet auf Freigabe
INQ_WAITING_CUSTOMER = "waiting_customer"  # Rückfrage / Terminvorschlag gesendet
INQ_SCHEDULED = "scheduled"
INQ_QUOTED = "quoted"
INQ_WON = "won"
INQ_LOST = "lost"
INQ_SPAM = "spam"
INQ_CLOSED = "closed"
OPEN_STATES = (INQ_NEW, INQ_PROCESSING, INQ_NEEDS_REVIEW, INQ_WAITING_CUSTOMER, INQ_SCHEDULED, INQ_QUOTED)

PRIORITIES = ("low", "normal", "high", "urgent")
CATEGORIES = (
    "notfall",
    "reparatur",
    "neuinstallation",
    "wartung",
    "angebot",
    "terminfrage",
    "rueckfrage",
    "beschwerde",
    "sonstiges",
    "spam",
)


class Customer(IdMixin, TimestampMixin, Base):
    """Endkunde des Handwerksbetriebs."""

    __tablename__ = "customers"
    __table_args__ = (Index("ix_customers_tenant_email", "tenant_id", "email"),)

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(60))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list] = mapped_column(JSON, default=list)


class Inquiry(IdMixin, TimestampMixin, Base):
    __tablename__ = "inquiries"
    __table_args__ = (Index("ix_inquiries_tenant_status", "tenant_id", "status"),)

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[str | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"))
    channel: Mapped[str] = mapped_column(String(20), default="manual")  # email | form | manual | api | demo
    external_id: Mapped[str | None] = mapped_column(String(200), index=True)  # z.B. Message-ID
    subject: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    sender_name: Mapped[str] = mapped_column(String(200), default="")
    sender_email: Mapped[str | None] = mapped_column(String(320))
    sender_phone: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(30), default=INQ_NEW, index=True)
    category: Mapped[str | None] = mapped_column(String(30))
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    confidence: Mapped[float | None] = mapped_column(Float)
    summary: Mapped[str | None] = mapped_column(Text)
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)  # Adresse, Zeitwunsch, Gerät ...
    missing_info: Mapped[list] = mapped_column(JSON, default=list)
    ai_notes: Mapped[dict] = mapped_column(JSON, default=dict)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    assigned_user_id: Mapped[str | None] = mapped_column(String(36))
    needs_human: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_human_reason: Mapped[str | None] = mapped_column(String(300))


class Message(IdMixin, TimestampMixin, Base):
    """Nachrichtenverlauf einer Anfrage (eingehend/ausgehend)."""

    __tablename__ = "messages"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    inquiry_id: Mapped[str] = mapped_column(ForeignKey("inquiries.id", ondelete="CASCADE"), index=True)
    direction: Mapped[str] = mapped_column(String(10))  # in | out | note
    channel: Mapped[str] = mapped_column(String(20), default="email")
    sender: Mapped[str] = mapped_column(String(320), default="")
    recipient: Mapped[str | None] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    external_id: Mapped[str | None] = mapped_column(String(200))
    delivery_status: Mapped[str | None] = mapped_column(String(30))  # sent | failed | simulated | queued
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class Draft(IdMixin, TimestampMixin, Base):
    """KI-Antwortentwurf. Wird erst nach Freigabe (oder bei erlaubter Auto-Antwort) versendet."""

    __tablename__ = "drafts"

    tenant_id: Mapped[str] = mapped_column(String(36), index=True)
    inquiry_id: Mapped[str] = mapped_column(ForeignKey("inquiries.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30), default="reply")  # reply | missing_info | appointment | followup
    subject: Mapped[str] = mapped_column(String(300), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | sent | rejected | expired
    generated_by: Mapped[str] = mapped_column(String(40), default="ai")  # ai:<provider> | user
    confidence: Mapped[float | None] = mapped_column(Float)
    review_flags: Mapped[list] = mapped_column(JSON, default=list)  # Gründe, warum Mensch prüfen soll
    proposed_slots: Mapped[list] = mapped_column(JSON, default=list)
    approved_by: Mapped[str | None] = mapped_column(String(36))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_message_id: Mapped[str | None] = mapped_column(String(36))


class Appointment(IdMixin, TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_tenant_start", "tenant_id", "starts_at"),)

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    inquiry_id: Mapped[str | None] = mapped_column(ForeignKey("inquiries.id", ondelete="SET NULL"))
    customer_id: Mapped[str | None] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(300))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="proposed")  # proposed | confirmed | canceled | done
    location: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    external_calendar_id: Mapped[str | None] = mapped_column(String(200))
    confirm_token_hash: Mapped[str | None] = mapped_column(String(64), index=True)


class Quote(IdMixin, TimestampMixin, Base):
    """Angebot, das der Betrieb gestellt hat — WerkPilot erinnert an offene Angebote, setzt keine Preise."""

    __tablename__ = "quotes"
    __table_args__ = (Index("ix_quotes_tenant_status", "tenant_id", "status"),)

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    inquiry_id: Mapped[str | None] = mapped_column(ForeignKey("inquiries.id", ondelete="SET NULL"))
    customer_id: Mapped[str | None] = mapped_column(String(36))
    title: Mapped[str] = mapped_column(String(300))
    amount_cents: Mapped[int | None] = mapped_column(Integer)  # vom Betrieb eingetragen, nie von der KI
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | accepted | declined | expired
    followup_count: Mapped[int] = mapped_column(Integer, default=0)
    next_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)


class Report(IdMixin, Base):
    """Gespeicherte Berichte (wöchentlicher Kundenbericht, täglicher Betriebsbericht)."""

    __tablename__ = "reports"
    __table_args__ = (Index("ix_reports_tenant_kind", "tenant_id", "kind"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)  # None = Betreiberbericht
    kind: Mapped[str] = mapped_column(String(40))
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    summary_text: Mapped[str] = mapped_column(Text, default="")
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

"""Integrationen, Hintergrundjobs, Agenten, Freigaben, Support, Marketing, Vertrieb."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, IdMixin, TimestampMixin


class Integration(IdMixin, TimestampMixin, Base):
    """Verbundene Fremdsysteme je Mandant. Zugangsdaten verschlüsselt (Fernet)."""

    __tablename__ = "integrations"
    __table_args__ = (Index("ix_integrations_tenant_type", "tenant_id", "type"),)

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))  # email_inbound | google_calendar | contact_form | ...
    status: Mapped[str] = mapped_column(String(20), default="not_configured")  # not_configured | pending | connected | error | disconnected
    encrypted_credentials: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # nicht-geheime Einstellungen
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    connected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Job(IdMixin, TimestampMixin, Base):
    """Hintergrundaufgabe mit Wiederholungen und Fehlerwarteschlange (dead letter)."""

    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_run_at", "status", "run_at"),)

    type: Mapped[str] = mapped_column(String(60), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="queued")  # queued | running | done | failed | dead
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=4)
    last_error: Mapped[str | None] = mapped_column(Text)
    error_category: Mapped[str | None] = mapped_column(String(40))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    dedupe_key: Mapped[str | None] = mapped_column(String(200), index=True)
    priority: Mapped[int] = mapped_column(Integer, default=5)  # 1 = hoch
    critical: Mapped[bool] = mapped_column(Boolean, default=False)  # läuft auch bei Not-Aus (Sicherheit/Monitoring)


class ScheduleState(Base):
    """Merkt sich pro geplanter Aufgabe den letzten Lauf (einfacher, robuster Scheduler ohne Fremddienst)."""

    __tablename__ = "schedule_state"

    name: Mapped[str] = mapped_column(String(80), primary_key=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str | None] = mapped_column(String(20))
    last_error: Mapped[str | None] = mapped_column(Text)


class AgentRun(IdMixin, Base):
    """Jeder Agentenlauf wird protokolliert: Eingaben, Ergebnis, Kosten, Dauer."""

    __tablename__ = "agent_runs"
    __table_args__ = (Index("ix_agent_runs_agent_started", "agent", "started_at"),)

    agent: Mapped[str] = mapped_column(String(40), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    trigger: Mapped[str] = mapped_column(String(40), default="schedule")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running | ok | failed | skipped
    summary: Mapped[str] = mapped_column(Text, default="")
    findings: Mapped[list] = mapped_column(JSON, default=list)
    actions: Mapped[list] = mapped_column(JSON, default=list)
    cost_microcents: Mapped[int] = mapped_column(BigInteger, default=0)
    error: Mapped[str | None] = mapped_column(Text)


class AgentTask(IdMixin, TimestampMixin, Base):
    """Aufgaben, die Agenten einander oder dem Betreiber vorlegen. Priorisiert, mit Lernnotiz nach Abschluss."""

    __tablename__ = "agent_tasks"
    __table_args__ = (Index("ix_agent_tasks_status_priority", "status", "priority"),)

    created_by: Mapped[str] = mapped_column(String(40))  # director | ops | user:<id>
    assigned_to: Mapped[str] = mapped_column(String(40))  # product_dev | support | marketing | sales | finance | human
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | in_progress | done | failed | canceled
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_id: Mapped[str | None] = mapped_column(String(36))
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    lesson: Mapped[str | None] = mapped_column(Text)  # „Was haben wir gelernt?“
    dedupe_key: Mapped[str | None] = mapped_column(String(200), index=True)


class Approval(IdMixin, TimestampMixin, Base):
    """Freigabe-Vorgänge für alles, was Agenten nicht allein entscheiden dürfen."""

    __tablename__ = "approvals"

    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)  # None = Betreiberebene
    requested_by: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(60), index=True)  # publish_content | code_change | budget_increase | ...
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    risk_level: Mapped[str] = mapped_column(String(10), default="medium")  # low | medium | high
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending | approved | rejected | expired
    decided_by: Mapped[str | None] = mapped_column(String(36))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(Text)


class ErrorReport(IdMixin, TimestampMixin, Base):
    """Gesammelte Fehler (aus Jobs, API, Agenten) – Grundlage für die KI-Produktentwicklung."""

    __tablename__ = "error_reports"
    __table_args__ = (Index("ix_error_reports_fingerprint", "fingerprint"),)

    fingerprint: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(40))  # api | job | agent | webhook | frontend
    message: Mapped[str] = mapped_column(Text)
    stacktrace: Mapped[str | None] = mapped_column(Text)
    context: Mapped[dict] = mapped_column(JSON, default=dict)
    tenant_id: Mapped[str | None] = mapped_column(String(36))
    occurrences: Mapped[int] = mapped_column(Integer, default=1)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | triaged | fixed | ignored
    reproducible: Mapped[bool | None] = mapped_column(Boolean)
    analysis: Mapped[dict] = mapped_column(JSON, default=dict)


class SupportTicket(IdMixin, TimestampMixin, Base):
    __tablename__ = "support_tickets"
    __table_args__ = (Index("ix_support_tenant_status", "tenant_id", "status"),)

    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user_id: Mapped[str | None] = mapped_column(String(36))
    email: Mapped[str | None] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    category: Mapped[str | None] = mapped_column(String(40))  # howto | bug | billing | feature | account | other
    priority: Mapped[str] = mapped_column(String(10), default="normal")
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | answered | waiting | escalated | closed
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalation_reason: Mapped[str | None] = mapped_column(Text)
    resolution: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), default="user")  # user | system | agent


class SupportMessage(IdMixin, TimestampMixin, Base):
    __tablename__ = "support_messages"

    ticket_id: Mapped[str] = mapped_column(ForeignKey("support_tickets.id", ondelete="CASCADE"), index=True)
    author_type: Mapped[str] = mapped_column(String(10))  # user | agent | operator
    author_id: Mapped[str | None] = mapped_column(String(36))
    body: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)


class KnowledgeArticle(IdMixin, TimestampMixin, Base):
    """Hilfezentrum / Wissensbasis — nur bestätigte Produktfunktionen. Quelle für den Support-Agenten."""

    __tablename__ = "knowledge_articles"

    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(40), default="allgemein")
    feature_codes: Mapped[list] = mapped_column(JSON, default=list)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True)


class ContentPiece(IdMixin, TimestampMixin, Base):
    """Marketing-Inhalte (SEO-Artikel, Anleitungen). Veröffentlichung nur nach bestandenen Prüfungen."""

    __tablename__ = "content_pieces"

    slug: Mapped[str] = mapped_column(String(160), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(20), default="article")  # article | guide | landing
    target_keyword: Mapped[str | None] = mapped_column(String(200))
    audience: Mapped[str | None] = mapped_column(String(60))  # z.B. elektro, shk
    outline: Mapped[list] = mapped_column(JSON, default=list)
    body_markdown: Mapped[str] = mapped_column(Text, default="")
    meta_description: Mapped[str | None] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(String(20), default="idea")  # idea | draft | review | approved | published | archived
    checks: Mapped[dict] = mapped_column(JSON, default=dict)  # quality / facts / rights / safety
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)  # views, signups (aus Analytics)
    generated_by: Mapped[str] = mapped_column(String(40), default="marketing_agent")


class Keyword(IdMixin, TimestampMixin, Base):
    __tablename__ = "keywords"

    term: Mapped[str] = mapped_column(String(200), unique=True)
    audience: Mapped[str | None] = mapped_column(String(60))
    intent: Mapped[str | None] = mapped_column(String(30))  # informational | commercial | transactional
    score: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(40), default="agent")
    notes: Mapped[str | None] = mapped_column(Text)


class Lead(IdMixin, TimestampMixin, Base):
    """Vertrieb: Interessenten ausschließlich aus zulässigen Quellen (Inbound, Empfehlung, Partner, Opt-in)."""

    __tablename__ = "leads"
    __table_args__ = (Index("ix_leads_status", "status"),)

    company: Mapped[str] = mapped_column(String(200))
    contact_name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(60))
    trade: Mapped[str | None] = mapped_column(String(60))
    size: Mapped[str | None] = mapped_column(String(20))  # solo | 2-5 | 6-15 | 16+
    region: Mapped[str | None] = mapped_column(String(100))
    source: Mapped[str] = mapped_column(String(40))  # website_form | demo | referral | partner | inbound_email
    consent_basis: Mapped[str | None] = mapped_column(String(60))  # z.B. "Anfrage über Website", "Einwilligung Newsletter"
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fit_score: Mapped[int | None] = mapped_column(Integer)
    fit_reasons: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="new")  # new | qualified | demo_scheduled | trial | customer | lost
    notes: Mapped[str | None] = mapped_column(Text)
    tenant_id: Mapped[str | None] = mapped_column(String(36))  # sobald Kunde
    next_action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_action: Mapped[str | None] = mapped_column(String(300))


class OutboundEmail(IdMixin, Base):
    """Protokoll aller versendeten (oder nur simulierten) E-Mails — keine stillen Fehlversuche."""

    __tablename__ = "outbound_emails"

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(40))  # transactional | inquiry_reply | report | alert
    provider: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))  # sent | simulated | failed
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    error: Mapped[str | None] = mapped_column(Text)

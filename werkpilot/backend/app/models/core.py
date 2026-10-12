"""Mandanten, Nutzer, Rollen, Sitzungen, Audit."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, IdMixin, TimestampMixin

ROLE_OWNER = "owner"
ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"
ROLES = (ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER)


class Tenant(IdMixin, TimestampMixin, Base):
    """Ein Handwerksbetrieb (Kunde von WerkPilot)."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    trade: Mapped[str] = mapped_column(String(60), default="sonstiges")  # elektro, shk, maler, ...
    contact_email: Mapped[str | None] = mapped_column(String(320))
    phone: Mapped[str | None] = mapped_column(String(60))
    address: Mapped[str | None] = mapped_column(Text)
    timezone: Mapped[str] = mapped_column(String(60), default="Europe/Berlin")
    # Automatisierungsregeln (bewusst konservative Voreinstellungen)
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    business_hours: Mapped[dict] = mapped_column(JSON, default=dict)
    data_retention_days: Mapped[int] = mapped_column(Integer, default=365)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_customer_id: Mapped[str | None] = mapped_column(String(80), index=True)

    memberships: Mapped[list[Membership]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_operator: Mapped[bool] = mapped_column(Boolean, default=False)  # Betreiber von WerkPilot
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    memberships: Mapped[list[Membership]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Membership(IdMixin, TimestampMixin, Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "tenant_id", name="uq_membership"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(20), default=ROLE_MEMBER)

    user: Mapped[User] = relationship(back_populates="memberships")
    tenant: Mapped[Tenant] = relationship(back_populates="memberships")


class Invitation(IdMixin, TimestampMixin, Base):
    __tablename__ = "invitations"

    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    role: Mapped[str] = mapped_column(String(20), default=ROLE_MEMBER)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invited_by: Mapped[str | None] = mapped_column(String(36))


class OneTimeToken(IdMixin, TimestampMixin, Base):
    """E-Mail-Bestätigung, Passwort-Reset. Token nur gehasht gespeichert."""

    __tablename__ = "one_time_tokens"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    purpose: Mapped[str] = mapped_column(String(30))  # verify_email | reset_password
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RefreshSession(IdMixin, TimestampMixin, Base):
    """Serverseitige Sitzung. Refresh-Token im httpOnly-Cookie, gehasht in der DB → sofort widerrufbar."""

    __tablename__ = "refresh_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    ip: Mapped[str | None] = mapped_column(String(64))


class AuditLog(IdMixin, Base):
    """Nachvollziehbarkeit aller automatisierten und sicherheitsrelevanten Aktionen."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_tenant_created", "tenant_id", "created_at"),)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True)
    actor_type: Mapped[str] = mapped_column(String(20))  # user | agent | system | webhook
    actor_id: Mapped[str | None] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80), index=True)
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(36))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    severity: Mapped[str] = mapped_column(String(10), default="info")  # info | warning | security


class SystemSetting(Base):
    """Globale Schalter: Not-Aus, Budgets, Autonomie-Flags. Nur der Betreiber darf schreiben."""

    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_by: Mapped[str | None] = mapped_column(String(80))

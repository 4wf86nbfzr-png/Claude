"""Audit-Protokoll: jede automatisierte oder sicherheitsrelevante Aktion ist nachvollziehbar."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.models.core import AuditLog


async def audit(
    db: AsyncSession,
    action: str,
    *,
    actor_type: str,
    actor_id: str | None = None,
    tenant_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict | None = None,
    severity: str = "info",
) -> AuditLog:
    entry = AuditLog(
        created_at=utcnow(),
        tenant_id=tenant_id,
        actor_type=actor_type,
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=details or {},
        severity=severity,
    )
    db.add(entry)
    await db.flush()
    return entry

"""Ausgehende Webhooks an Kundensysteme (CRM). Signiert mit HMAC-SHA256, Versand als Job mit Wiederholung."""

from __future__ import annotations

import json

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.core.security import decrypt_secret, sign_payload
from app.models.ops import Integration, Job
from app.services.jobs import enqueue, job_handler


async def emit(db: AsyncSession, tenant_id: str, event: str, data: dict) -> Job | None:
    """Legt einen Versand-Job an, wenn der Mandant einen CRM-Webhook für dieses Ereignis hat."""
    integ = (
        await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.type == "crm_webhook", Integration.status == "connected"))
    ).scalar_one_or_none()
    if not integ or event not in ((integ.config or {}).get("events") or []):
        return None
    return await enqueue(db, "crm_webhook", {"event": event, "data": data}, tenant_id=tenant_id, priority=6, max_attempts=5)


@job_handler("crm_webhook")
async def _send(db: AsyncSession, job: Job) -> dict:
    integ = (
        await db.execute(select(Integration).where(Integration.tenant_id == job.tenant_id, Integration.type == "crm_webhook", Integration.status == "connected"))
    ).scalar_one_or_none()
    if not integ:
        return {"skipped": "integration disconnected"}
    from app.core.netsafety import UnsafeUrl, validate_outbound_url

    try:
        target = validate_outbound_url(integ.config["url"])  # erneut prüfen (DNS-Rebinding)
    except UnsafeUrl as e:
        integ.status = "error"
        integ.last_error = "Ziel-URL nicht zulässig."
        await db.flush()
        return {"skipped": f"unsafe url: {e}"}
    secret = decrypt_secret(integ.encrypted_credentials or "") or ""
    body = json.dumps({"event": job.payload["event"], "data": job.payload["data"], "sent_at": utcnow().isoformat()}, ensure_ascii=False)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            target,
            content=body,
            headers={"Content-Type": "application/json", "X-Clairify-Signature": sign_payload(body, secret), "X-Clairify-Event": job.payload["event"]},
        )
    integ.last_checked_at = utcnow()
    if r.status_code >= 300:
        # Kein Status-Oracle für den Mandanten: nur generische Meldung speichern
        integ.last_error = "Zielsystem hat die Zustellung nicht bestätigt."
        await db.commit()  # Meldung bleibt trotz Rollback des fehlgeschlagenen Jobs erhalten
        raise RuntimeError("CRM-Webhook: Zielsystem antwortete nicht mit 2xx (connection retry)")
    integ.last_error = None
    await db.flush()
    return {"status": r.status_code}

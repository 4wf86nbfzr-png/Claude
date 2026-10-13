from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import get_db, utcnow
from app.core.deps import AuthContext, require_admin, require_tenant
from app.core.security import encrypt_secret, hash_token
from app.models.ops import Integration
from app.services import google_calendar
from app.services.email import email_is_live
from app.services.features import F_INTEGRATIONS_ADV, entitlements

router = APIRouter(prefix="/api/integrations", tags=["integrations"])

CATALOG = [
    {
        "type": "contact_form",
        "name": "Kontaktformular / Website",
        "description": "Anfragen von Ihrer Website per Webhook entgegennehmen.",
        "available": True,
        "tier": "starter",
    },
    {
        "type": "email_inbound",
        "name": "E-Mail-Eingang",
        "description": "Eingehende Kunden-E-Mails automatisch erfassen (Weiterleitung an Ihre Clairify-Adresse).",
        "available": True,
        "tier": "starter",
    },
    {"type": "google_calendar", "name": "Google Kalender", "description": "Freie Zeiten lesen und bestätigte Termine eintragen.", "available": None, "tier": "business"},
    {
        "type": "email_outbound",
        "name": "E-Mail-Versand",
        "description": "Antworten werden über den Clairify-Versand gesendet (Reply-To: Ihre Adresse).",
        "available": None,
        "tier": "starter",
    },
    {
        "type": "crm_webhook",
        "name": "CRM / Drittsystem (Webhook)",
        "description": "Neue Anfragen und Statusänderungen an Ihr CRM senden.",
        "available": True,
        "tier": "pro",
    },
    {"type": "microsoft_calendar", "name": "Microsoft 365 Kalender", "description": "Noch nicht verfügbar.", "available": False, "tier": "pro"},
    {
        "type": "whatsapp",
        "name": "WhatsApp Business",
        "description": "Noch nicht verfügbar (rechtliche und technische Prüfung offen).",
        "available": False,
        "tier": "pro",
    },
]


async def _get(db: AsyncSession, tenant_id: str, typ: str) -> Integration:
    row = (await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.type == typ))).scalar_one_or_none()
    if row is None:
        row = Integration(tenant_id=tenant_id, type=typ, status="not_configured")
        db.add(row)
        await db.flush()
    return row


@router.get("")
async def list_integrations(ctx: AuthContext = Depends(require_tenant), db: AsyncSession = Depends(get_db)):
    rows = {r.type: r for r in (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id))).scalars().all()}
    s = get_settings()
    out = []
    for item in CATALOG:
        r = rows.get(item["type"])
        available = item["available"]
        if item["type"] == "google_calendar":
            available = google_calendar.configured()
        if item["type"] == "email_outbound":
            available = email_is_live()
        status = r.status if r else "not_configured"
        if item["type"] == "email_outbound":
            status = "connected" if available else "not_configured"
        cfg = {k: v for k, v in (r.config or {}).items() if not k.startswith("oauth_")} if r else {}
        if item["type"] == "contact_form" and r and r.status == "connected":
            cfg["webhook_url"] = f"{s.base_url}/api/public/forms/{ctx.tenant_id}"
        if item["type"] == "email_inbound":
            cfg["inbound_address_hint"] = f"anfragen+{ctx.tenant.slug}@<ihre-werkpilot-domain>"
            cfg["webhook_url"] = f"{s.base_url}/api/public/inbound-email"
        out.append(
            {
                **item,
                "available": available,
                "status": status,
                "config": cfg,
                "last_error": r.last_error if r else None,
                "connected_at": r.connected_at.isoformat() if r and r.connected_at else None,
            }
        )
    return out


@router.post("/contact-form/enable")
async def enable_contact_form(ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    r = await _get(db, ctx.tenant_id, "contact_form")
    secret = secrets.token_urlsafe(24)
    r.encrypted_credentials = encrypt_secret(secret)
    r.config = {**(r.config or {}), "secret_hash": hash_token(secret)}
    r.status = "connected"
    r.connected_at = utcnow()
    await audit(db, "integration.connected", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, details={"type": "contact_form"})
    await db.commit()
    return {
        "webhook_url": f"{get_settings().base_url}/api/public/forms/{ctx.tenant_id}",
        "secret": secret,
        "hint": "Senden Sie das Formular per POST (JSON oder Formulardaten) mit Header X-Form-Secret an diese Adresse. Das Secret wird nur einmal angezeigt.",
    }


@router.post("/email-inbound/enable")
async def enable_email_inbound(ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    r = await _get(db, ctx.tenant_id, "email_inbound")
    r.status = "connected" if get_settings().inbound_email_webhook_secret else "pending"
    r.connected_at = utcnow()
    r.config = {**(r.config or {}), "slug": ctx.tenant.slug}
    await audit(db, "integration.connected", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, details={"type": "email_inbound"})
    await db.commit()
    return {
        "status": r.status,
        "hint": "Richten Sie in Ihrem Mailprogramm eine Weiterleitung an die Clairify-Eingangsadresse ein. Der Betreiber muss den Inbound-Webhook des Mail-Anbieters konfiguriert haben."
        if r.status == "pending"
        else "Aktiv.",
    }


@router.post("/crm-webhook")
async def set_crm_webhook(payload: dict, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    ent = await entitlements(db, ctx.tenant_id)
    if F_INTEGRATIONS_ADV not in ent["features"]:
        raise HTTPException(403, "CRM-Webhooks sind im Tarif Pro enthalten.")
    from app.core.netsafety import UnsafeUrl, validate_outbound_url

    try:
        url = validate_outbound_url(str(payload.get("url", "")))
    except UnsafeUrl as e:
        raise HTTPException(422, str(e)) from e
    r = await _get(db, ctx.tenant_id, "crm_webhook")
    r.config = {"url": url, "events": payload.get("events") or ["inquiry.created", "inquiry.status_changed"]}
    secret = secrets.token_urlsafe(24)
    r.encrypted_credentials = encrypt_secret(secret)
    r.status = "connected"
    r.connected_at = utcnow()
    await db.commit()
    return {"status": "connected", "signing_secret": secret}


@router.get("/google-calendar/start")
async def google_start(ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if not google_calendar.configured():
        raise HTTPException(503, "Google-Kalender ist noch nicht eingerichtet: Der Betreiber muss GOOGLE_CLIENT_ID/SECRET hinterlegen.")
    url, browser_nonce = await google_calendar.start_auth(db, ctx.tenant_id)
    await db.commit()
    s = get_settings()
    resp = JSONResponse({"url": url})
    resp.set_cookie(
        "wp_oauth", browser_nonce, max_age=600, httponly=True, secure=s.cookie_secure, samesite="lax", path="/api/integrations/google-calendar", domain=s.cookie_domain
    )
    return resp


@router.get("/google-calendar/callback", include_in_schema=False)
async def google_callback(request: Request, state: str = "", code: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    s = get_settings()
    fe = s.frontend_url
    fail = RedirectResponse(f"{fe}/app/integrationen?fehler=google")
    fail.delete_cookie("wp_oauth", path="/api/integrations/google-calendar", domain=s.cookie_domain)
    if error or not code or ":" not in state:
        return fail
    try:
        integ = await google_calendar.finish_auth(db, state, code, request.cookies.get("wp_oauth"))
        await audit(db, "integration.connected", actor_type="user", tenant_id=integ.tenant_id, details={"type": "google_calendar"})
        await db.commit()
    except ValueError as e:
        await db.commit()
        await audit(db, "integration.oauth_rejected", actor_type="system", actor_id="google_callback", details={"reason": str(e)[:200]}, severity="security")
        await db.commit()
        return fail
    except Exception:  # noqa: BLE001
        await db.rollback()
        return fail
    ok = RedirectResponse(f"{fe}/app/integrationen?verbunden=google")
    ok.delete_cookie("wp_oauth", path="/api/integrations/google-calendar", domain=s.cookie_domain)
    return ok


@router.delete("/{integration_type}")
async def disconnect(integration_type: str, ctx: AuthContext = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    if integration_type == "google_calendar":
        await google_calendar.disconnect(db, ctx.tenant_id)
    else:
        r = await _get(db, ctx.tenant_id, integration_type)
        r.status = "disconnected"
        r.encrypted_credentials = None
        r.disconnected_at = utcnow()
    await audit(db, "integration.disconnected", actor_type="user", actor_id=ctx.user.id, tenant_id=ctx.tenant_id, details={"type": integration_type}, severity="security")
    await db.commit()
    return {"message": "Getrennt. Gespeicherte Zugangsdaten wurden gelöscht."}

"""Google Calendar über OAuth 2.0 (nur Freigaben des Kunden; Tokens verschlüsselt gespeichert)."""

from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.security import decrypt_secret, encrypt_secret
from app.models.ops import Integration

SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/calendar/v3"


def configured() -> bool:
    s = get_settings()
    return bool(s.google_client_id and s.google_client_secret)


def redirect_uri() -> str:
    return f"{get_settings().base_url}/api/integrations/google-calendar/callback"


async def get_integration(db: AsyncSession, tenant_id: str) -> Integration:
    row = (await db.execute(select(Integration).where(Integration.tenant_id == tenant_id,
                                                      Integration.type == "google_calendar"))).scalar_one_or_none()
    if row is None:
        row = Integration(tenant_id=tenant_id, type="google_calendar", status="not_configured")
        db.add(row)
        await db.flush()
    return row


async def start_auth(db: AsyncSession, tenant_id: str) -> str:
    integ = await get_integration(db, tenant_id)
    state = secrets.token_urlsafe(24)
    integ.config = {**(integ.config or {}), "oauth_state": state, "oauth_state_at": utcnow().isoformat()}
    integ.status = "pending"
    await db.flush()
    params = {
        "client_id": get_settings().google_client_id, "redirect_uri": redirect_uri(), "response_type": "code",
        "scope": SCOPES, "access_type": "offline", "prompt": "consent", "state": f"{tenant_id}:{state}",
    }
    return f"{AUTH_URL}?{urlencode(params)}"


async def finish_auth(db: AsyncSession, state: str, code: str) -> Integration:
    tenant_id, _, nonce = state.partition(":")
    integ = await get_integration(db, tenant_id)
    if (integ.config or {}).get("oauth_state") != nonce:
        raise ValueError("OAuth-State stimmt nicht überein.")
    s = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(TOKEN_URL, data={
            "code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
            "redirect_uri": redirect_uri(), "grant_type": "authorization_code",
        })
    if r.status_code >= 300:
        integ.status = "error"
        integ.last_error = r.text[:300]
        await db.flush()
        raise ValueError("Token-Austausch fehlgeschlagen.")
    tok = r.json()
    integ.encrypted_credentials = encrypt_secret(
        f'{{"access_token":"{tok["access_token"]}","refresh_token":"{tok.get("refresh_token", "")}",'
        f'"expires_at":"{(utcnow() + timedelta(seconds=tok.get("expires_in", 3600))).isoformat()}"}}'
    )
    integ.status = "connected"
    integ.connected_at = utcnow()
    integ.disconnected_at = None
    integ.last_error = None
    integ.config = {k: v for k, v in (integ.config or {}).items() if not k.startswith("oauth_state")}
    integ.config["calendar_id"] = integ.config.get("calendar_id", "primary")
    await db.flush()
    return integ


async def _access_token(db: AsyncSession, integ: Integration) -> str | None:
    import json

    raw = decrypt_secret(integ.encrypted_credentials or "")
    if not raw:
        return None
    creds = json.loads(raw)
    exp = datetime.fromisoformat(creds["expires_at"])
    if exp > utcnow() + timedelta(minutes=2):
        return creds["access_token"]
    s = get_settings()
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(TOKEN_URL, data={
            "refresh_token": creds.get("refresh_token"), "client_id": s.google_client_id,
            "client_secret": s.google_client_secret, "grant_type": "refresh_token",
        })
    if r.status_code >= 300:
        integ.status = "error"
        integ.last_error = "Token-Erneuerung fehlgeschlagen – bitte neu verbinden."
        await db.flush()
        return None
    tok = r.json()
    creds["access_token"] = tok["access_token"]
    creds["expires_at"] = (utcnow() + timedelta(seconds=tok.get("expires_in", 3600))).isoformat()
    integ.encrypted_credentials = encrypt_secret(json.dumps(creds))
    await db.flush()
    return creds["access_token"]


async def freebusy(db: AsyncSession, tenant_id: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    integ = await get_integration(db, tenant_id)
    if integ.status != "connected":
        return []
    token = await _access_token(db, integ)
    if not token:
        return []
    cal = (integ.config or {}).get("calendar_id", "primary")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{API}/freeBusy", headers={"Authorization": f"Bearer {token}"},
                              json={"timeMin": start.astimezone(UTC).isoformat(), "timeMax": end.astimezone(UTC).isoformat(),
                                    "items": [{"id": cal}]})
    integ.last_checked_at = utcnow()
    if r.status_code >= 300:
        integ.last_error = r.text[:300]
        await db.flush()
        return []
    busy = r.json().get("calendars", {}).get(cal, {}).get("busy", [])
    return [(datetime.fromisoformat(b["start"].replace("Z", "+00:00")), datetime.fromisoformat(b["end"].replace("Z", "+00:00"))) for b in busy]


async def create_event(db: AsyncSession, tenant_id: str, *, title: str, start: datetime, end: datetime, description: str = "") -> str | None:
    integ = await get_integration(db, tenant_id)
    if integ.status != "connected":
        return None
    token = await _access_token(db, integ)
    if not token:
        return None
    cal = (integ.config or {}).get("calendar_id", "primary")
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{API}/calendars/{cal}/events", headers={"Authorization": f"Bearer {token}"},
                              json={"summary": title, "description": description,
                                    "start": {"dateTime": start.isoformat()}, "end": {"dateTime": end.isoformat()}})
    if r.status_code >= 300:
        integ.last_error = r.text[:300]
        await db.flush()
        return None
    return r.json().get("id")


async def disconnect(db: AsyncSession, tenant_id: str) -> Integration:
    integ = await get_integration(db, tenant_id)
    integ.encrypted_credentials = None
    integ.status = "disconnected"
    integ.disconnected_at = utcnow()
    await db.flush()
    return integ

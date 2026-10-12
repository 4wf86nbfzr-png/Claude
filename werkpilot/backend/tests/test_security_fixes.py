"""Regressionstests für die Befunde des Sicherheits-Reviews."""

import httpx
import pytest
from sqlalchemy import select

from app.core.netsafety import UnsafeUrl, validate_outbound_url
from app.models.ops import Integration
from app.services import google_calendar
from tests.conftest import activate_plan, register_and_login


def test_outbound_url_validation():
    assert validate_outbound_url("https://crm.example.org/hook") == "https://crm.example.org/hook"
    for bad in (
        "http://crm.example.org/",
        "https://10.0.0.12:8443/",
        "https://127.0.0.1/",
        "https://localhost/",
        "https://crm.example.org:8443/",
        "https://user:pw@crm.example.org/",
        "https://intranet.intern/hook",
        "https://[::1]/",
        "https://169.254.169.254/latest/",
    ):
        with pytest.raises(UnsafeUrl):
            validate_outbound_url(bad)


async def test_crm_webhook_rejects_internal_targets(client, db):
    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "pro")
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://10.0.0.12:8443/"})).status_code == 422
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://intranet.intern/hook"})).status_code == 422
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.example.org/hook"})).status_code == 200


async def test_crm_webhook_error_is_generic(client, db, monkeypatch):
    from app.services.jobs import run_pending

    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "pro")
    await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.example.org/hook"})

    async def fail(self, request, **kw):  # noqa: ARG001
        return httpx.Response(418, request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail)
    await client.post("/api/inquiries", headers=h, json={"body": "Wartung, Musterstr 1 20095 Hamburg 040123", "sender_email": "k@x.test"})
    await run_pending(db)
    integ = (await client.get("/api/integrations", headers=h)).json()
    crm = next(i for i in integ if i["type"] == "crm_webhook")
    assert "418" not in (crm["last_error"] or "") and crm["last_error"]


async def test_oauth_callback_requires_browser_binding(client, db, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "google_client_id", "cid")
    monkeypatch.setattr(get_settings(), "google_client_secret", "sec")
    h, tid = await register_and_login(client)
    r = await client.get("/api/integrations/google-calendar/start", headers=h)
    assert r.status_code == 200 and "accounts.google.com" in r.json()["url"]
    assert "wp_oauth" in r.cookies
    state = r.json()["url"].split("state=")[1].split("&")[0].replace("%3A", ":")
    exchanged: list[str] = []

    async def fake_exchange(self, request, **kw):  # noqa: ARG001
        exchanged.append(str(request.url))
        return httpx.Response(200, json={"access_token": "at", "refresh_token": "rt", "expires_in": 3600}, request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fake_exchange)
    # Angreifer-Szenario: Callback aus einem fremden Browser (ohne Cookie) → abgelehnt, kein Token-Austausch
    foreign = httpx.AsyncClient(transport=httpx.ASGITransport(app=client._transport.app), base_url="http://test")  # type: ignore[attr-defined]
    r2 = await foreign.get(f"/api/integrations/google-calendar/callback?state={state}&code=victimcode")
    assert r2.status_code in (302, 307) and "fehler=google" in r2.headers["location"]
    assert exchanged == []
    integ = (await db.execute(select(Integration).where(Integration.tenant_id == tid, Integration.type == "google_calendar"))).scalar_one()
    await db.refresh(integ)
    assert integ.status != "connected" and integ.encrypted_credentials is None
    # State ist nach dem Versuch verbraucht: auch der echte Browser kann ihn nicht mehr nutzen
    r3 = await client.get(f"/api/integrations/google-calendar/callback?state={state}&code=code2")
    assert "fehler=google" in r3.headers["location"]
    # Neuer Start, korrekter Browser → verbunden
    r = await client.get("/api/integrations/google-calendar/start", headers=h)
    state = r.json()["url"].split("state=")[1].split("&")[0].replace("%3A", ":")
    r4 = await client.get(f"/api/integrations/google-calendar/callback?state={state}&code=goodcode")
    assert "verbunden=google" in r4.headers["location"] and len(exchanged) == 1
    await db.refresh(integ)
    assert integ.status == "connected" and integ.encrypted_credentials
    assert not any(k.startswith("oauth_") for k in integ.config)


async def test_oauth_state_expires(db, client, monkeypatch):
    from datetime import timedelta

    from app.core.db import utcnow

    h, tid = await register_and_login(client)
    url, nonce = await google_calendar.start_auth(db, tid)
    integ = await google_calendar.get_integration(db, tid)
    integ.config = {**integ.config, "oauth_state_at": (utcnow() - timedelta(minutes=11)).isoformat()}
    await db.commit()
    state = url.split("state=")[1].split("&")[0].replace("%3A", ":")
    with pytest.raises(ValueError, match="abgelaufen"):
        await google_calendar.finish_auth(db, state, "code", nonce)


async def test_plan_resolved_from_price_not_metadata(client, db):
    from tests.test_billing import signed, sub_event

    h, tid = await register_and_login(client)
    await client.post("/api/auth/login", json={"email": "chef@beispiel-elektro.test", "password": "Moin-Hafen-2026!"})
    from app.models.billing import Plan

    starter = (await db.execute(select(Plan).where(Plan.code == "starter"))).scalar_one()
    starter.stripe_price_id = "price_starter_test"
    await db.commit()
    # Metadaten sagen "business", Preis-ID ist Starter (Portal-Downgrade) → Starter gilt
    body, sig = signed(sub_event("evt_p1", "customer.subscription.updated", tid, "active", price_id="price_starter_test"))
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})).json()[
        "result"
    ] == "processed"
    ent = (await client.get("/api/billing/status", headers=h)).json()["entitlements"]
    assert ent["plan"] == "starter" and "automations" not in ent["features"]


async def test_csv_export_neutralises_formulas(client, db):
    h, tid = await register_and_login(client)
    await client.post("/api/customers", headers=h, json={"name": '=HYPERLINK("https://evil.test";"Klick")', "email": "x@x.test", "notes": "+1-2", "phone": "@cmd"})
    csv = (await client.get("/api/tenant/export/customers.csv", headers=h)).text
    assert "'=HYPERLINK" in csv and "'+1-2" in csv and "'@cmd" in csv and "\n=" not in csv


async def test_verify_email_does_not_log_in(client):
    from tests.conftest import last_mail_link

    r = await client.post(
        "/api/auth/register",
        json={
            "email": "opfer@firma.test",
            "password": "Angreifer-Kennt-Es-1",
            "full_name": "A",
            "company": "Opfer Firma",
            "trade": "shk",
            "accept_terms": True,
            "accept_privacy": True,
        },
    )
    assert r.status_code == 201
    r = await client.post("/api/auth/verify-email", json={"token": last_mail_link("/bestaetigen")})
    assert r.status_code == 200 and "access_token" not in r.json() and "wp_access" not in r.cookies

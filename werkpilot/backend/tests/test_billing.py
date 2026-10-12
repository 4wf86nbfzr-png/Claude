import hashlib
import hmac
import json
import time

from tests.conftest import activate_plan, make_operator, register_and_login

SECRET = "whsec_testsecret"


def signed(payload: dict) -> tuple[bytes, str]:
    body = json.dumps(payload).encode()
    ts = int(time.time())
    sig = hmac.new(SECRET.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()
    return body, f"t={ts},v1={sig}"


def sub_event(event_id: str, etype: str, tenant_id: str, status: str, price_id: str = "price_business_test", sub_id="sub_123", **extra) -> dict:
    return {"id": event_id, "type": etype, "data": {"object": {"id": sub_id, "object": "subscription", "customer": "cus_123", "status": status,
            "metadata": {"tenant_id": tenant_id, "plan_code": "business"}, "cancel_at_period_end": extra.get("cancel", False),
            "canceled_at": extra.get("canceled_at"), "ended_at": None, "trial_end": None,
            "items": {"data": [{"price": {"id": price_id}, "current_period_end": int(time.time()) + 30 * 86400}]}}}}


async def test_public_plans(client):
    plans = (await client.get("/api/billing/plans")).json()
    assert [p["code"] for p in plans] == ["starter", "business", "pro"]
    assert plans[1]["price_cents_monthly"] == 14900 and plans[1]["checkout_available"] is False


async def test_checkout_without_price_id(client):
    h, _ = await register_and_login(client)
    r = await client.post("/api/billing/checkout", headers=h, json={"plan": "starter"})
    assert r.status_code == 503 and "Stripe" in r.json()["detail"]
    assert (await client.post("/api/billing/checkout", headers=h, json={"plan": "gibtsnicht"})).status_code == 404


async def test_webhook_signature_required(client):
    body, _ = signed({"id": "evt_x", "type": "ping", "data": {"object": {}}})
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json"})).status_code == 400
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": "t=1,v1=deadbeef"})).status_code == 400


async def test_subscription_lifecycle_via_webhooks(client, db):
    h, tid = await register_and_login(client)
    assert (await client.get("/api/billing/status", headers=h)).json()["entitlements"]["status"] == "trialing"
    # Aktivierung
    body, sig = signed(sub_event("evt_1", "customer.subscription.created", tid, "active"))
    r = await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    assert r.status_code == 200 and r.json()["result"] == "processed"
    ent = (await client.get("/api/billing/status", headers=h)).json()["entitlements"]
    assert ent["status"] == "active" and ent["plan"] == "business" and "automations" in ent["features"]
    # Duplikat wird nicht erneut verarbeitet
    r = await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    assert r.json()["result"] == "duplicate"
    # Zahlung fehlgeschlagen → past_due, Rechnung gespeichert
    inv = {"id": "evt_2", "type": "invoice.payment_failed", "data": {"object": {"id": "in_1", "customer": "cus_123", "amount_due": 14900, "currency": "eur", "status": "open", "hosted_invoice_url": "https://stripe.test/inv"}}}
    body, sig = signed(inv)
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})).json()["result"] == "processed"
    st = (await client.get("/api/billing/status", headers=h)).json()
    assert st["entitlements"]["status"] == "past_due" and st["entitlements"]["active"] is True and st["invoices"][0]["status"] == "open"
    # Bezahlt → aktiv
    inv["id"] = "evt_3"; inv["type"] = "invoice.paid"; inv["data"]["object"]["status"] = "paid"; inv["data"]["object"]["amount_paid"] = 14900
    body, sig = signed(inv)
    await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    body, sig = signed(sub_event("evt_4", "customer.subscription.updated", tid, "active"))
    await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    assert (await client.get("/api/billing/status", headers=h)).json()["entitlements"]["status"] == "active"
    # Kündigung → canceled, Funktionen weg
    body, sig = signed(sub_event("evt_5", "customer.subscription.deleted", tid, "canceled", canceled_at=int(time.time())))
    await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    ent = (await client.get("/api/billing/status", headers=h)).json()["entitlements"]
    assert ent["status"] == "canceled" and ent["active"] is False and ent["features"] == []
    assert (await client.post("/api/inquiries", headers=h, json={"body": "Heizung kaputt"})).status_code == 402
    # Unbekannter Eventtyp wird ignoriert, aber bestätigt
    body, sig = signed({"id": "evt_6", "type": "charge.refunded", "data": {"object": {}}})
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})).json()["result"] == "ignored"


async def test_plan_management_by_operator(client, db):
    h, tid = await register_and_login(client, email="op@x.test", company="Op GmbH")
    await make_operator(db, "op@x.test")
    r = await client.put("/api/admin/plans/starter", headers=h, json={"code": "starter", "name": "Starter", "price_cents_monthly": 8900, "features": ["inquiries"], "limits": {"users": 3}, "stripe_price_id": "price_starter_live", "sort_order": 1})
    assert r.status_code == 200
    plans = (await client.get("/api/billing/plans")).json()
    assert plans[0]["price_cents_monthly"] == 8900 and plans[0]["checkout_available"] is True
    r = await client.put("/api/admin/plans/enterprise", headers=h, json={"code": "enterprise", "name": "Enterprise", "price_cents_monthly": 49900, "features": [], "limits": {}, "is_public": False, "sort_order": 9})
    assert r.status_code == 200 and all(p["code"] != "enterprise" for p in (await client.get("/api/billing/plans")).json())


async def test_feature_gating_by_plan(client, db):
    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "starter")
    assert (await client.post("/api/appointments", headers=h, json={"title": "x", "starts_at": "2030-01-01T10:00:00+01:00", "ends_at": "2030-01-01T11:00:00+01:00"})).status_code == 403
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.test/hook"})).status_code == 403
    await activate_plan(db, tid, "pro")
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.test/hook"})).status_code == 200
    assert (await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "http://unsicher.test"})).status_code == 422

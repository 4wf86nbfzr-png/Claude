"""Gesamte Kundenreise: Website → Registrierung → Bestätigung → Einrichtung → Anfrage → Entwurf → Versand →
Angebot → Nachfassen → Bericht → Zahlung (Webhook) → Kündigung → Löschung."""

import json

from tests.conftest import ConsoleProvider, last_mail_link
from tests.test_billing import signed, sub_event


async def test_full_customer_journey(client, db):
    # 1-3 Website + Demo
    demo = await client.post("/api/public/demo/classify", json={"text": "Guten Tag, wir brauchen ein Angebot für eine neue Elektroinstallation im Anbau. Wann passt es Ihnen?", "trade": "elektro"})
    assert demo.status_code == 200 and demo.json()["classification"]["category"] in ("angebot", "neuinstallation", "terminfrage")
    # 4-6 Registrierung, Bestätigung, Konto
    r = await client.post("/api/auth/register", json={"email": "inhaber@elektro-nord.test", "password": "Elbe-Kran-Moewe-33", "full_name": "Nina Nord", "company": "Elektro Nord", "trade": "elektro", "accept_terms": True, "accept_privacy": True})
    assert r.status_code == 201
    tid = r.json()["tenant_id"]
    r = await client.post("/api/auth/verify-email", json={"token": last_mail_link("/bestaetigen")})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    t = (await client.get("/api/tenant", headers=h)).json()
    assert t["entitlements"]["status"] == "trialing" and "ai_drafts" in t["entitlements"]["features"]
    # 10-13 Einrichtung
    r = await client.patch("/api/tenant", headers=h, json={"contact_email": "buero@elektro-nord.test", "address": "Hafenstr. 1, 20457 Hamburg", "settings": {"signature": "Nina Nord, Elektro Nord", "quote_followup_days": 3}, "business_hours": {"mon": [["07:00", "15:00"]], "tue": [["07:00", "15:00"]], "wed": [["07:00", "15:00"]], "thu": [["07:00", "15:00"]], "fri": [["07:00", "12:00"]], "sat": [], "sun": []}})
    assert r.status_code == 200
    integ = (await client.get("/api/integrations", headers=h)).json()
    assert {i["type"] for i in integ} >= {"contact_form", "email_inbound", "google_calendar"}
    assert next(i for i in integ if i["type"] == "whatsapp")["available"] is False
    form = (await client.post("/api/integrations/contact-form/enable", headers=h)).json()
    # 14 Anfrage kommt über Website rein → Worker verarbeitet
    r = await client.post(f"/api/public/forms/{tid}", json={"name": "Bernd Bauherr", "email": "bernd@bau.test", "telefon": "0170 5555", "nachricht": "Wir bauen an und brauchen eine komplette Elektroinstallation für 3 Räume. Wann könnten Sie sich das ansehen? Deichweg 4, 21029 Hamburg"}, headers={"X-Form-Secret": form["secret"]})
    assert r.status_code == 201
    from app.services.jobs import run_pending

    assert (await run_pending(db))["ok"] == 1
    items = (await client.get("/api/inquiries", headers=h)).json()["items"]
    inq = items[0]
    assert inq["status"] == "needs_review" and inq["sender_email"] == "bernd@bau.test"
    detail = (await client.get(f"/api/inquiries/{inq['id']}", headers=h)).json()
    draft = detail["drafts"][0]
    assert draft["proposed_slots"] and "Nina Nord" in draft["body"]
    # Terminvorschläge liegen in den eingestellten Geschäftszeiten (07-15 Uhr)
    from datetime import datetime

    for s in draft["proposed_slots"]:
        hour = datetime.fromisoformat(s["starts_at"]).hour
        assert 7 <= hour < 15
    r = await client.post(f"/api/drafts/{draft['id']}/approve", headers=h, json={})
    assert r.json()["delivery_status"] == "simulated" and ConsoleProvider.sent[-1]["to"] == "bernd@bau.test" and ConsoleProvider.sent[-1]["reply_to"] == "buero@elektro-nord.test"
    # Kunde bestätigt Termin (telefonisch) → Betrieb bestätigt im Dashboard
    appt = detail["appointments"] or (await client.get(f"/api/inquiries/{inq['id']}", headers=h)).json()["appointments"]
    r = await client.patch(f"/api/appointments/{appt[0]['id']}", headers=h, json={"status": "confirmed"})
    assert r.json()["status"] == "confirmed"
    assert (await client.get(f"/api/inquiries/{inq['id']}", headers=h)).json()["status"] == "scheduled"
    # Angebot gestellt → Nachfassen (Testphase enthält quote_followup)
    r = await client.post("/api/quotes", headers=h, json={"title": "Elektroinstallation Anbau", "inquiry_id": inq["id"], "amount_cents": 480000})
    assert r.status_code == 201 and r.json()["next_followup_at"]
    # 15 Bericht
    rep = (await client.post("/api/tenant/reports/weekly", headers=h)).json()
    assert rep["data"]["inquiries_new"] == 1 and rep["data"]["replies_sent"] == 1 and rep["data"]["quotes_open"] == 1 and rep["data"]["appointments_upcoming"] == 1
    dash = (await client.get("/api/tenant/dashboard", headers=h)).json()
    assert dash["inquiries"]["open"] == 1 and dash["quotes_open"] == 1 and dash["ai"]["calls_30d"] == 2
    # 7-9 Tarifwahl + Zahlung (Webhook im Testmodus)
    body, sig = signed(sub_event("evt_e2e_1", "customer.subscription.created", tid, "active"))
    assert (await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})).json()["result"] == "processed"
    ent = (await client.get("/api/billing/status", headers=h)).json()["entitlements"]
    assert ent["plan"] == "business" and "appointments" in ent["features"]
    # Automatisierung aktivieren (jetzt erlaubt)
    assert (await client.patch("/api/tenant", headers=h, json={"settings": {"auto_reply_enabled": True}})).status_code == 200
    # 16 Supportfall → automatisch beantwortet/eskaliert
    r = await client.post("/api/support/tickets", headers=h, json={"subject": "Frage", "body": "Wie ändere ich mein Zahlungsmittel für das Abo?"})
    await run_pending(db)
    tk = (await client.get(f"/api/support/tickets/{r.json()['id']}", headers=h)).json()
    assert tk["status"] in ("answered", "escalated") and len(tk["messages"]) == 2
    # 17 Kündigung → Funktionen enden
    body, sig = signed(sub_event("evt_e2e_2", "customer.subscription.deleted", tid, "canceled"))
    await client.post("/api/billing/webhook", content=body, headers={"Content-Type": "application/json", "Stripe-Signature": sig})
    assert (await client.get("/api/billing/status", headers=h)).json()["entitlements"]["active"] is False
    # 18 Export + Löschung
    export = (await client.get("/api/tenant/export", headers=h)).json()
    assert export["quotes"][0]["amount_cents"] == 480000
    assert (await client.post("/api/tenant/delete", headers=h, json={"confirm": "elektro-nord"})).status_code == 200
    # Audit-Trail vollständig
    from sqlalchemy import select

    from app.models.core import AuditLog

    actions = [a.action for a in (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tid).order_by(AuditLog.created_at))).scalars().all()]
    assert (await db.execute(select(AuditLog).where(AuditLog.action == "user.email_verified"))).scalars().first()
    for needed in ("user.registered", "tenant.updated", "integration.connected", "inquiry.created", "draft.sent", "billing.subscription_synced", "tenant.exported", "tenant.deletion_requested"):
        assert needed in actions, needed
    _ = json

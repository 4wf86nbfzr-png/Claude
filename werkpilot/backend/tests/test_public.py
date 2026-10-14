import json

from sqlalchemy import select

from app.core.security import sign_payload
from app.models.ops import Lead
from tests.conftest import ConsoleProvider, register_and_login


async def test_contact_lead_and_honeypot(client, db):
    r = await client.post(
        "/api/public/contact",
        json={"company": "Maler Nord", "name": "Ina", "email": "ina@nord.test", "trade": "maler", "size": "2-5", "message": "Interesse", "consent": True},
    )
    assert r.status_code == 201
    lead = (await db.execute(select(Lead))).scalar_one()
    assert lead.source == "website_form" and lead.consent_basis
    assert any(m["to"] == "ina@nord.test" for m in ConsoleProvider.sent) and any(m["to"] == "ops@example.test" for m in ConsoleProvider.sent)
    r = await client.post("/api/public/contact", json={"company": "Bot", "name": "Bot", "email": "bot@x.test", "consent": True, "website": "http://spam"})
    assert r.status_code == 201 and len((await db.execute(select(Lead))).scalars().all()) == 1
    assert (await client.post("/api/public/contact", json={"company": "X", "name": "Y", "email": "y@x.test", "consent": False})).status_code == 422


async def test_contact_rate_limit(client):
    for i in range(5):
        await client.post("/api/public/contact", json={"company": f"C{i}", "name": "Nils", "email": f"n{i}@x.test", "consent": True})
    assert (await client.post("/api/public/contact", json={"company": "C9", "name": "Nils", "email": "n9@x.test", "consent": True})).status_code == 429


async def test_website_form_webhook(client, db):
    h, tid = await register_and_login(client)
    assert (await client.post(f"/api/public/forms/{tid}", json={"message": "x"})).status_code == 404
    r = await client.post("/api/integrations/contact-form/enable", headers=h)
    secret = r.json()["secret"]
    assert (await client.post(f"/api/public/forms/{tid}", json={"message": "Heizung kaputt"}, headers={"X-Form-Secret": "falsch"})).status_code == 401
    r = await client.post(
        f"/api/public/forms/{tid}",
        json={"name": "Max", "email": "max@kunde.test", "message": "Heizung kaputt, Musterstr 1, 20095 Hamburg, 040 1234"},
        headers={"X-Form-Secret": secret},
    )
    assert r.status_code == 201
    # Formulardaten (klassisches HTML-Formular) gehen auch
    r = await client.post(
        f"/api/public/forms/{tid}", data={"name": "Eva", "email": "eva@kunde.test", "nachricht": "Angebot für Zaun", "website": ""}, headers={"X-Form-Secret": secret}
    )
    assert r.status_code == 201
    assert (
        await client.post(f"/api/public/forms/{tid}", data={"nachricht": "spam", "website": "bot"}, headers={"X-Form-Secret": secret})
    ).status_code == 201  # Honeypot: still, aber nichts gespeichert
    from app.services.jobs import run_pending

    await run_pending(db)
    items = (await client.get("/api/inquiries", headers=h)).json()["items"]
    assert len(items) == 2 and all(i["channel"] == "form" for i in items)
    assert any(i["status"] == "needs_review" and i["category"] for i in items)


async def test_inbound_email_signature_and_routing(client, db):
    h, tid = await register_and_login(client, company="Dach Hamburg GmbH")
    payload = {
        "to": "anfragen+dach-hamburg-gmbh@mail.werkpilot.test",
        "from": "kunde@x.test",
        "from_name": "K. Kunde",
        "subject": "Sturmschaden",
        "text": "Nach dem Sturm fehlen Ziegel, es regnet rein. Musterweg 9, 22222 Hamburg, 0171 999",
        "message_id": "<abc@x>",
    }
    raw = json.dumps(payload)
    assert (await client.post("/api/public/inbound-email", content=raw, headers={"Content-Type": "application/json"})).status_code == 401
    sig = sign_payload(raw, "inbound-secret")
    r = await client.post("/api/public/inbound-email", content=raw, headers={"Content-Type": "application/json", "X-Inbound-Signature": sig})
    assert r.status_code == 201
    # gleiche Message-ID → keine Dublette
    r2 = await client.post("/api/public/inbound-email", content=raw, headers={"Content-Type": "application/json", "X-Inbound-Signature": sig})
    assert r2.json()["id"] == r.json()["id"]
    bad = raw.replace("dach-hamburg-gmbh", "unbekannt")
    assert (
        await client.post(
            "/api/public/inbound-email", content=bad, headers={"Content-Type": "application/json", "X-Inbound-Signature": sign_payload(bad, "inbound-secret")}
        )
    ).status_code == 404
    from app.services.jobs import run_pending

    await run_pending(db)
    items = (await client.get("/api/inquiries", headers=h)).json()["items"]
    assert len(items) == 1 and items[0]["category"] == "notfall" and items[0]["priority"] == "urgent"


async def test_demo_endpoint_no_tenant_cost(client, db):
    r = await client.post("/api/public/demo/classify", json={"text": "Hallo, unsere Heizung ist ausgefallen und es ist kalt. Wann können Sie kommen?", "trade": "shk"})
    assert r.status_code == 200
    j = r.json()
    assert j["classification"]["category"] == "notfall" and "Guten Tag" in j["draft"]["body"]
    assert j["engine"] == "regeln" and j["stored"] is False and "Regeln" in j["note"]
    from app.models.billing import AIUsage

    rows = (await db.execute(select(AIUsage))).scalars().all()
    assert all(u.tenant_id is None and u.provider == "mock" for u in rows)
    assert (await client.post("/api/public/demo/classify", json={"text": "kurz"})).status_code == 422


async def test_website_assistant_rule_based(client, db):
    r = await client.post("/api/public/assistant", json={"question": "Was kostet Clairify im Monat?"})
    assert r.status_code == 200
    j = r.json()
    assert "79 €" in j["answer"] and j["source"] == "regeln" and j["unsure"] is False
    r = await client.post("/api/public/assistant", json={"question": "Wie wird das Wetter morgen?"})
    assert r.json()["unsure"] is True and "Kontaktformular" in r.json()["answer"]
    # Fragen werden nicht gespeichert und ohne KI-Anbieter entsteht keine Nutzungszeile
    from app.models.billing import AIUsage

    assert (await db.execute(select(AIUsage).where(AIUsage.task == "website_assistant"))).scalars().all() == []
    assert (await client.post("/api/public/assistant", json={"question": "x"})).status_code == 422


async def test_public_config_and_health(client):
    assert (await client.get("/health")).json()["db"] is True
    cfg = (await client.get("/api/public/config")).json()
    assert cfg["stripe_ready"] is True and cfg["llm_live"] is False and cfg["trial_days"] == 14
    assert cfg["downloads"] == {"windows": None, "macos": None, "linux": None, "ios": None, "android": None}


async def test_public_content_only_published(client, db):
    from app.core.db import utcnow
    from app.models.ops import ContentPiece

    db.add(ContentPiece(slug="geheim", title="Entwurf", body_markdown="# x", status="draft"))
    db.add(ContentPiece(slug="live", title="Live", body_markdown="# Live\n\n## A\n\nText", status="published", published_at=utcnow()))
    await db.commit()
    items = (await client.get("/api/public/content")).json()
    assert [i["slug"] for i in items] == ["live"]
    assert (await client.get("/api/public/content/geheim")).status_code == 404
    assert (await client.get("/api/public/content/live")).json()["body_markdown"].startswith("# Live")
    await db.refresh((await db.execute(__import__("sqlalchemy").select(ContentPiece).where(ContentPiece.slug == "live"))).scalar_one())


async def test_customer_confirms_appointment_via_link(client, db):
    import re

    from app.models.crm import Appointment, Inquiry

    h, tid = await register_and_login(client)
    r = await client.post(
        "/api/inquiries", headers=h, json={"body": "Heizung ausgefallen, Musterstr 1 20095 Hamburg 040123", "sender_email": "k@x.test", "sender_name": "Kai"}
    )
    inq_id = r.json()["id"]
    drafts = (await client.get("/api/drafts", headers=h)).json()
    d = next(x for x in drafts if x["inquiry_id"] == inq_id)
    assert len(d["proposed_slots"]) >= 1
    await client.post(f"/api/drafts/{d['id']}/approve", headers=h, json={})
    mail = next(m for m in ConsoleProvider.sent if m["to"] == "k@x.test")
    tokens = re.findall(r"/termin\?token=([A-Za-z0-9_\-]+)", mail["text"])
    assert len(tokens) == len(d["proposed_slots"])
    assert "KI-Assistenten" not in mail["text"]  # manuell freigegeben → kein Auto-Hinweis
    assert (await client.get(f"/api/public/appointments/confirm?token={tokens[0]}")).json()["status"] == "proposed"
    assert (await client.post("/api/public/appointments/confirm", json={"token": "falsch"})).status_code == 400
    r = await client.post("/api/public/appointments/confirm", json={"token": tokens[0]})
    assert r.status_code == 200 and r.json()["status"] == "confirmed"
    inq = await db.get(Inquiry, inq_id)
    await db.refresh(inq)
    assert inq.status == "scheduled"
    appts = (await db.execute(select(Appointment).where(Appointment.inquiry_id == inq_id))).scalars().all()
    assert sum(1 for a in appts if a.status == "confirmed") == 1 and all(a.status != "proposed" for a in appts)
    assert any(m["to"] == "chef@beispiel-elektro.test" and "Termin bestätigt" in m["subject"] for m in ConsoleProvider.sent)
    # Link ist einmalig
    assert (await client.post("/api/public/appointments/confirm", json={"token": tokens[0]})).status_code == 400

import hashlib
import hmac
import json

import httpx
from sqlalchemy import select

from app.models.ops import Job
from app.services.jobs import run_pending
from tests.conftest import activate_plan, register_and_login


async def test_crm_webhook_is_sent_and_signed(client, db, monkeypatch):
    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "pro")
    r = await client.post(
        "/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.example.org/hook", "events": ["inquiry.created", "inquiry.status_changed"]}
    )
    secret = r.json()["signing_secret"]
    received: list[httpx.Request] = []

    async def fake_send(self, request, **kw):  # noqa: ARG001
        received.append(request)
        return httpx.Response(200, request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fake_send)
    r = await client.post("/api/inquiries", headers=h, json={"body": "Heizung kaputt, Musterstr 1 20095 Hamburg 040123", "sender_email": "k@x.test"})
    inq_id = r.json()["id"]
    await client.patch(f"/api/inquiries/{inq_id}/status", headers=h, json={"status": "won"})
    jobs = (await db.execute(select(Job).where(Job.type == "crm_webhook"))).scalars().all()
    assert len(jobs) == 2
    res = await run_pending(db)
    assert res["ok"] >= 2
    assert len(received) == 2
    req = received[0]
    body = req.content.decode()
    assert json.loads(body)["event"] == "inquiry.created" and json.loads(body)["data"]["id"] == inq_id
    expected = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    assert req.headers["X-WerkPilot-Signature"] == expected and str(req.url) == "https://crm.example.org/hook"


async def test_crm_webhook_failure_is_retried(client, db, monkeypatch):
    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "pro")
    await client.post("/api/integrations/crm-webhook", headers=h, json={"url": "https://crm.example.org/hook"})

    async def fail(self, request, **kw):  # noqa: ARG001
        return httpx.Response(503, request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail)
    await client.post("/api/inquiries", headers=h, json={"body": "Wartung, Musterstr 1 20095 Hamburg 040123", "sender_email": "k@x.test"})
    await run_pending(db)
    j = (await db.execute(select(Job).where(Job.type == "crm_webhook"))).scalar_one()
    await db.refresh(j)
    assert j.status == "queued" and j.attempts == 1 and j.error_category == "transient_network"

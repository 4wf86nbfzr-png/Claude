from datetime import timedelta

from sqlalchemy import select

from app.agents.registry import AGENTS
from app.core.db import utcnow
from app.core.system import activate_kill_switch
from app.models.billing import AIUsage
from app.models.crm import Report
from app.models.ops import AgentRun, AgentTask, Approval, ContentPiece, ErrorReport, Lead, SupportTicket
from tests.conftest import ConsoleProvider, activate_plan, make_operator, register_and_login


async def test_ops_agent_creates_daily_report_and_alerts(db):
    db.add(ErrorReport(fingerprint="f" * 64, source="job:x", message="boom", occurrences=25, last_seen_at=utcnow(), context={}))
    await db.commit()
    run = await AGENTS["ops"]().run(db, trigger="test")
    await db.commit()
    assert run.status == "ok" and run.cost_microcents == 0
    assert any("Wiederholter Fehler" in f for f in run.findings)
    assert any(m["to"] == "ops@example.test" and "Kritische" in m["subject"] for m in ConsoleProvider.sent)
    rep = (await db.execute(select(Report).where(Report.kind == "daily_ops"))).scalar_one()
    assert rep.data["critical"]
    # zweiter Lauf am selben Tag erzeugt keinen zweiten Tagesbericht
    await AGENTS["ops"]().run(db, trigger="test")
    await db.commit()
    assert len((await db.execute(select(Report).where(Report.kind == "daily_ops"))).scalars().all()) == 1


async def test_ops_agent_triggers_kill_switch_on_cost_anomaly(db):
    from app.core.system import kill_switch_active

    for _ in range(5):
        db.add(AIUsage(created_at=utcnow(), provider="anthropic", model="x", task="t", cost_microcents=10_000 * 1_000_000, success=True))
    await db.commit()
    await AGENTS["ops"]().run(db, trigger="test")
    await db.commit()
    assert await kill_switch_active(db) is True


async def test_director_prioritizes_and_learns(db, client):
    h, tid = await register_and_login(client)
    db.add(SupportTicket(tenant_id=tid, subject="Hilfe", status="escalated"))
    db.add(AgentTask(created_by="x", assigned_to="support", title="alt", status="done", result={"summary": "erledigt"}))
    for i in range(3):
        db.add(ErrorReport(fingerprint=f"{i}" * 64, source="api", message=f"err {i}", last_seen_at=utcnow(), context={}))
    await db.commit()
    run = await AGENTS["director"]().run(db, trigger="test")
    await db.commit()
    assert run.status == "ok", run.error
    tasks = (await db.execute(select(AgentTask).where(AgentTask.status == "open"))).scalars().all()
    titles = " | ".join(t.title for t in tasks)
    assert "eskalierte Supportfälle" in titles and "Fehlerberichte" in titles
    assert next(t for t in tasks if "Supportfälle" in t.title).priority == 1
    learned = (await db.execute(select(AgentTask).where(AgentTask.title == "alt"))).scalar_one()
    assert learned.lesson and "erledigt" in learned.lesson
    # Zweiter Lauf erzeugt keine Duplikate
    await AGENTS["director"]().run(db, trigger="test")
    await db.commit()
    assert len((await db.execute(select(AgentTask).where(AgentTask.status == "open"))).scalars().all()) == len(tasks)
    assert (await db.execute(select(Report).where(Report.kind == "director_weekly"))).scalars().first()


async def test_kill_switch_skips_director_but_not_ops(db):
    await activate_kill_switch(db, "test", "test")
    await db.commit()
    d = await AGENTS["director"]().run(db)
    o = await AGENTS["ops"]().run(db)
    assert d.status == "skipped" and o.status == "ok"


async def test_support_agent_answers_and_escalates(db, client):
    h, tid = await register_and_login(client)
    r = await client.post("/api/support/tickets", headers=h, json={"subject": "Rechnung", "body": "Wo finde ich meine Rechnungen und wie kündige ich das Abo?"})
    t1 = r.json()["id"]
    r = await client.post("/api/support/tickets", headers=h, json={"subject": "Problem", "body": "Die Seite zeigt einen Fehler beim Speichern."})
    t2 = r.json()["id"]
    r = await client.post("/api/support/tickets", headers=h, json={"subject": "WhatsApp", "body": "Könnt ihr auch WhatsApp-Nachrichten verarbeiten?"})
    t3 = r.json()["id"]
    from app.services.jobs import run_pending

    await run_pending(db)
    a = (await client.get(f"/api/support/tickets/{t1}", headers=h)).json()
    assert a["status"] == "answered" and a["category"] == "billing" and "Stripe" in a["messages"][-1]["body"]
    b = (await client.get(f"/api/support/tickets/{t2}", headers=h)).json()
    assert b["status"] == "escalated" and b["category"] == "bug"
    c = (await client.get(f"/api/support/tickets/{t3}", headers=h)).json()
    assert c["messages"][-1]["meta"]["feature_exists"] is False and "noch nicht verfügbar" in c["messages"][-1]["body"]
    assert any(m["to"] == "chef@beispiel-elektro.test" and "Re: Rechnung" in m["subject"] for m in ConsoleProvider.sent)


async def test_marketing_agent_drafts_checks_and_requests_approval(db):
    run = await AGENTS["marketing"]().run(db, trigger="test")
    await db.commit()
    assert run.status == "ok", run.error
    piece = (await db.execute(select(ContentPiece))).scalar_one()
    assert piece.status == "draft" and piece.body_markdown.startswith("#")
    # Mock-Artikel ist kurz → Qualitätsprüfung schlägt fehl, bleibt Entwurf, keine Freigabe angefragt
    await AGENTS["marketing"]().run(db, trigger="test")
    await db.commit()
    await db.refresh(piece)
    assert piece.checks["passed"] is False and piece.status == "draft"
    # Lange, saubere Fassung → review + Freigabe
    piece.body_markdown = piece.body_markdown + ("\n## Mehr\n\n" + "Sachlicher Text. " * 200) + "\n## Noch mehr\n\nText."
    await db.commit()
    await AGENTS["marketing"]().run(db, trigger="test")
    await db.commit()
    await db.refresh(piece)
    assert piece.status == "review"
    appr = (await db.execute(select(Approval).where(Approval.kind == "publish_content"))).scalar_one()
    assert appr.status == "pending"
    # Unbelegte Erfolgsversprechen scheitern an der Faktenprüfung
    from app.agents.marketing import run_checks

    piece.body_markdown += "\nGarantiert 50 % mehr Umsatz!"
    assert run_checks(piece)["facts"] is False


async def test_content_publish_requires_approval_and_autonomy_flag(db, client):
    h, _ = await register_and_login(client, email="op@x.test", company="Op")
    await make_operator(db, "op@x.test")
    piece = ContentPiece(slug="test-artikel", title="Test", body_markdown="# T\n\n## A\n\n" + "Wort " * 400 + "\n## B\n\nx", status="draft")
    db.add(piece)
    await db.commit()
    await AGENTS["marketing"]().run(db)
    await db.commit()
    appr = (await db.execute(select(Approval).where(Approval.status == "pending"))).scalar_one()
    r = await client.post(f"/api/admin/approvals/{appr.id}/decide", headers=h, json={"decision": "approved"})
    assert r.status_code == 200
    from app.services.jobs import run_pending

    await run_pending(db)
    await db.refresh(piece)
    assert piece.status == "approved"
    piece.scheduled_for = utcnow() - timedelta(minutes=1)
    await db.commit()
    await AGENTS["marketing"]().run(db)
    await db.commit()
    await db.refresh(piece)
    assert piece.status == "approved"  # auto_publish_content ist standardmäßig aus
    await client.patch("/api/admin/settings/autonomy", headers=h, json={"auto_publish_content": True})
    await AGENTS["marketing"]().run(db)
    await db.commit()
    await db.refresh(piece)
    assert piece.status == "published" and piece.published_at


async def test_sales_agent_only_consented_sources(db):
    db.add(
        Lead(
            company="Elektro Nord",
            contact_name="Jan",
            email="jan@nord.test",
            trade="elektro",
            size="2-5",
            source="website_form",
            consent_basis="Anfrage",
            consent_at=utcnow(),
            status="new",
            next_action_at=utcnow(),
        )
    )
    db.add(Lead(company="Gescrapt GmbH", email="x@scrape.test", trade="elektro", size="2-5", source="scraped", status="new"))
    await db.commit()
    run = await AGENTS["sales"]().run(db, trigger="test")
    await db.commit()
    assert run.status == "ok", run.error
    leads = {ld.company: ld for ld in (await db.execute(select(Lead))).scalars().all()}
    assert leads["Elektro Nord"].fit_score >= 60 and leads["Elektro Nord"].status == "qualified"
    assert leads["Gescrapt GmbH"].fit_score is None and leads["Gescrapt GmbH"].status == "new"
    assert any(m["to"] == "jan@nord.test" for m in ConsoleProvider.sent)
    assert not any(m["to"] == "x@scrape.test" for m in ConsoleProvider.sent)


async def test_finance_snapshot_and_agent(db, client):
    h, tid = await register_and_login(client)
    await activate_plan(db, tid, "pro")
    db.add(AIUsage(created_at=utcnow(), tenant_id=tid, provider="mock", model="mock", task="t", cost_microcents=5_000_000, success=True))
    await db.commit()
    from app.agents.finance import finance_snapshot

    snap = await finance_snapshot(db)
    assert snap["mrr_cents"] == 24900 and snap["by_plan"] == {"pro": 1} and snap["ai_cost_30d_cents"] == 5.0
    run = await AGENTS["finance"]().run(db)
    await db.commit()
    assert run.status == "ok" and (await db.execute(select(Report).where(Report.kind == "finance_weekly"))).scalars().first()
    await make_operator(db, "chef@beispiel-elektro.test")
    fin = (await client.get("/api/admin/finance", headers=h)).json()
    assert fin["arr_cents"] == 24900 * 12


async def test_product_dev_triages_errors(db):
    db.add(
        ErrorReport(
            fingerprint="a" * 64, source="job:process_inquiry", message="Schema ungültig", occurrences=4, last_seen_at=utcnow(), context={"category": "invalid_output"}
        )
    )
    await db.commit()
    import app.agents.product_dev as pd

    pd.run_tests = lambda args=None, timeout=600: {"exit_code": 0, "output": "ok", "passed": True}  # keine rekursive Testsuite
    run = await AGENTS["product_dev"]().run(db)
    await db.commit()
    assert run.status == "ok", run.error
    e = (await db.execute(select(ErrorReport))).scalar_one()
    assert e.status == "triaged" and e.reproducible is True and "Schema" in e.analysis["suggestion"]
    assert (await db.execute(select(AgentTask).where(AgentTask.assigned_to == "product_dev"))).scalars().first()


async def test_agent_runtime_limit(db):
    import asyncio

    from app.agents.base import BaseAgent

    class Slow(BaseAgent):
        name = "slow"
        max_runtime_seconds = 0.2

        async def execute(self, ctx):
            await asyncio.sleep(2)
            return "nie"

    run = await Slow().run(db)
    assert run.status == "failed" and "Laufzeitlimit" in run.error
    assert (await db.execute(select(AgentRun).where(AgentRun.agent == "slow"))).scalar_one()

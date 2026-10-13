"""KI-Geschäftsleitung: liest Kennzahlen, Agentenläufe, Fehler, Chancen; priorisiert Aufgaben; lernt aus Ergebnissen.
Entscheidet nur innerhalb des Budgets und legt alles Kritische zur Freigabe vor."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select

from app.agents.base import AgentContext, BaseAgent
from app.core.db import utcnow
from app.models.billing import AIUsage, Subscription
from app.models.core import Tenant
from app.models.crm import Inquiry, Report
from app.models.ops import AgentRun, AgentTask, ContentPiece, ErrorReport, Lead, SupportTicket
from app.services.ai_tasks import AnalysisFindings
from app.services.llm import LLMError, llm_is_live, run_structured


class DirectorAgent(BaseAgent):
    name = "director"
    max_runtime_seconds = 120
    max_cost_cents_per_run = 15

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        now = utcnow()
        week = now - timedelta(days=7)

        # --- Kennzahlen sammeln (echte Daten) ---
        tenants = (await db.execute(select(func.count(Tenant.id)).where(Tenant.deleted_at.is_(None), Tenant.is_demo.is_(False)))).scalar_one()
        new_tenants = (await db.execute(select(func.count(Tenant.id)).where(Tenant.created_at >= week, Tenant.is_demo.is_(False)))).scalar_one()
        subs = dict((await db.execute(select(Subscription.status, func.count(Subscription.id)).group_by(Subscription.status))).all())
        trials_expiring = (
            await db.execute(
                select(func.count(Subscription.id)).where(
                    Subscription.status == "trialing", Subscription.trial_ends_at <= now + timedelta(days=3), Subscription.trial_ends_at >= now
                )
            )
        ).scalar_one()
        inq_week = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.created_at >= week))).scalar_one()
        needs_human = (await db.execute(select(func.count(Inquiry.id)).where(Inquiry.needs_human.is_(True), Inquiry.status == "needs_review"))).scalar_one()
        ai_cost = int((await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at >= week))).scalar_one()) / 1e6
        errors = (await db.execute(select(func.count(ErrorReport.id)).where(ErrorReport.status == "open"))).scalar_one()
        escalated = (await db.execute(select(func.count(SupportTicket.id)).where(SupportTicket.status == "escalated"))).scalar_one()
        leads_new = (await db.execute(select(func.count(Lead.id)).where(Lead.status == "new"))).scalar_one()
        content_review = (await db.execute(select(func.count(ContentPiece.id)).where(ContentPiece.status == "review"))).scalar_one()
        failed_runs = (await db.execute(select(AgentRun).where(AgentRun.started_at >= week, AgentRun.status == "failed"))).scalars().all()
        done_tasks = (
            (await db.execute(select(AgentTask).where(AgentTask.status.in_(["done", "failed"]), AgentTask.updated_at >= week, AgentTask.lesson.is_(None))))
            .scalars()
            .all()
        )

        metrics = {
            "tenants": tenants,
            "new_tenants_7d": new_tenants,
            "subscriptions": subs,
            "trials_expiring_3d": trials_expiring,
            "inquiries_7d": inq_week,
            "inquiries_needing_human": needs_human,
            "ai_cost_cents_7d": round(ai_cost, 2),
            "errors_open": errors,
            "support_escalated": escalated,
            "leads_new": leads_new,
            "content_in_review": content_review,
            "agent_failures_7d": len(failed_runs),
        }
        ctx.find("Kennzahlen: " + ", ".join(f"{k}={v}" for k, v in metrics.items()))

        # --- Regelbasierte Priorisierung (immer, auch ohne LLM) ---
        if errors >= 3:
            await ctx.propose_task(assigned_to="product_dev", title=f"{errors} offene Fehlerberichte auswerten", priority=2, dedupe_key="director:errors")
        for r in failed_runs[:3]:
            await ctx.propose_task(
                assigned_to="product_dev",
                title=f"Agentenlauf {r.agent} fehlgeschlagen",
                description=(r.error or "")[:1000],
                priority=3,
                dedupe_key=f"director:agentfail:{r.agent}",
            )
        if escalated:
            await ctx.propose_task(assigned_to="human", title=f"{escalated} eskalierte Supportfälle beantworten", priority=1, dedupe_key="director:support")
        if trials_expiring:
            await ctx.propose_task(
                assigned_to="sales", title=f"{trials_expiring} Testphasen laufen in 3 Tagen ab – Erinnerung & Angebot", priority=2, dedupe_key="director:trials"
            )
        if leads_new:
            await ctx.propose_task(assigned_to="sales", title=f"{leads_new} neue Interessenten qualifizieren", priority=2, dedupe_key="director:leads")
        if content_review:
            await ctx.propose_task(assigned_to="human", title=f"{content_review} Inhalte warten auf Freigabe", priority=4, dedupe_key="director:content")
        if tenants and needs_human > tenants * 3:
            await ctx.propose_task(
                assigned_to="product_dev", title="Viele Anfragen landen bei 'menschliche Prüfung' – Klassifizierung prüfen", priority=3, dedupe_key="director:needs_human"
            )
        if tenants == 0 or new_tenants == 0:
            await ctx.propose_task(
                assigned_to="marketing", title="Kein Neukundenzuwachs diese Woche – Inhalte für Zielbranchen erstellen", priority=3, dedupe_key="director:growth"
            )

        # --- Lernen: Abgeschlossene Aufgaben mit Lehre versehen ---
        for t in done_tasks[:10]:
            res = t.result or {}
            t.lesson = (
                f"Erledigt von {t.assigned_to}: {str(res.get('summary', ''))[:200]}"
                if t.status == "done"
                else f"Fehlgeschlagen: {str(res.get('error', 'unbekannt'))[:200]} – Aufgabe kleiner schneiden oder manuell prüfen."
            )
        if done_tasks:
            ctx.act(f"{min(len(done_tasks), 10)} Aufgaben mit Lernnotiz versehen.")

        # --- Optionale LLM-Analyse für Wachstumschancen ---
        analysis_text = ""
        if llm_is_live():
            try:
                res = await run_structured(
                    db,
                    task="analysis",
                    schema=AnalysisFindings,
                    instructions="Du bist die Geschäftsleitung eines kleinen SaaS (KI-Automatisierung für Handwerksbetriebe). Analysiere die Kennzahlen, nenne maximal 3 Befunde, 3 konkrete Vorschläge (ohne neue Kosten) und eine Priorisierung. Keine Erfindungen.",
                    data=str(metrics),
                    tenant_id=None,
                    max_output_tokens=600,
                )
                for f in res.findings[:3]:
                    ctx.find("Analyse: " + f)
                for p in res.proposals[:3]:
                    await ctx.propose_task(assigned_to="human", title=f"Vorschlag: {p[:200]}", priority=5, dedupe_key=f"director:proposal:{p[:60]}")
                analysis_text = res.summary
            except LLMError as e:
                ctx.find(f"LLM-Analyse übersprungen: {e}")

        report_lines = ["Wochenlage Clairify", ""] + [f"- {k}: {v}" for k, v in metrics.items()] + ["", "Aufgaben:"] + [f"- {a}" for a in ctx.actions]
        if analysis_text:
            report_lines += ["", "Einschätzung:", analysis_text]
        db.add(Report(created_at=now, tenant_id=None, kind="director_weekly", period_start=week, period_end=now, data=metrics, summary_text="\n".join(report_lines)))
        return f"{tenants} Betriebe, {inq_week} Anfragen/7d, {len(ctx.actions)} Aufgaben erzeugt."

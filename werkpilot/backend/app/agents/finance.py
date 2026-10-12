"""KI-Finanzverwaltung: MRR, Abos, Kündigungen, Zahlungsausfälle, API-Kosten je Anbieter, ungewöhnliche Ausgaben,
Liquidität und Prognose aus tatsächlichen Daten. Keine Buchungen, keine Überweisungen, keine Steuererklärungen."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select

from app.agents.base import AgentContext, BaseAgent
from app.core.db import utcnow
from app.models.billing import AIUsage, ExpenseEntry, Invoice, Plan, Subscription
from app.models.crm import Report
from app.models.ops import OutboundEmail


async def finance_snapshot(db) -> dict:
    now = utcnow()
    month = now - timedelta(days=30)
    prev = now - timedelta(days=60)
    active = (await db.execute(select(Subscription, Plan).join(Plan, Plan.id == Subscription.plan_id).where(Subscription.status.in_(["active", "past_due"])))).all()
    mrr = sum(p.price_cents_monthly for _, p in active)
    by_plan: dict[str, int] = {}
    for _, p in active:
        by_plan[p.code] = by_plan.get(p.code, 0) + 1
    trialing = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "trialing"))).scalar_one()
    past_due = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "past_due"))).scalar_one()
    canceled_30 = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "canceled", Subscription.canceled_at >= month))).scalar_one()
    canceled_prev = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "canceled", Subscription.canceled_at.between(prev, month)))).scalar_one()
    paid_30 = int((await db.execute(select(func.coalesce(func.sum(Invoice.amount_cents), 0)).where(Invoice.status == "paid", Invoice.paid_at >= month))).scalar_one())
    failed_30 = (await db.execute(select(func.count(Invoice.id)).where(Invoice.status.in_(["open", "uncollectible"]), Invoice.created_at >= month))).scalar_one()
    ai_by_provider = (await db.execute(select(AIUsage.provider, func.sum(AIUsage.cost_microcents), func.count(AIUsage.id)).where(AIUsage.created_at >= month).group_by(AIUsage.provider))).all()
    ai_prev = int((await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at.between(prev, month)))).scalar_one()) / 1e6
    ai_cost = sum(int(c or 0) for _, c, _ in ai_by_provider) / 1e6
    mails = (await db.execute(select(func.count(OutboundEmail.id)).where(OutboundEmail.created_at >= month, OutboundEmail.status == "sent"))).scalar_one()
    this_month = now.strftime("%Y-%m")
    expenses = (await db.execute(select(ExpenseEntry.category, func.sum(ExpenseEntry.amount_cents)).where(ExpenseEntry.period_month == this_month).group_by(ExpenseEntry.category))).all()
    expense_total = sum(int(a or 0) for _, a in expenses)
    churn_rate = round(canceled_30 / max(len(active) + canceled_30, 1) * 100, 1)
    anomalies = []
    if ai_prev and ai_cost > ai_prev * 2 and ai_cost > 100:
        anomalies.append(f"KI-Kosten haben sich verdoppelt ({ai_prev:.0f} → {ai_cost:.0f} ct).")
    if canceled_prev and canceled_30 > canceled_prev * 2:
        anomalies.append(f"Kündigungen verdoppelt ({canceled_prev} → {canceled_30}).")
    if failed_30:
        anomalies.append(f"{failed_30} fehlgeschlagene/offene Zahlungen.")
    # Prognose: lineare Fortschreibung aus den letzten 30 Tagen (nur, wenn Daten vorhanden)
    net_new = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "active", Subscription.created_at >= month))).scalar_one() - canceled_30
    avg_price = round(mrr / len(active)) if active else 0
    forecast = [{"month": i, "mrr_cents": max(0, mrr + net_new * avg_price * i)} for i in range(1, 4)] if active else []
    return {
        "mrr_cents": mrr, "arr_cents": mrr * 12, "active_subscriptions": len(active), "by_plan": by_plan, "trialing": trialing, "past_due": past_due,
        "canceled_30d": canceled_30, "churn_rate_30d_pct": churn_rate, "revenue_paid_30d_cents": paid_30, "failed_payments_30d": failed_30,
        "ai_cost_30d_cents": round(ai_cost, 2), "ai_by_provider": [{"provider": p, "cost_cents": round(int(c or 0) / 1e6, 2), "calls": n} for p, c, n in ai_by_provider],
        "emails_sent_30d": mails, "expenses_month_cents": expense_total, "expenses_by_category": {k: int(v or 0) for k, v in expenses},
        "cash_margin_month_cents": mrr - expense_total - round(ai_cost), "anomalies": anomalies, "forecast": forecast,
        "note": "Prognose = lineare Fortschreibung der letzten 30 Tage; keine Garantie. Steuern und Stripe-Gebühren (~1,5-2,9 % + 0,25 €) sind nicht abgezogen.",
    }


class FinanceAgent(BaseAgent):
    name = "finance"
    max_runtime_seconds = 60
    max_cost_cents_per_run = 0

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        snap = await finance_snapshot(db)
        now = utcnow()
        # KI-Kosten automatisch als Ausgabe buchen (Schätzung), damit die Liquiditätsübersicht vollständig ist
        this_month = now.strftime("%Y-%m")
        auto = (await db.execute(select(ExpenseEntry).where(ExpenseEntry.period_month == this_month, ExpenseEntry.source == "auto", ExpenseEntry.category == "llm"))).scalar_one_or_none()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        ai_month = int((await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at >= month_start))).scalar_one()) / 1e6
        if auto is None:
            db.add(ExpenseEntry(category="llm", vendor="KI-Anbieter (geschätzt)", amount_cents=round(ai_month), period_month=this_month, source="auto", note="Automatisch aus ai_usage"))
        else:
            auto.amount_cents = round(ai_month)
        for a in snap["anomalies"]:
            ctx.find("Anomalie: " + a)
        if snap["past_due"]:
            await ctx.propose_task(assigned_to="human", title=f"{snap['past_due']} Abos mit Zahlungsrückstand prüfen", priority=2, dedupe_key="finance:past_due")
        if snap["anomalies"]:
            await ctx.propose_task(assigned_to="human", title="Finanz-Anomalien prüfen", description="\n".join(snap["anomalies"]), priority=2, dedupe_key="finance:anomalies")
        ctx.find(f"MRR {snap['mrr_cents'] / 100:.2f} €, {snap['active_subscriptions']} aktive Abos, Churn {snap['churn_rate_30d_pct']} %, KI-Kosten {snap['ai_cost_30d_cents']:.0f} ct/30d.")
        lines = ["Finanzbericht", f"MRR: {snap['mrr_cents'] / 100:.2f} € ({snap['active_subscriptions']} Abos: {snap['by_plan']})",
                 f"Umsatz bezahlt 30d: {snap['revenue_paid_30d_cents'] / 100:.2f} €", f"Kündigungen 30d: {snap['canceled_30d']} (Churn {snap['churn_rate_30d_pct']} %)",
                 f"Zahlungsrückstände: {snap['past_due']}, fehlgeschlagene Zahlungen: {snap['failed_payments_30d']}",
                 f"KI-Kosten 30d: {snap['ai_cost_30d_cents']:.2f} ct", f"Ausgaben Monat: {snap['expenses_month_cents'] / 100:.2f} €",
                 f"Marge Monat (geschätzt): {snap['cash_margin_month_cents'] / 100:.2f} €", "Anomalien: " + ("; ".join(snap["anomalies"]) or "keine")]
        db.add(Report(created_at=now, tenant_id=None, kind="finance_weekly", period_start=now - timedelta(days=30), period_end=now, data=snap, summary_text="\n".join(lines)))
        return f"MRR {snap['mrr_cents'] / 100:.0f} €, {len(snap['anomalies'])} Anomalien."

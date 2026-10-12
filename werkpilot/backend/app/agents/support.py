"""KI-Kundenservice: beantwortet aus der Wissensbasis, unterscheidet bestätigte Funktionen von Wünschen,
eskaliert Unklares an Menschen. Keine Versprechen."""

from __future__ import annotations

from sqlalchemy import select

from app.agents.base import AgentContext, BaseAgent
from app.core.db import utcnow
from app.models.ops import KnowledgeArticle, SupportMessage, SupportTicket
from app.services.ai_tasks import SupportAnswer
from app.services.email import send_email
from app.services.llm import LLMError, get_provider, run_structured, wrap_untrusted

CONFIRMED_FEATURES = [
    "Anfragen per E-Mail-Weiterleitung und Website-Formular erfassen", "KI-Klassifizierung und Priorisierung",
    "Antwortentwürfe mit Freigabe", "Rückfragen nach fehlenden Angaben", "Terminvorschläge aus Geschäftszeiten (Google Kalender optional)",
    "Erinnerung an offene Angebote", "Wochenbericht", "Kundenübersicht", "Datenexport und Kontolöschung", "Stripe-Abrechnung mit Kundenportal",
]
NOT_AVAILABLE = ["WhatsApp", "Telefon/Anrufannahme", "Microsoft 365 Kalender", "Rechnungsstellung an Endkunden", "Preisberechnung"]


async def answer_ticket(db, ticket_id: str) -> SupportTicket | None:
    t = await db.get(SupportTicket, ticket_id)
    if not t:
        return None
    msgs = (await db.execute(select(SupportMessage).where(SupportMessage.ticket_id == t.id).order_by(SupportMessage.created_at))).scalars().all()
    if msgs and msgs[-1].author_type != "user":
        return t
    user_text = "\n\n".join(m.body for m in msgs if m.author_type == "user")[-6000:]
    articles = (await db.execute(select(KnowledgeArticle).where(KnowledgeArticle.is_published.is_(True)).limit(30))).scalars().all()
    kb = "\n".join(f"- {a.title}: {a.body[:300]}" for a in articles)
    data = ("Bestätigte Funktionen:\n- " + "\n- ".join(CONFIRMED_FEATURES) + "\n\nNICHT verfügbar:\n- " + "\n- ".join(NOT_AVAILABLE)
            + "\n\nWissensbasis:\n" + kb + "\n\nBetreff: " + t.subject + "\nKundenanfrage:\n" + wrap_untrusted(user_text))
    try:
        res = await run_structured(db, task="support_answer", schema=SupportAnswer, tenant_id=None,
                                   instructions="Beantworte die Supportanfrage nur mit Wissen aus der Liste bestätigter Funktionen und der Wissensbasis. Wenn die Funktion nicht existiert, sage das klar und verspreche nichts. Bei Fehlern, Abrechnungsproblemen über das Portal hinaus oder Unsicherheit: escalate=true.",
                                   data=data, max_output_tokens=500)
    except LLMError as e:
        t.status = "escalated"
        t.escalated_at = utcnow()
        t.escalation_reason = f"KI nicht verfügbar: {e}"
        await db.flush()
        return t
    t.category = res.category if res.category in ("howto", "bug", "billing", "feature", "account", "other") else "other"
    t.priority = res.priority if res.priority in ("low", "normal", "high") else "normal"
    body = res.answer.strip()
    if get_provider().name == "mock":
        body += "\n\n(Automatische Antwort – ein Mensch prüft den Vorgang zusätzlich.)"
    db.add(SupportMessage(ticket_id=t.id, author_type="agent", body=body, meta={"confident": res.confident, "feature_exists": res.feature_exists, "provider": get_provider().name}))
    if res.escalate or not res.confident:
        t.status = "escalated"
        t.escalated_at = utcnow()
        t.escalation_reason = res.escalate_reason or "Agent nicht sicher."
    else:
        t.status = "answered"
    if t.email:
        await send_email(db, to=t.email, subject=f"Re: {t.subject}", text=body + ("\n\nIhr Fall wurde zusätzlich an unser Team weitergeleitet." if t.status == "escalated" else ""), kind="transactional", tenant_id=t.tenant_id)
    await db.flush()
    return t


class SupportAgent(BaseAgent):
    name = "support"
    max_runtime_seconds = 120
    max_cost_cents_per_run = 10

    async def execute(self, ctx: AgentContext) -> str:
        rows = (await ctx.db.execute(select(SupportTicket).where(SupportTicket.status == "open").order_by(SupportTicket.created_at).limit(20))).scalars().all()
        n = 0
        for t in rows:
            res = await answer_ticket(ctx.db, t.id)
            if res:
                n += 1
                ctx.act(f"Ticket {t.id[:8]}: {res.status}")
        return f"{n} offene Tickets bearbeitet."

"""KI-Vertrieb: qualifiziert ausschließlich Interessenten aus zulässigen Quellen (Website-Anfrage, Demo-Registrierung,
Empfehlung, Partner). Kein Kaltversand, kein Scraping. Bereitet sachliche Unterlagen vor, bietet Demo-Termine an,
dokumentiert im CRM und wertet Abschlüsse/Kündigungen aus."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select

from app.agents.base import AgentContext, BaseAgent
from app.core.config import get_settings
from app.core.db import utcnow
from app.models.billing import Subscription
from app.models.core import Membership, Tenant, User
from app.models.ops import Lead
from app.services.ai_tasks import LeadFit
from app.services.email import send_email
from app.services.llm import LLMError, run_structured

ALLOWED_SOURCES = {"website_form", "demo", "referral", "partner", "inbound_email", "trial_signup"}


async def qualify_lead(db, lead_id: str) -> Lead | None:
    lead = await db.get(Lead, lead_id)
    if not lead or lead.source not in ALLOWED_SOURCES or not lead.consent_basis:
        return lead
    try:
        res = await run_structured(db, task="lead_fit", schema=LeadFit, tenant_id=None,
                                   instructions="Bewerte die Eignung dieses Interessenten für eine KI-Anfrageautomatisierung (Zielgruppe: kleine deutsche Handwerksbetriebe mit 2-15 Mitarbeitenden). Sachlich, ohne Annahmen über nicht genannte Daten.",
                                   data=f"Firma: {lead.company}\nGewerk: {lead.trade}\nGröße: {lead.size}\nRegion: {lead.region}\nQuelle: {lead.source}\nNachricht: {(lead.notes or '')[:1000]}", max_output_tokens=300)
        lead.fit_score = res.fit_score
        lead.fit_reasons = res.reasons
        lead.status = "qualified" if res.fit_score >= 50 else lead.status
        lead.next_action = res.suggested_next_action
    except LLMError:
        lead.fit_score = None
    await db.flush()
    return lead


class SalesAgent(BaseAgent):
    name = "sales"
    max_runtime_seconds = 120
    max_cost_cents_per_run = 10

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        s = get_settings()
        now = utcnow()
        # 1. Neue Leads qualifizieren
        new = (await db.execute(select(Lead).where(Lead.status == "new").limit(20))).scalars().all()
        for lead in new:
            await qualify_lead(db, lead.id)
            ctx.act(f"Lead qualifiziert: {lead.company} → {lead.fit_score}")
        # 2. Qualifizierte Leads: sachliche Info-Mail mit Demo-Angebot (Antwort auf deren eigene Anfrage = zulässig)
        qualified = (await db.execute(select(Lead).where(Lead.status == "qualified", Lead.email.is_not(None), Lead.next_action_at <= now))).scalars().all()
        for lead in qualified:
            text = (f"Moin {lead.contact_name or ''},\n\ndanke für Ihre Anfrage zu WerkPilot AI für {lead.company}.\n\n"
                    "Kurz, was WerkPilot macht: Kundenanfragen aus E-Mail und Website landen an einem Ort, werden nach Dringlichkeit sortiert, "
                    "und Sie bekommen fertige Antwortentwürfe – inklusive Rückfragen nach fehlenden Angaben und Terminvorschlägen. "
                    "Offene Angebote werden nicht vergessen.\n\n"
                    f"Sie können es 14 Tage kostenlos testen: {s.frontend_url}/registrieren\n"
                    f"Oder wir zeigen es Ihnen in 20 Minuten: Antworten Sie einfach mit zwei Terminvorschlägen.\n\n"
                    "Preise und Umfang stehen transparent unter " + f"{s.frontend_url}/preise.\n\nFreundliche Grüße\nWerkPilot AI")
            await send_email(db, to=lead.email, subject=f"WerkPilot AI für {lead.company}: Demo oder Test?", text=text, kind="transactional")
            lead.status = "demo_scheduled" if False else "qualified"
            lead.next_action = "Auf Antwort warten (Demo/Testphase)"
            lead.next_action_at = now + timedelta(days=7)
            lead.notes = (lead.notes or "") + f"\n[{now.date()}] Info-Mail mit Demo-Angebot gesendet (Antwort auf Anfrage)."
            ctx.act(f"Info-Mail an {lead.company}")
        # 3. Testphasen, die bald ablaufen: Erinnerung (bestehende Nutzerbeziehung)
        expiring = (await db.execute(select(Subscription).where(Subscription.status == "trialing", Subscription.trial_ends_at.between(now, now + timedelta(days=3))))).scalars().all()
        reminded = 0
        for sub in expiring:
            tenant = await db.get(Tenant, sub.tenant_id)
            if not tenant or tenant.settings.get("trial_reminder_sent"):
                continue
            owner = (await db.execute(select(User).join(Membership, Membership.user_id == User.id).where(Membership.tenant_id == tenant.id, Membership.role == "owner"))).scalars().first()
            if owner:
                await send_email(db, to=owner.email, subject="Ihre WerkPilot-Testphase endet bald",
                                 text=f"Moin {owner.full_name},\n\nIhre Testphase für {tenant.name} endet am {sub.trial_ends_at.strftime('%d.%m.%Y')}. "
                                      f"Wenn WerkPilot Ihnen Arbeit abnimmt, wählen Sie hier einen Tarif: {s.frontend_url}/app/abonnement\n\n"
                                      "Fragen? Antworten Sie einfach auf diese Mail.\n\nWerkPilot AI", kind="transactional", tenant_id=tenant.id)
                tenant.settings = {**tenant.settings, "trial_reminder_sent": True}
                reminded += 1
        # 4. Abschlüsse/Kündigungen auswerten
        month = now - timedelta(days=30)
        won = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "active", Subscription.created_at >= month))).scalar_one()
        churned = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "canceled", Subscription.canceled_at >= month))).scalar_one()
        trial_total = (await db.execute(select(func.count(Subscription.id)).where(Subscription.created_at >= month))).scalar_one()
        conv = round(won / trial_total * 100, 1) if trial_total else None
        ctx.find(f"30 Tage: {trial_total} Registrierungen, {won} zahlende Abschlüsse (Konversion {conv if conv is not None else '–'} %), {churned} Kündigungen.")
        if churned and won and churned > won:
            await ctx.propose_task(assigned_to="human", title="Mehr Kündigungen als Abschlüsse – Kündigungsgründe erfragen", priority=2, dedupe_key="sales:churn")
        return f"{len(new)} qualifiziert, {len(qualified)} Info-Mails, {reminded} Testphasen-Erinnerungen."

"""Betriebsmanager: Systemprüfung, Jobs, Fehler, Backups, Kosten, Not-Aus bei Anomalien, Tagesbericht.
Läuft auch bei aktivem Not-Aus (Überwachung darf nie ausfallen)."""

from __future__ import annotations

import os
from datetime import timedelta

from sqlalchemy import func, select, text

from app.agents.base import AgentContext, BaseAgent
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.system import KEY_AI_BUDGET, activate_kill_switch, get_setting, kill_switch_active
from app.models.billing import AIUsage, Subscription
from app.models.core import Tenant
from app.models.crm import Report
from app.models.ops import ErrorReport, Job, OutboundEmail, SupportTicket
from app.services.email import send_email


async def notify_ops(db, subject: str, text_body: str) -> None:
    s = get_settings()
    if s.ops_alert_email:
        await send_email(db, to=s.ops_alert_email, subject=f"[Clairify] {subject}", text=text_body, kind="alert")
    if s.ops_alert_webhook_url:
        import httpx

        try:
            async with httpx.AsyncClient(timeout=10) as c:
                await c.post(s.ops_alert_webhook_url, json={"text": f"*{subject}*\n{text_body}"})
        except Exception:  # noqa: BLE001
            pass


class OpsAgent(BaseAgent):
    name = "ops"
    max_runtime_seconds = 90
    max_cost_cents_per_run = 0  # rein regelbasiert, kein LLM
    runs_during_kill_switch = True

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        s = get_settings()
        now = utcnow()
        day = now - timedelta(days=1)
        critical: list[str] = []

        # 1. Datenbank
        try:
            await db.execute(text("SELECT 1"))
        except Exception as e:  # noqa: BLE001
            critical.append(f"Datenbank nicht erreichbar: {e}")

        # 2. Jobs: hängende Läufe zurücksetzen, tote Jobs zählen
        stuck = (await db.execute(select(Job).where(Job.status == "running", Job.started_at < now - timedelta(minutes=30)))).scalars().all()
        for j in stuck:
            j.status = "queued"
            j.run_at = now
            ctx.act(f"Hängenden Job zurückgesetzt: {j.type} ({j.id[:8]})")
        dead = (await db.execute(select(func.count(Job.id)).where(Job.status == "dead", Job.updated_at >= day))).scalar_one()
        queued_old = (await db.execute(select(func.count(Job.id)).where(Job.status == "queued", Job.run_at < now - timedelta(minutes=15)))).scalar_one()
        if dead:
            ctx.find(f"{dead} Jobs in den letzten 24h endgültig fehlgeschlagen (Fehlerwarteschlange).")
        if queued_old > 20:
            critical.append(f"{queued_old} Jobs seit >15 Min. nicht abgearbeitet – läuft der Worker?")

        # 3. Fehlerhäufungen
        err_rows = (
            (await db.execute(select(ErrorReport).where(ErrorReport.status == "open", ErrorReport.last_seen_at >= day).order_by(ErrorReport.occurrences.desc()).limit(5)))
            .scalars()
            .all()
        )
        for e in err_rows:
            ctx.find(f"Fehler ({e.occurrences}x): {e.source}: {e.message[:120]}")
            if e.occurrences >= 20:
                critical.append(f"Wiederholter Fehler ({e.occurrences}x): {e.message[:100]}")

        # 4. KI-Kosten
        cfg = await get_setting(db, KEY_AI_BUDGET)
        budget = cfg.get("global_daily_cents") or s.ai_global_daily_budget_cents
        spent = int((await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at >= day))).scalar_one()) / 1_000_000
        failures = (await db.execute(select(func.count(AIUsage.id)).where(AIUsage.created_at >= day, AIUsage.success.is_(False)))).scalar_one()
        calls = (await db.execute(select(func.count(AIUsage.id)).where(AIUsage.created_at >= day))).scalar_one()
        ctx.find(f"KI-Kosten 24h: {spent:.2f} ct von {budget} ct Budget, {calls} Aufrufe, {failures} Fehler.")
        if spent >= budget * 0.9:
            ctx.find("KI-Budget zu 90 % ausgeschöpft – nichtkritische KI-Aufgaben werden durch das Budget gestoppt.")
        if spent >= budget * 1.5:
            critical.append(f"KI-Kosten {spent:.0f} ct überschreiten das Tagesbudget deutlich – Not-Aus ausgelöst.")
            if not await kill_switch_active(db):
                await activate_kill_switch(db, "Automatisch: KI-Kosten 150 % über Tagesbudget", "agent:ops")
                ctx.act("Not-Aus aktiviert (Kostenanomalie).")
        if calls >= 10 and failures / max(calls, 1) > 0.5:
            critical.append(f"KI-Fehlerquote {failures}/{calls} – Anbieter prüfen.")

        # 5. E-Mail-Versand
        mail_failed = (await db.execute(select(func.count(OutboundEmail.id)).where(OutboundEmail.created_at >= day, OutboundEmail.status == "failed"))).scalar_one()
        mail_sim = (await db.execute(select(func.count(OutboundEmail.id)).where(OutboundEmail.created_at >= day, OutboundEmail.status == "simulated"))).scalar_one()
        if mail_failed:
            ctx.find(f"{mail_failed} E-Mails konnten nicht zugestellt werden.")
            if mail_failed >= 5:
                critical.append(f"{mail_failed} E-Mail-Zustellfehler in 24h.")
        if mail_sim and s.is_production:
            critical.append(f"{mail_sim} E-Mails nur simuliert – in Produktion ist kein Versandanbieter konfiguriert!")

        # 6. Backups
        backup_dir = s.backup_dir
        latest = None
        if os.path.isdir(backup_dir):
            files = sorted((os.path.join(backup_dir, f) for f in os.listdir(backup_dir) if f.endswith((".sql", ".sql.gz", ".dump"))), key=os.path.getmtime, reverse=True)
            latest = files[0] if files else None
        if latest:
            age_h = (now.timestamp() - os.path.getmtime(latest)) / 3600
            ctx.find(f"Letztes Backup: {os.path.basename(latest)} ({age_h:.0f} h alt).")
            if age_h > 36:
                critical.append(f"Letztes Backup ist {age_h:.0f} h alt.")
        else:
            ctx.find("Kein Backup im Backup-Verzeichnis gefunden." + (" In Produktion kritisch." if s.is_production else ""))
            if s.is_production:
                critical.append("Kein Backup vorhanden.")

        # 7. Zahlungen / Abos
        past_due = (await db.execute(select(func.count(Subscription.id)).where(Subscription.status == "past_due"))).scalar_one()
        if past_due:
            ctx.find(f"{past_due} Abonnements mit Zahlungsrückstand.")
        escalated = (await db.execute(select(func.count(SupportTicket.id)).where(SupportTicket.status == "escalated"))).scalar_one()
        if escalated:
            ctx.find(f"{escalated} eskalierte Supportfälle warten auf einen Menschen.")

        # 8. Produktionskonfiguration
        for p in s.validate_for_production():
            ctx.find(f"Konfiguration: {p}")

        tenants = (await db.execute(select(func.count(Tenant.id)).where(Tenant.deleted_at.is_(None), Tenant.is_demo.is_(False)))).scalar_one()
        for c in critical:
            ctx.find("KRITISCH: " + c)
        summary = f"Systemprüfung: {tenants} Betriebe, {calls} KI-Aufrufe/24h ({spent:.2f} ct), {dead} tote Jobs, {len(critical)} kritische Punkte."
        if critical:
            await notify_ops(db, "Kritische Betriebsmeldung", "\n".join(f"- {c}" for c in critical))
            ctx.act("Betreiber benachrichtigt.")
        # Tagesbericht speichern (einmal pro Tag)
        last = (
            await db.execute(select(Report).where(Report.tenant_id.is_(None), Report.kind == "daily_ops").order_by(Report.created_at.desc()).limit(1))
        ).scalar_one_or_none()
        if last is None or last.created_at < now - timedelta(hours=23):
            text_report = "\n".join([summary, "", "Befunde:"] + [f"- {f}" for f in ctx.findings] + ["", "Kritisch:"] + [f"- {c}" for c in critical] or ["- keine"])
            db.add(
                Report(
                    created_at=now,
                    tenant_id=None,
                    kind="daily_ops",
                    period_start=day,
                    period_end=now,
                    data={
                        "tenants": tenants,
                        "ai_calls": calls,
                        "ai_cost_cents": round(spent, 2),
                        "ai_failures": failures,
                        "dead_jobs": dead,
                        "mail_failed": mail_failed,
                        "past_due": past_due,
                        "critical": critical,
                    },
                    summary_text=text_report,
                )
            )
            if s.ops_alert_email:
                await send_email(db, to=s.ops_alert_email, subject="Täglicher Betriebsbericht Clairify", text=text_report, kind="report")
            ctx.act("Tagesbericht erstellt.")
        return summary

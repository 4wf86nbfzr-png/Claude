"""Basis für alle Agenten: begrenzte Laufzeit, Budget, Protokollierung, Freigabe-Mechanik."""

from __future__ import annotations

import asyncio
import traceback
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.logging import get_logger
from app.core.system import KEY_AUTONOMY, get_setting, kill_switch_active
from app.models.billing import AIUsage
from app.models.ops import AgentRun, AgentTask, Approval

log = get_logger("agents")


class AgentContext:
    def __init__(self, db: AsyncSession, run: AgentRun):
        self.db = db
        self.run = run
        self.findings: list[str] = []
        self.actions: list[str] = []

    def find(self, text: str) -> None:
        self.findings.append(text)

    def act(self, text: str) -> None:
        self.actions.append(text)

    async def propose_task(self, *, assigned_to: str, title: str, description: str = "", priority: int = 5,
                           requires_approval: bool = False, dedupe_key: str | None = None, tenant_id: str | None = None) -> AgentTask | None:
        key = dedupe_key or f"{assigned_to}:{title[:120]}"
        existing = (await self.db.execute(select(AgentTask).where(AgentTask.dedupe_key == key, AgentTask.status.in_(["open", "in_progress"])))).scalar_one_or_none()
        if existing:
            return None
        t = AgentTask(created_by=self.run.agent, assigned_to=assigned_to, title=title[:300], description=description,
                      priority=priority, requires_approval=requires_approval, dedupe_key=key, tenant_id=tenant_id)
        self.db.add(t)
        await self.db.flush()
        self.act(f"Aufgabe für {assigned_to}: {title}")
        return t

    async def request_approval(self, *, kind: str, title: str, description: str, payload: dict | None = None,
                               risk_level: str = "medium", tenant_id: str | None = None) -> Approval | None:
        existing = (await self.db.execute(select(Approval).where(Approval.kind == kind, Approval.title == title[:300], Approval.status == "pending"))).scalar_one_or_none()
        if existing:
            return None
        a = Approval(tenant_id=tenant_id, requested_by=self.run.agent, kind=kind, title=title[:300], description=description,
                     payload=payload or {}, risk_level=risk_level)
        self.db.add(a)
        await self.db.flush()
        self.act(f"Freigabe angefragt: {title}")
        await audit(self.db, "approval.requested", actor_type="agent", actor_id=self.run.agent, target_type="approval", target_id=a.id, details={"kind": kind})
        return a


class BaseAgent:
    name = "base"
    max_runtime_seconds = 120
    max_cost_cents_per_run = 10
    runs_during_kill_switch = False  # nur Sicherheit/Monitoring (ops) läuft weiter

    async def execute(self, ctx: AgentContext) -> str:
        """Gibt eine kurze Zusammenfassung zurück. Findings/Actions über ctx."""
        raise NotImplementedError

    async def run(self, db: AsyncSession, trigger: str = "schedule", tenant_id: str | None = None) -> AgentRun:
        s = get_settings()
        run = AgentRun(agent=self.name, trigger=trigger, tenant_id=tenant_id, started_at=utcnow(), status="running")
        db.add(run)
        await db.flush()
        auto = await get_setting(db, KEY_AUTONOMY)
        if not s.autonomy_enabled or not auto.get("agents_enabled", True):
            run.status = "skipped"
            run.summary = "Agenten sind deaktiviert (AUTONOMY_ENABLED / Systemeinstellung)."
            run.finished_at = utcnow()
            await db.flush()
            return run
        if await kill_switch_active(db) and not self.runs_during_kill_switch:
            run.status = "skipped"
            run.summary = "Not-Aus aktiv – Agent übersprungen."
            run.finished_at = utcnow()
            await db.flush()
            return run
        ctx = AgentContext(db, run)
        cost_before = await self._cost_so_far(db, run.started_at)
        try:
            summary = await asyncio.wait_for(self.execute(ctx), timeout=self.max_runtime_seconds)
            run.status = "ok"
            run.summary = summary[:4000]
        except TimeoutError:
            run.status = "failed"
            run.error = f"Laufzeitlimit ({self.max_runtime_seconds}s) überschritten."
            run.summary = "Abgebrochen wegen Laufzeitlimit."
        except Exception as e:  # noqa: BLE001
            run.status = "failed"
            run.error = f"{type(e).__name__}: {str(e)[:500]}\n{traceback.format_exc()[-1500:]}"
            run.summary = f"Fehler: {str(e)[:200]}"
            log.warning("agent.failed", agent=self.name, error=str(e)[:200])
        run.findings = ctx.findings
        run.actions = ctx.actions
        run.cost_microcents = max(0, await self._cost_so_far(db, run.started_at) - cost_before)
        run.finished_at = utcnow()
        if run.cost_microcents > self.max_cost_cents_per_run * 1_000_000:
            run.findings.append(f"WARNUNG: Lauf hat Kostenlimit überschritten ({run.cost_microcents / 1e6:.2f} ct).")
        await audit(db, "agent.run", actor_type="agent", actor_id=self.name, target_type="agent_run", target_id=run.id,
                    details={"status": run.status, "actions": len(ctx.actions), "findings": len(ctx.findings)})
        await db.flush()
        return run

    @staticmethod
    async def _cost_so_far(db: AsyncSession, since) -> int:
        return int((await db.execute(select(func.coalesce(func.sum(AIUsage.cost_microcents), 0)).where(AIUsage.created_at >= since - timedelta(seconds=1)))).scalar_one())

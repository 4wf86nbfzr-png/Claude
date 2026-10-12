"""KI-Produktentwicklung: Fehlerberichte auswerten, Reproduzierbarkeit einschätzen, Tests ausführen,
Vorschläge erzeugen. Code-Änderungen entstehen nur als Vorschlag auf einem separaten Branch und brauchen
Freigabe + bestandene Tests; Auth/Zahlung/Rechte/Datenschutz sind grundsätzlich freigabepflichtig."""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
from pathlib import Path

from sqlalchemy import select

from app.agents.base import AgentContext, BaseAgent
from app.core.db import utcnow
from app.models.ops import AgentTask, ErrorReport

SENSITIVE = re.compile(r"(auth|security|billing|stripe|deps\.py|permission|privacy|retention|migration)", re.I)
BACKEND_DIR = Path(__file__).resolve().parents[2]


def run_tests(args: list[str] | None = None, timeout: int = 600) -> dict:
    """Führt die Testsuite aus (synchron, in Thread). Gibt Ergebnis mit Exit-Code und Kurzausgabe zurück."""
    cmd = [sys.executable, "-m", "pytest", "-q", "-x", "--no-header", "-p", "no:cacheprovider", *(args or [])]
    env = {**os.environ, "DATABASE_URL": os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///./.agent-tests.db"), "ENV": "test"}
    try:
        p = subprocess.run(cmd, cwd=BACKEND_DIR, capture_output=True, text=True, timeout=timeout, env=env)
        out = (p.stdout + p.stderr)[-4000:]
        return {"exit_code": p.returncode, "output": out, "passed": p.returncode == 0}
    except subprocess.TimeoutExpired:
        return {"exit_code": -1, "output": "Timeout", "passed": False}


class ProductDevAgent(BaseAgent):
    name = "product_dev"
    max_runtime_seconds = 900
    max_cost_cents_per_run = 10

    async def execute(self, ctx: AgentContext) -> str:
        db = ctx.db
        # 1. Offene Fehler analysieren
        errors = (await db.execute(select(ErrorReport).where(ErrorReport.status == "open").order_by(ErrorReport.occurrences.desc()).limit(10))).scalars().all()
        for e in errors:
            cat = (e.context or {}).get("category") or "unknown"
            reproducible = e.occurrences >= 3 and cat not in ("transient_network",)
            e.reproducible = reproducible
            e.status = "triaged"
            suggestion = {
                "transient_network": "Vorübergehender Netzwerkfehler – Wiederholung reicht; bei Häufung Anbieterstatus prüfen.",
                "auth_or_config": "Zugangsdaten/Konfiguration prüfen (API-Schlüssel, Webhook-Secret). Keine automatische Behebung möglich.",
                "budget_or_killswitch": "Budget oder Not-Aus hat den Vorgang gestoppt – gewollt. Budget prüfen.",
                "invalid_output": "KI-Antwort entsprach nicht dem Schema – Prompt/Schema prüfen, Beispiel in Tests aufnehmen.",
            }.get(cat, "Ursache unklar – Stacktrace manuell prüfen.")
            e.analysis = {"category": cat, "suggestion": suggestion, "triaged_at": utcnow().isoformat()}
            ctx.find(f"Fehler {e.fingerprint[:8]} ({e.occurrences}x, {cat}): {suggestion}")
            if reproducible and cat in ("invalid_output", "unknown"):
                await ctx.propose_task(assigned_to="product_dev", title=f"Reproduzierbaren Fehler beheben: {e.message[:80]}",
                                       description=f"Fingerprint {e.fingerprint}\n{e.stacktrace or ''}"[:3000], priority=2,
                                       requires_approval=bool(SENSITIVE.search(e.stacktrace or e.message)), dedupe_key=f"fix:{e.fingerprint}")

        # 2. Offene Aufgaben für mich: Tests laufen lassen (Regression/Sicherheit)
        my_tasks = (await db.execute(select(AgentTask).where(AgentTask.assigned_to == "product_dev", AgentTask.status == "open").order_by(AgentTask.priority).limit(3))).scalars().all()
        test_result = None
        if my_tasks or errors:
            test_result = await asyncio.get_running_loop().run_in_executor(None, run_tests)
            ctx.find("Testsuite: " + ("bestanden" if test_result["passed"] else f"FEHLGESCHLAGEN (Exit {test_result['exit_code']})"))
            if not test_result["passed"]:
                ctx.find(test_result["output"][-800:])
                await ctx.request_approval(kind="code_change", title="Testsuite schlägt fehl – manuelle Prüfung nötig",
                                           description=test_result["output"][-2000:], risk_level="high")
        for t in my_tasks:
            if t.requires_approval:
                a = await ctx.request_approval(kind="code_change", title=t.title, description=t.description[:2000], payload={"task_id": t.id}, risk_level="high")
                if a:
                    t.approval_id = a.id
                t.status = "in_progress"
                ctx.act(f"Aufgabe wartet auf Freigabe: {t.title}")
            else:
                # Ohne Freigabe nur Analyse + Vorschlag; keine automatische Codeänderung in diesem Lauf.
                t.result = {"summary": "Analysiert. Vorschlag: siehe Fehleranalyse. Änderung wird als Branch-Vorschlag vorbereitet.",
                            "tests_passed": test_result["passed"] if test_result else None}
                t.status = "done"
                ctx.act(f"Aufgabe analysiert: {t.title}")
        return f"{len(errors)} Fehler triagiert, {len(my_tasks)} Aufgaben bearbeitet" + (f", Tests {'ok' if test_result['passed'] else 'rot'}" if test_result else "")

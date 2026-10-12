"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, PageHeader, Stat, Table } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Overview = { tenants: number; subscriptions: Record<string, number>; jobs: Record<string, number>; dead_jobs: { id: string; type: string; error: string; category: string }[]; errors_open: number; ai_cost_cents_24h: number; ai_failures_24h: number; approvals_pending: number; tickets_escalated: number; leads: Record<string, number>; agent_runs: { id: string; agent: string; status: string; started_at: string; summary: string; cost_cents: number }[] };
type Sys = { settings: { kill_switch: { active: boolean; reason: string | null }; ai_budget: { global_daily_cents: number | null }; autonomy: { agents_enabled: boolean; auto_publish_content: boolean } }; providers: { llm: string; email_live: boolean; stripe: boolean; google_calendar: boolean }; env: string; production_problems: string[]; autonomy_enabled: boolean };

export default function AdminHome() {
  const { data: o, reload } = useApi<Overview>("/api/admin/overview");
  const { data: s, reload: reloadSys } = useApi<Sys>("/api/admin/system");
  const [msg, setMsg] = useState<string | null>(null);
  const { data: reports } = useApi<{ id: string; kind: string; created_at: string; summary_text: string }[]>("/api/admin/reports?kind=daily_ops");
  async function run(fn: () => Promise<unknown>, ok: string) { try { await fn(); setMsg(ok); reload(); reloadSys(); } catch (ex) { setMsg(ex instanceof ApiError ? String(ex.detail) : "Fehler"); } }
  if (!o || !s) return <p className="text-sm text-muted">Lade …</p>;
  const ks = s.settings.kill_switch;
  return (
    <>
      <PageHeader title="Betrieb" lead={`Umgebung: ${s.env} · KI: ${s.providers.llm} · E-Mail: ${s.providers.email_live ? "live" : "simuliert"} · Stripe: ${s.providers.stripe ? "ok" : "fehlt"} · Google: ${s.providers.google_calendar ? "ok" : "fehlt"}`}
        action={<Button variant={ks.active ? "secondary" : "danger"} onClick={() => run(() => api("/api/admin/kill-switch", { method: "POST", json: { active: !ks.active, reason: ks.active ? null : prompt("Grund für Not-Aus?") || "manuell" } }), ks.active ? "Not-Aus aufgehoben." : "Not-Aus aktiv.")}>{ks.active ? "Not-Aus aufheben" : "NOT-AUS"}</Button>} />
      {ks.active && <div className="mb-4"><Alert tone="bad">NOT-AUS AKTIV: {ks.reason}. Nur Überwachung und Sicherheitsjobs laufen; KI-Aufrufe, Agenten und nichtkritische Jobs sind gestoppt.</Alert></div>}
      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      {s.production_problems.length > 0 && <div className="mb-4"><Alert tone="warn"><strong>Vor Produktivstart lösen:</strong><ul className="mt-1 list-disc pl-5">{s.production_problems.map((p) => <li key={p}>{p}</li>)}</ul></Alert></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Betriebe" value={o.tenants} hint={Object.entries(o.subscriptions).map(([k, v]) => `${k}: ${v}`).join(" · ") || "keine Abos"} />
        <Stat label="KI-Kosten 24h" value={`${o.ai_cost_cents_24h} ct`} hint={`${o.ai_failures_24h} Fehler · Budget ${s.settings.ai_budget.global_daily_cents ?? "Standard"} ct`} />
        <Stat label="Freigaben offen" value={o.approvals_pending} hint={`${o.tickets_escalated} eskalierte Tickets`} />
        <Stat label="Fehler offen" value={o.errors_open} hint={Object.entries(o.jobs).map(([k, v]) => `${k}: ${v}`).join(" · ")} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Autonomie">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between"><span>Agenten geplant ausführen</span><Button variant="secondary" onClick={() => run(() => api("/api/admin/settings/autonomy", { method: "PATCH", json: { agents_enabled: !s.settings.autonomy.agents_enabled } }), "Gespeichert.")}>{s.settings.autonomy.agents_enabled ? "an → aus" : "aus → an"}</Button></li>
            <li className="flex items-center justify-between"><span>Inhalte nach Freigabe automatisch veröffentlichen</span><Button variant="secondary" onClick={() => run(() => api("/api/admin/settings/autonomy", { method: "PATCH", json: { auto_publish_content: !s.settings.autonomy.auto_publish_content } }), "Gespeichert.")}>{s.settings.autonomy.auto_publish_content ? "an → aus" : "aus → an"}</Button></li>
            <li className="flex items-center justify-between"><span>Globales KI-Tagesbudget (ct)</span><Button variant="secondary" onClick={() => { const v = prompt("Tagesbudget in Cent", String(s.settings.ai_budget.global_daily_cents ?? 2000)); if (v) run(() => api("/api/admin/settings/ai_budget", { method: "PATCH", json: { global_daily_cents: Number(v) } }), "Budget gesetzt."); }}>{s.settings.ai_budget.global_daily_cents ?? "Standard"}</Button></li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">{["ops", "director", "support", "sales", "marketing", "finance", "product_dev"].map((a) => <Button key={a} variant="ghost" onClick={() => run(() => api(`/api/admin/agents/${a}/run`, { method: "POST" }), `Agent ${a} eingeplant (Worker führt aus).`)}>▶ {a}</Button>)}</div>
        </Card>
        <Card title="Letzte Agentenläufe"><Table head={["Agent", "Status", "Zeit", "Kosten", "Zusammenfassung"]}>{o.agent_runs.map((r) => <tr key={r.id}><td className="py-1 pr-3 font-medium">{r.agent}</td><td className="py-1 pr-3"><Badge tone={r.status === "ok" ? "ok" : r.status === "failed" ? "bad" : "neutral"}>{r.status}</Badge></td><td className="py-1 pr-3 text-xs text-muted">{fmtDate(r.started_at)}</td><td className="py-1 pr-3 text-xs">{r.cost_cents} ct</td><td className="py-1 text-xs text-ink-2">{r.summary}</td></tr>)}</Table></Card>
        <Card title="Fehlerwarteschlange (tote Jobs)">{o.dead_jobs.length === 0 ? <p className="text-sm text-muted">Leer.</p> : <ul className="space-y-1 text-xs">{o.dead_jobs.map((j) => <li key={j.id}><strong>{j.type}</strong> [{j.category}] {j.error} <button className="text-accent underline" onClick={() => run(() => api(`/api/admin/jobs/${j.id}/retry`, { method: "POST" }), "Erneut eingeplant.")}>erneut</button></li>)}</ul>}</Card>
        <Card title="Letzter Tagesbericht">{reports?.[0] ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-sans text-xs text-ink-2">{reports[0].summary_text}</pre> : <p className="text-sm text-muted">Noch keiner – der Ops-Agent erstellt ihn täglich.</p>}</Card>
      </div>
    </>
  );
}

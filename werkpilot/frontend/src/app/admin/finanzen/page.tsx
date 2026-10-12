"use client";

import { Alert, Button, Card, Field, PageHeader, Stat, Table, inputCls } from "@/components/ui";
import { api, fmtEur } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type F = { mrr_cents: number; arr_cents: number; active_subscriptions: number; by_plan: Record<string, number>; trialing: number; past_due: number; canceled_30d: number; churn_rate_30d_pct: number; revenue_paid_30d_cents: number; failed_payments_30d: number; ai_cost_30d_cents: number; ai_by_provider: { provider: string; cost_cents: number; calls: number }[]; emails_sent_30d: number; expenses_month_cents: number; expenses_by_category: Record<string, number>; cash_margin_month_cents: number; anomalies: string[]; forecast: { month: number; mrr_cents: number }[]; note: string };

export default function Finanzen() {
  const { data: f, reload } = useApi<F>("/api/admin/finance");
  if (!f) return <p className="text-sm text-muted">Lade …</p>;
  return (
    <>
      <PageHeader title="Finanzen" lead="Aus Stripe-Webhooks, KI-Verbrauch und erfassten Ausgaben. Keine Buchhaltung, keine Steuer – nur Übersicht." />
      {f.anomalies.length > 0 && <div className="mb-4"><Alert tone="warn">{f.anomalies.join(" · ")}</Alert></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="MRR" value={fmtEur(f.mrr_cents)} hint={`ARR ${fmtEur(f.arr_cents)}`} />
        <Stat label="Aktive Abos" value={f.active_subscriptions} hint={Object.entries(f.by_plan).map(([k, v]) => `${k}: ${v}`).join(" · ") || "–"} />
        <Stat label="Testphasen" value={f.trialing} hint={`${f.past_due} Zahlungsrückstand`} />
        <Stat label="Kündigungen 30d" value={f.canceled_30d} hint={`Churn ${f.churn_rate_30d_pct} %`} />
        <Stat label="Bezahlt 30d" value={fmtEur(f.revenue_paid_30d_cents)} hint={`${f.failed_payments_30d} fehlgeschlagen`} />
        <Stat label="KI-Kosten 30d" value={`${f.ai_cost_30d_cents.toFixed(2)} ct`} hint={f.ai_by_provider.map((p) => `${p.provider}: ${p.calls} Aufrufe`).join(" · ")} />
        <Stat label="Ausgaben Monat" value={fmtEur(f.expenses_month_cents)} hint={Object.entries(f.expenses_by_category).map(([k, v]) => `${k}: ${fmtEur(v)}`).join(" · ")} />
        <Stat label="Marge Monat (geschätzt)" value={fmtEur(f.cash_margin_month_cents)} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Prognose (lineare Fortschreibung)">{f.forecast.length === 0 ? <p className="text-sm text-muted">Keine aktiven Abos – keine Prognose.</p> : <Table head={["Monat", "MRR"]}>{f.forecast.map((p) => <tr key={p.month}><td className="py-1 pr-3">+{p.month}</td><td className="py-1">{fmtEur(p.mrr_cents)}</td></tr>)}</Table>}<p className="mt-2 text-xs text-muted">{f.note}</p></Card>
        <Card title="Ausgabe erfassen"><form className="grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const d = new FormData(e.currentTarget); await api("/api/admin/expenses", { method: "POST", json: { category: d.get("category"), vendor: d.get("vendor"), amount_cents: Math.round(Number(d.get("amount")) * 100), period_month: d.get("month"), note: d.get("note") || null } }); (e.target as HTMLFormElement).reset(); reload(); }}><Field label="Kategorie"><select name="category" className={inputCls}><option value="hosting">Hosting</option><option value="llm">KI</option><option value="email">E-Mail</option><option value="payments">Zahlungen</option><option value="tools">Tools</option><option value="other">Sonstiges</option></select></Field><Field label="Anbieter"><input name="vendor" className={inputCls} required /></Field><Field label="Betrag €"><input name="amount" type="number" step="0.01" className={inputCls} required /></Field><Field label="Monat"><input name="month" className={inputCls} defaultValue={new Date().toISOString().slice(0, 7)} pattern="\d{4}-\d{2}" required /></Field><div className="sm:col-span-2"><Field label="Notiz"><input name="note" className={inputCls} /></Field></div><div><Button type="submit">Speichern</Button></div></form></Card>
      </div>
    </>
  );
}

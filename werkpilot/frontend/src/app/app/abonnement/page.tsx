"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, PageHeader, Table } from "@/components/ui";
import { api, ApiError, fmtDate, fmtEur } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Status = { entitlements: { status: string; plan: string | null; plan_name?: string; features: string[]; limits: Record<string, number>; active: boolean; trial_ends_at?: string; current_period_end?: string; cancel_at_period_end?: boolean }; stripe_configured: boolean; has_customer: boolean; invoices: { id: string; amount_cents: number; status: string; paid_at: string | null; url: string | null }[] };
type Plan = { code: string; name: string; description: string; price_cents_monthly: number; features: string[]; limits: Record<string, number>; checkout_available: boolean };

export default function Abonnement() {
  const { data: st, loading } = useApi<Status>("/api/billing/status");
  const { data: plans } = useApi<Plan[]>("/api/billing/plans");
  const [err, setErr] = useState<string | null>(null);
  async function go(path: string, json?: unknown) {
    setErr(null);
    try { const r = await api<{ url: string }>(path, { method: "POST", json }); window.location.href = r.url; }
    catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Fehler"); }
  }
  if (loading || !st) return <p className="text-sm text-muted">Lade …</p>;
  const e = st.entitlements;
  const label: Record<string, string> = { trialing: "Testphase", trial_expired: "Testphase abgelaufen", active: "Aktiv", past_due: "Zahlung offen", canceled: "Gekündigt", incomplete: "Unvollständig", none: "Kein Abo" };
  return (
    <>
      <PageHeader title="Abonnement" lead="Tarif, Rechnungen und Kündigung. Die Zahlung läuft über Stripe; wir speichern keine Kartendaten." />
      {err && <div className="mb-4"><Alert tone="bad">{err}</Alert></div>}
      {!st.stripe_configured && <div className="mb-4"><Alert tone="warn">Der Zahlungsanbieter ist noch nicht konfiguriert. Buchungen sind erst möglich, wenn der Betreiber Stripe eingerichtet hat.</Alert></div>}
      <Card className="mb-6" title="Aktueller Stand" action={st.has_customer && st.stripe_configured ? <Button variant="secondary" onClick={() => go("/api/billing/portal")}>Abo verwalten</Button> : null}>
        <div className="flex flex-wrap items-center gap-3 text-sm"><Badge tone={e.active ? "ok" : "warn"}>{label[e.status] ?? e.status}</Badge>{e.plan_name && <span>Tarif: <strong>{e.plan_name}</strong></span>}{e.trial_ends_at && <span>Testphase endet {fmtDate(e.trial_ends_at)}</span>}{e.current_period_end && <span>Abrechnungszeitraum bis {fmtDate(e.current_period_end)}</span>}{e.cancel_at_period_end && <Badge tone="warn">Kündigung vorgemerkt</Badge>}</div>
        {e.features.length > 0 && <p className="mt-2 text-xs text-muted">Freigeschaltet: {e.features.join(", ")}</p>}
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {plans?.map((p) => (
          <Card key={p.code} title={p.name} action={<span className="font-semibold">{fmtEur(p.price_cents_monthly)}/Monat</span>}>
            <p className="text-sm text-ink-2">{p.description}</p>
            <ul className="mt-3 text-xs text-muted"><li>{p.limits.inquiries_per_month} Anfragen/Monat</li><li>{p.limits.users} Nutzer</li><li>KI-Budget {p.limits.ai_budget_cents_month} ct/Monat</li></ul>
            <Button className="mt-4 w-full" disabled={!p.checkout_available || e.plan === p.code} onClick={() => go("/api/billing/checkout", { plan: p.code })}>{e.plan === p.code ? "Aktueller Tarif" : p.checkout_available ? "Buchen" : "Bald verfügbar"}</Button>
          </Card>
        ))}
      </div>
      <Card className="mt-6" title="Rechnungen">{st.invoices.length === 0 ? <p className="text-sm text-muted">Noch keine Rechnungen.</p> : <Table head={["Datum", "Betrag", "Status", ""]}>{st.invoices.map((i) => <tr key={i.id}><td className="py-2 pr-3">{fmtDate(i.paid_at)}</td><td className="py-2 pr-3">{fmtEur(i.amount_cents)}</td><td className="py-2 pr-3"><Badge tone={i.status === "paid" ? "ok" : "warn"}>{i.status}</Badge></td><td className="py-2">{i.url && <a className="text-accent underline" href={i.url} target="_blank" rel="noreferrer">PDF</a>}</td></tr>)}</Table>}</Card>
    </>
  );
}

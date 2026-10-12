"use client";

import Link from "next/link";
import { Alert, Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Dash = {
  inquiries: { open: number; needs_review: number; urgent: number; new_7d: number }; replies_7d: number; quotes_open: number; appointments_upcoming: number; customers: number;
  avg_first_response_hours_30d: number | null; ai: { calls_30d: number; cost_cents_30d: number; budget_cents_month: number | null; calls_cap: number | null; provider_live: boolean }; email_live: boolean;
  failed_jobs: number; support_open: number; integrations: { type: string; status: string }[]; entitlements: { status: string; plan: string | null; trial_ends_at?: string; active: boolean };
  automation: { auto_reply_enabled: boolean; weekly_report: boolean }; recent_events: { at: string; action: string; actor: string; details: Record<string, unknown> }[];
};

export default function Overview() {
  const { data: d, error, loading } = useApi<Dash>("/api/tenant/dashboard");
  if (loading) return <p className="text-sm text-muted">Lade …</p>;
  if (error || !d) return <Alert tone="bad">{error}</Alert>;
  const ent = d.entitlements;
  return (
    <>
      <PageHeader title="Übersicht" lead="Echte Zahlen aus Ihrem Betrieb. Keine Hochrechnungen." />
      {ent.status === "trialing" && <div className="mb-4"><Alert>Testphase bis {fmtDate(ent.trial_ends_at)}. <Link href="/app/abonnement" className="underline">Tarif wählen</Link>, damit es danach weitergeht.</Alert></div>}
      {ent.status === "trial_expired" && <div className="mb-4"><Alert tone="warn">Die Testphase ist abgelaufen. Anfragen werden weiter gespeichert, aber nicht mehr per KI verarbeitet. <Link href="/app/abonnement" className="underline">Tarif wählen</Link>.</Alert></div>}
      {ent.status === "past_due" && <div className="mb-4"><Alert tone="bad">Die letzte Zahlung ist fehlgeschlagen. Bitte Zahlungsmittel im <Link href="/app/abonnement" className="underline">Kundenportal</Link> aktualisieren.</Alert></div>}
      {!d.ai.provider_live && <div className="mb-4"><Alert tone="warn">Hinweis: Es ist kein KI-Anbieter konfiguriert. Entwürfe entstehen regelbasiert und sind einfacher als mit aktiver KI.</Alert></div>}
      {!d.email_live && <div className="mb-4"><Alert tone="warn">E-Mail-Versand ist nicht konfiguriert: Freigegebene Antworten werden protokolliert, aber nicht zugestellt (Status „simuliert“).</Alert></div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Offene Vorgänge" value={d.inquiries.open} hint={`${d.inquiries.urgent} dringend`} />
        <Stat label="Entwürfe zur Prüfung" value={<Link href="/app/entwuerfe" className="underline decoration-accent/40">{d.inquiries.needs_review}</Link>} />
        <Stat label="Neue Anfragen (7 Tage)" value={d.inquiries.new_7d} hint={`${d.replies_7d} Antworten gesendet`} />
        <Stat label="Ø Zeit bis Antwort (30 Tage)" value={d.avg_first_response_hours_30d != null ? `${d.avg_first_response_hours_30d} h` : "–"} />
        <Stat label="Offene Angebote" value={d.quotes_open} />
        <Stat label="Bestätigte Termine" value={d.appointments_upcoming} />
        <Stat label="Kunden" value={d.customers} />
        <Stat label="KI-Aufrufe (30 Tage)" value={d.ai.calls_30d} hint={d.ai.calls_cap ? `von ${d.ai.calls_cap} in der Testphase` : d.ai.budget_cents_month ? `Budget ${d.ai.budget_cents_month} ct/Monat, genutzt ${d.ai.cost_cents_30d} ct` : undefined} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Automatisierung & Integrationen">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span>Automatische Eingangsbestätigung</span><Badge tone={d.automation.auto_reply_enabled ? "ok" : "neutral"}>{d.automation.auto_reply_enabled ? "aktiv" : "aus"}</Badge></li>
            <li className="flex justify-between"><span>Wochenbericht</span><Badge tone={d.automation.weekly_report ? "ok" : "neutral"}>{d.automation.weekly_report ? "aktiv" : "aus"}</Badge></li>
            {d.integrations.map((i) => <li key={i.type} className="flex justify-between"><span>{i.type}</span><Badge tone={i.status === "connected" ? "ok" : i.status === "error" ? "bad" : "neutral"}>{i.status}</Badge></li>)}
            <li className="flex justify-between"><span>Fehlgeschlagene Aufgaben</span><Badge tone={d.failed_jobs ? "bad" : "ok"}>{d.failed_jobs}</Badge></li>
            <li className="flex justify-between"><span>Offene Supportfälle</span><Badge tone={d.support_open ? "warn" : "ok"}>{d.support_open}</Badge></li>
          </ul>
        </Card>
        <Card title="Letzte Ereignisse">
          {d.recent_events.length === 0 ? <Empty>Noch nichts passiert. Legen Sie eine erste Anfrage an.</Empty> : (
            <ul className="space-y-2 text-sm">{d.recent_events.map((e, i) => <li key={i} className="flex justify-between gap-3"><span className="truncate">{e.action} <span className="text-muted">({e.actor})</span></span><span className="shrink-0 text-xs text-muted">{fmtDate(e.at)}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}

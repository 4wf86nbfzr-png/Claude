"use client";

import { Badge, Button, Card, Empty, PageHeader, Table } from "@/components/ui";
import { api, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type E = { id: string; source: string; message: string; occurrences: number; last_seen_at: string; status: string; reproducible: boolean | null; analysis: { suggestion?: string } };
type J = { id: string; type: string; tenant_id: string | null; attempts: number; error: string | null; category: string | null; run_at: string };

export default function Fehler() {
  const { data: errors, reload } = useApi<E[]>("/api/admin/errors?status=open");
  const { data: triaged } = useApi<E[]>("/api/admin/errors?status=triaged");
  const { data: jobs, reload: reloadJobs } = useApi<J[]>("/api/admin/jobs?status=dead");
  const all = [...(errors ?? []), ...(triaged ?? [])];
  return (
    <>
      <PageHeader title="Fehler & Jobs" lead="Gesammelte Fehler mit Häufigkeit und Einschätzung des Produkt-Agenten. Tote Jobs können erneut eingeplant werden." />
      <Card className="mb-4" title="Fehlerberichte">{all.length === 0 ? <Empty>Keine offenen Fehler.</Empty> : <Table head={["Quelle", "Meldung", "Anzahl", "Zuletzt", "Status", "Einschätzung", ""]}>{all.map((e) => <tr key={e.id}><td className="py-2 pr-3 text-xs">{e.source}</td><td className="max-w-md py-2 pr-3 text-xs">{e.message}</td><td className="py-2 pr-3">{e.occurrences}</td><td className="py-2 pr-3 text-xs text-muted">{fmtDate(e.last_seen_at)}</td><td className="py-2 pr-3"><Badge tone={e.status === "open" ? "bad" : "warn"}>{e.status}{e.reproducible ? " · reproduzierbar" : ""}</Badge></td><td className="py-2 pr-3 text-xs text-ink-2">{e.analysis?.suggestion}</td><td className="py-2 text-xs"><button className="mr-2 text-ok underline" onClick={async () => { await api(`/api/admin/errors/${e.id}`, { method: "PATCH", json: { status: "fixed" } }); reload(); }}>behoben</button><button className="text-muted underline" onClick={async () => { await api(`/api/admin/errors/${e.id}`, { method: "PATCH", json: { status: "ignored" } }); reload(); }}>ignorieren</button></td></tr>)}</Table>}</Card>
      <Card title="Tote Jobs">{!jobs?.length ? <Empty>Fehlerwarteschlange leer.</Empty> : <Table head={["Typ", "Versuche", "Kategorie", "Fehler", ""]}>{jobs.map((j) => <tr key={j.id}><td className="py-2 pr-3 font-medium">{j.type}</td><td className="py-2 pr-3">{j.attempts}</td><td className="py-2 pr-3 text-xs">{j.category}</td><td className="max-w-md py-2 pr-3 text-xs text-bad">{j.error}</td><td className="py-2"><Button variant="secondary" onClick={async () => { await api(`/api/admin/jobs/${j.id}/retry`, { method: "POST" }); reloadJobs(); }}>Erneut</Button></td></tr>)}</Table>}</Card>
    </>
  );
}

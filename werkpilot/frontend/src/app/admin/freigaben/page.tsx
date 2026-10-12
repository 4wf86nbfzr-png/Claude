"use client";

import { Badge, Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type A = { id: string; kind: string; title: string; description: string; payload: Record<string, unknown>; risk_level: string; requested_by: string; created_at: string };

export default function Freigaben() {
  const { data, reload } = useApi<A[]>("/api/admin/approvals?status=pending");
  return (
    <>
      <PageHeader title="Freigaben" lead="Alles, was Agenten nicht allein entscheiden dürfen: Veröffentlichungen, Code-Änderungen, Budgetfragen." />
      {!data?.length ? <Empty>Nichts offen.</Empty> : <div className="space-y-4">{data.map((a) => <Card key={a.id} title={a.title} action={<Badge tone={a.risk_level === "high" ? "bad" : a.risk_level === "medium" ? "warn" : "ok"}>Risiko {a.risk_level}</Badge>}><p className="text-xs text-muted">{a.kind} · von {a.requested_by} · {fmtDate(a.created_at)}</p><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap font-sans text-sm text-ink-2">{a.description}</pre><div className="mt-3 flex gap-2"><Button onClick={async () => { await api(`/api/admin/approvals/${a.id}/decide`, { method: "POST", json: { decision: "approved" } }); reload(); }}>Freigeben</Button><Button variant="danger" onClick={async () => { await api(`/api/admin/approvals/${a.id}/decide`, { method: "POST", json: { decision: "rejected", note: prompt("Grund?") } }); reload(); }}>Ablehnen</Button></div></Card>)}</div>}
    </>
  );
}

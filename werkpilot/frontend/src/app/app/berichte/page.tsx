"use client";

import { Button, Card, Empty, PageHeader } from "@/components/ui";
import { api, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type R = { id: string; kind: string; created_at: string; summary_text: string; data: Record<string, unknown> };

export default function Berichte() {
  const { data, loading, reload } = useApi<R[]>("/api/tenant/reports");
  return (
    <>
      <PageHeader title="Berichte" lead="Wochenberichte über Anfragen, Reaktionszeiten und offene Vorgänge. Gehen freitags auch per E-Mail raus." action={<Button onClick={async () => { await api("/api/tenant/reports/weekly", { method: "POST" }); reload(); }}>Bericht jetzt erstellen</Button>} />
      {loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Noch kein Bericht. Der erste kommt automatisch nach der ersten Woche.</Empty> : (
        <div className="space-y-4">{data.map((r) => <Card key={r.id} title={`${r.kind === "weekly_customer" ? "Wochenbericht" : r.kind} · ${fmtDate(r.created_at)}`}><pre className="whitespace-pre-wrap font-sans text-sm text-ink-2">{r.summary_text}</pre></Card>)}</div>
      )}
    </>
  );
}

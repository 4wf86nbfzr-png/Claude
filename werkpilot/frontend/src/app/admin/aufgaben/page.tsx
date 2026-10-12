"use client";

import { Badge, Card, Empty, PageHeader, Table } from "@/components/ui";
import { fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type T = { id: string; title: string; description: string; assigned_to: string; created_by: string; priority: number; status: string; requires_approval: boolean; lesson: string | null; created_at: string };

export default function Aufgaben() {
  const { data } = useApi<T[]>("/api/admin/tasks");
  return (
    <>
      <PageHeader title="Aufgaben der Agenten" lead="Von der Geschäftsleitung priorisiert (1 = dringend). Erledigte Aufgaben bekommen eine Lernnotiz." />
      <Card>{!data?.length ? <Empty>Keine Aufgaben.</Empty> : <Table head={["Prio", "Aufgabe", "An", "Von", "Status", "Lehre", "Erstellt"]}>{data.map((t) => <tr key={t.id}><td className="py-2 pr-3">{t.priority}</td><td className="py-2 pr-3"><div className="font-medium">{t.title}</div>{t.description && <div className="max-w-md truncate text-xs text-muted">{t.description}</div>}</td><td className="py-2 pr-3">{t.assigned_to}</td><td className="py-2 pr-3 text-muted">{t.created_by}</td><td className="py-2 pr-3"><Badge tone={t.status === "done" ? "ok" : t.status === "failed" ? "bad" : t.requires_approval ? "warn" : "neutral"}>{t.status}{t.requires_approval ? " (Freigabe)" : ""}</Badge></td><td className="py-2 pr-3 text-xs text-ink-2">{t.lesson}</td><td className="py-2 text-xs text-muted">{fmtDate(t.created_at)}</td></tr>)}</Table>}</Card>
    </>
  );
}

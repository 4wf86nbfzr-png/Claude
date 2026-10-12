"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, PageHeader, inputCls } from "@/components/ui";
import { api, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type T = { id: string; tenant_id: string | null; subject: string; category: string | null; priority: string; status: string; escalation_reason: string | null; created_at: string };

export default function AdminSupport() {
  const [status, setStatus] = useState("escalated");
  const { data, reload } = useApi<T[]>(`/api/admin/tickets?status=${status}`);
  const [reply, setReply] = useState<Record<string, string>>({});
  return (
    <>
      <PageHeader title="Support (eskaliert)" lead="Fälle, die der Support-Agent nicht sicher beantworten konnte. Ihre Antwort geht per E-Mail an den Kunden." action={<select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>{["escalated", "open", "answered", "closed"].map((s) => <option key={s}>{s}</option>)}</select>} />
      {!data?.length ? <Empty>Nichts offen.</Empty> : <div className="space-y-3">{data.map((t) => <Card key={t.id} title={t.subject} action={<span className="flex gap-2"><Badge>{t.category ?? "–"}</Badge><Badge tone={t.priority === "high" ? "bad" : "neutral"}>{t.priority}</Badge></span>}><p className="text-xs text-muted">{fmtDate(t.created_at)} · Betrieb {t.tenant_id?.slice(0, 8)} · {t.escalation_reason}</p><div className="mt-2 flex gap-2"><textarea className={inputCls} placeholder="Antwort an den Kunden" value={reply[t.id] ?? ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} /><Button onClick={async () => { await api(`/api/admin/tickets/${t.id}/reply`, { method: "POST", json: { body: reply[t.id], status: "answered" } }); reload(); }}>Senden</Button></div></Card>)}</div>}
    </>
  );
}

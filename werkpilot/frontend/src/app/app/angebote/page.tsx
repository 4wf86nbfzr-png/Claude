"use client";

import { useState } from "react";
import { Badge, Card, Empty, PageHeader, Table, inputCls } from "@/components/ui";
import { api, fmtDay, fmtEur } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Q = { id: string; title: string; amount_cents: number | null; status: string; sent_at: string | null; followup_count: number; next_followup_at: string | null; inquiry_id: string | null };

export default function Angebote() {
  const [status, setStatus] = useState("open");
  const { data, loading, reload } = useApi<Q[]>(`/api/quotes?status=${status}`);
  return (
    <>
      <PageHeader title="Angebote" lead="Gestellte Angebote im Blick. Clairify erinnert Sie und legt Nachfass-Entwürfe an – Preise tragen nur Sie ein." action={<select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Offen</option><option value="accepted">Angenommen</option><option value="declined">Abgelehnt</option><option value="expired">Abgelaufen</option></select>} />
      <Card>{loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Keine Angebote mit diesem Status. Angebote tragen Sie in der jeweiligen Anfrage ein.</Empty> : (
        <Table head={["Gestellt", "Titel", "Betrag", "Nachgefasst", "Nächste Erinnerung", "Status", ""]}>{data.map((q) => <tr key={q.id}><td className="py-2 pr-3">{fmtDay(q.sent_at)}</td><td className="py-2 pr-3 font-medium">{q.inquiry_id ? <a className="text-accent" href={`/app/anfragen/${q.inquiry_id}`}>{q.title}</a> : q.title}</td><td className="py-2 pr-3">{fmtEur(q.amount_cents)}</td><td className="py-2 pr-3">{q.followup_count}×</td><td className="py-2 pr-3 text-muted">{fmtDay(q.next_followup_at)}</td><td className="py-2 pr-3"><Badge tone={q.status === "accepted" ? "ok" : q.status === "open" ? "accent" : "neutral"}>{q.status}</Badge></td><td className="py-2 text-xs">{q.status === "open" && <><button className="mr-2 text-ok underline" onClick={async () => { await api(`/api/quotes/${q.id}`, { method: "PATCH", json: { status: "accepted" } }); reload(); }}>angenommen</button><button className="text-bad underline" onClick={async () => { await api(`/api/quotes/${q.id}`, { method: "PATCH", json: { status: "declined" } }); reload(); }}>abgelehnt</button></>}</td></tr>)}</Table>)}</Card>
    </>
  );
}

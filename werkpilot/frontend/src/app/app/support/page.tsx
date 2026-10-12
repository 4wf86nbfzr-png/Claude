"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Field, PageHeader, inputCls } from "@/components/ui";
import { api, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type T = { id: string; subject: string; category: string | null; priority: string; status: string; created_at: string };
type Detail = { id: string; subject: string; status: string; messages: { id: string; author_type: string; body: string; created_at: string }[] };

export default function Support() {
  const { data, loading, reload } = useApi<T[]>("/api/support/tickets");
  const [open, setOpen] = useState<string | null>(null);
  const { data: det, reload: reloadDet } = useApi<Detail>(open ? `/api/support/tickets/${open}` : null);
  const [reply, setReply] = useState("");
  async function create(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await api("/api/support/tickets", { method: "POST", json: { subject: f.get("subject"), body: f.get("body") } }); (e.target as HTMLFormElement).reset(); reload(); }
  return (
    <>
      <PageHeader title="Support" lead="Häufige Fragen beantwortet unser Assistent sofort; alles Unklare landet bei einem Menschen. Antworten kommen auch per E-Mail." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>{loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Keine Supportfälle.</Empty> : <ul className="divide-y divide-line">{data.map((t) => <li key={t.id} className="flex cursor-pointer items-center justify-between py-2 text-sm" onClick={() => setOpen(t.id)}><span className="font-medium text-accent">{t.subject}</span><span className="flex gap-2"><Badge>{t.category ?? "–"}</Badge><Badge tone={t.status === "escalated" ? "warn" : t.status === "answered" ? "ok" : "neutral"}>{t.status}</Badge><span className="text-xs text-muted">{fmtDate(t.created_at)}</span></span></li>)}</ul>}</Card>
          {det && (
            <Card title={det.subject}>
              <ul className="space-y-2">{det.messages.map((m) => <li key={m.id} className={`rounded-xl p-3 text-sm ${m.author_type === "user" ? "bg-sand" : "bg-accent-soft/40"}`}><div className="mb-1 text-xs text-muted">{m.author_type === "user" ? "Sie" : m.author_type === "agent" ? "Assistent" : "WerkPilot-Team"} · {fmtDate(m.created_at)}</div><pre className="whitespace-pre-wrap font-sans">{m.body}</pre></li>)}</ul>
              {det.status !== "closed" && <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); await api(`/api/support/tickets/${det.id}/reply`, { method: "POST", json: { body: reply } }); setReply(""); reloadDet(); reload(); }}><input className={inputCls} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Antwort" required /><Button type="submit" variant="secondary">Senden</Button><Button type="button" variant="ghost" onClick={async () => { await api(`/api/support/tickets/${det.id}/close`, { method: "POST" }); setOpen(null); reload(); }}>Schließen</Button></form>}
            </Card>
          )}
        </div>
        <Card title="Neuer Supportfall"><form onSubmit={create} className="space-y-3"><Field label="Betreff"><input name="subject" className={inputCls} required minLength={3} /></Field><Field label="Beschreibung"><textarea name="body" className={`${inputCls} min-h-32`} required minLength={5} /></Field><Button type="submit" className="w-full">Absenden</Button></form></Card>
      </div>
    </>
  );
}

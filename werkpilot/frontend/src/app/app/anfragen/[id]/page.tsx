"use client";

import { use, useState } from "react";
import { Alert, Badge, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";
import { catLabel, prioLabel, prioTone, statusLabel, useApi } from "@/lib/use-api";

type Detail = {
  id: string; subject: string; body: string; sender_name: string; sender_email: string | null; sender_phone: string | null; status: string; category: string | null; priority: string; confidence: number | null; summary: string | null; missing_info: string[]; needs_human: boolean; needs_human_reason: string | null; created_at: string; ai_provider: string | null;
  customer: { id: string; name: string; email: string | null; phone: string | null; address: string | null } | null;
  messages: { id: string; direction: string; sender: string; recipient: string | null; subject: string; body: string; delivery_status: string | null; created_at: string }[];
  drafts: { id: string; kind: string; subject: string; body: string; status: string; review_flags: string[]; proposed_slots: { label: string }[]; confidence: number | null }[];
  appointments: { id: string; title: string; starts_at: string; ends_at: string; status: string }[];
  quotes: { id: string; title: string; status: string; amount_cents: number | null; followup_count: number }[];
};

export default function InquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: d, error, loading, reload } = useApi<Detail>(`/api/inquiries/${id}`);
  const [edit, setEdit] = useState<{ subject: string; body: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [note, setNote] = useState("");
  async function run(fn: () => Promise<unknown>, ok: string) {
    try { await fn(); setMsg({ tone: "ok", text: ok }); reload(); } catch (ex) { setMsg({ tone: "bad", text: ex instanceof ApiError ? String(ex.detail) : "Fehler" }); }
  }
  if (loading) return <p className="text-sm text-muted">Lade …</p>;
  if (error || !d) return <Alert tone="bad">{error}</Alert>;
  const pending = d.drafts.find((x) => x.status === "pending");
  return (
    <>
      <PageHeader title={d.subject || "(ohne Betreff)"} lead={<span>{fmtDate(d.created_at)} · {d.sender_name} {d.sender_email && `· ${d.sender_email}`} {d.sender_phone && `· ${d.sender_phone}`}</span>}
        action={<select className={inputCls} value={d.status} onChange={(e) => run(() => api(`/api/inquiries/${d.id}/status`, { method: "PATCH", json: { status: e.target.value } }), "Status geändert.")}>{Object.entries(statusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>} />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Einordnung" action={<Button variant="ghost" onClick={() => run(() => api(`/api/inquiries/${d.id}/reprocess`, { method: "POST" }), "Neu verarbeitet.")}>Neu verarbeiten</Button>}>
            <div className="flex flex-wrap gap-2">
              {d.category && <Badge tone="accent">{catLabel[d.category] ?? d.category}</Badge>}
              <Badge tone={prioTone[d.priority]}>{prioLabel[d.priority]}</Badge>
              {d.confidence != null && <Badge>Sicherheit {Math.round(d.confidence * 100)} %</Badge>}
              {d.ai_provider && <Badge>{d.ai_provider === "mock" ? "regelbasiert" : `KI: ${d.ai_provider}`}</Badge>}
              {d.needs_human && <Badge tone="warn">Mensch prüfen: {d.needs_human_reason}</Badge>}
            </div>
            {d.summary && <p className="mt-3 text-sm text-ink-2">{d.summary}</p>}
            {d.missing_info.length > 0 && <p className="mt-2 text-sm"><span className="font-medium">Fehlt:</span> {d.missing_info.join(", ")}</p>}
          </Card>
          {pending && (
            <Card title={`Entwurf (${pending.kind})`}>
              {pending.review_flags.length > 0 && <div className="mb-3"><Alert tone="warn">Bitte prüfen: {pending.review_flags.join(" · ")}</Alert></div>}
              {edit ? (
                <div className="space-y-3">
                  <Field label="Betreff"><input className={inputCls} value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></Field>
                  <Field label="Text"><textarea className={`${inputCls} min-h-56`} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
                </div>
              ) : (<><div className="text-sm font-medium">{pending.subject}</div><pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-ink-2">{pending.body}</pre></>)}
              {pending.proposed_slots.length > 0 && <p className="mt-3 text-xs text-muted">Terminvorschläge im Entwurf: {pending.proposed_slots.map((s) => s.label).join(" · ")}</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => run(() => api(`/api/drafts/${pending.id}/approve`, { method: "POST", json: edit ?? {} }), "Antwort gesendet.")} disabled={!d.sender_email}>Freigeben & senden</Button>
                <Button variant="secondary" onClick={() => setEdit(edit ? null : { subject: pending.subject, body: pending.body })}>{edit ? "Bearbeiten beenden" : "Bearbeiten"}</Button>
                <Button variant="danger" onClick={() => run(() => api(`/api/drafts/${pending.id}/reject`, { method: "POST" }), "Entwurf verworfen.")}>Verwerfen</Button>
              </div>
              {!d.sender_email && <p className="mt-2 text-xs text-warn">Keine E-Mail-Adresse bekannt – bitte telefonisch antworten.</p>}
            </Card>
          )}
          <Card title="Verlauf">
            <ul className="space-y-3">
              {d.messages.map((m) => (
                <li key={m.id} className={`rounded-xl border border-line p-3 text-sm ${m.direction === "out" ? "bg-accent-soft/40" : m.direction === "note" ? "bg-warn-soft/40" : "bg-sand"}`}>
                  <div className="mb-1 flex justify-between text-xs text-muted"><span>{m.direction === "in" ? "Eingang" : m.direction === "out" ? `Gesendet an ${m.recipient}` : "Interne Notiz"} · {m.sender}</span><span>{fmtDate(m.created_at)} {m.delivery_status && `· ${m.delivery_status}`}</span></div>
                  {m.subject && <div className="font-medium">{m.subject}</div>}
                  <pre className="whitespace-pre-wrap font-sans text-ink-2">{m.body}</pre>
                </li>
              ))}
            </ul>
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/inquiries/${d.id}/notes`, { method: "POST", json: { body: note } }), "Notiz gespeichert.").then(() => setNote("")); }}>
              <input className={inputCls} placeholder="Interne Notiz (z.B. Telefonat)" value={note} onChange={(e) => setNote(e.target.value)} required />
              <Button type="submit" variant="secondary">Notiz</Button>
            </form>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Kunde">{d.customer ? <div className="text-sm text-ink-2"><div className="font-medium text-ink">{d.customer.name || "–"}</div><div>{d.customer.email}</div><div>{d.customer.phone}</div><div>{d.customer.address}</div></div> : <p className="text-sm text-muted">Kein Kundendatensatz (keine E-Mail/Telefon).</p>}</Card>
          <Card title="Termine">
            {d.appointments.length === 0 ? <p className="text-sm text-muted">Keine.</p> : d.appointments.map((a) => (
              <div key={a.id} className="mb-2 flex items-center justify-between text-sm"><span>{fmtDate(a.starts_at)}</span><div className="flex gap-1"><Badge tone={a.status === "confirmed" ? "ok" : a.status === "canceled" ? "neutral" : "accent"}>{a.status}</Badge>{a.status === "proposed" && <button className="text-xs text-accent underline" onClick={() => run(() => api(`/api/appointments/${a.id}`, { method: "PATCH", json: { status: "confirmed" } }), "Termin bestätigt.")}>bestätigen</button>}</div></div>
            ))}
          </Card>
          <Card title="Angebot">
            {d.quotes.map((q) => <div key={q.id} className="mb-2 text-sm">{q.title} · <Badge>{q.status}</Badge> {q.amount_cents != null && `· ${(q.amount_cents / 100).toFixed(2)} €`}</div>)}
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api("/api/quotes", { method: "POST", json: { title: f.get("title"), inquiry_id: d.id, amount_cents: f.get("amount") ? Math.round(Number(f.get("amount")) * 100) : null } }), "Angebot eingetragen – Nachfass-Erinnerung läuft."); }}>
              <input name="title" className={inputCls} placeholder="Angebot gestellt: Titel" required />
              <input name="amount" type="number" step="0.01" className={inputCls} placeholder="Betrag in € (optional, nur für Sie)" />
              <Button type="submit" variant="secondary" className="w-full">Angebot eintragen</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

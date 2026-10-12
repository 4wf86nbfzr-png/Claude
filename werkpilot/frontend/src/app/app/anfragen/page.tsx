"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, Table, inputCls } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";
import { catLabel, prioLabel, prioTone, statusLabel, useApi } from "@/lib/use-api";

type Inq = { id: string; subject: string; sender_name: string; sender_email: string | null; status: string; category: string | null; priority: string; created_at: string; channel: string; needs_human: boolean };

export default function Anfragen() {
  const [q, setQ] = useState("");
  const [openOnly, setOpenOnly] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, loading, reload } = useApi<{ total: number; items: Inq[] }>(`/api/inquiries?open_only=${openOnly}&q=${encodeURIComponent(q)}`);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);
    try {
      await api("/api/inquiries", { method: "POST", json: { subject: f.get("subject"), body: f.get("body"), sender_name: f.get("sender_name"), sender_email: f.get("sender_email") || null, sender_phone: f.get("sender_phone") || null, channel: f.get("channel") } });
      setShowNew(false); reload();
    } catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Fehler"); }
  }
  return (
    <>
      <PageHeader title="Anfragen" lead="Alle Kundenanfragen aus E-Mail, Website und Telefon." action={<Button onClick={() => setShowNew((v) => !v)}>{showNew ? "Abbrechen" : "Anfrage erfassen"}</Button>} />
      {showNew && (
        <Card className="mb-6" title="Anfrage manuell erfassen (z.B. nach Anruf)">
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input name="sender_name" className={inputCls} /></Field>
            <Field label="E-Mail"><input name="sender_email" type="email" className={inputCls} /></Field>
            <Field label="Telefon"><input name="sender_phone" className={inputCls} /></Field>
            <Field label="Kanal"><select name="channel" className={inputCls}><option value="phone">Telefon</option><option value="manual">Sonstiges</option></select></Field>
            <div className="md:col-span-2"><Field label="Betreff"><input name="subject" className={inputCls} /></Field></div>
            <div className="md:col-span-2"><Field label="Anliegen"><textarea name="body" className={`${inputCls} min-h-28`} required minLength={3} /></Field></div>
            {err && <div className="md:col-span-2"><Alert tone="bad">{err}</Alert></div>}
            <div><Button type="submit">Erfassen und verarbeiten</Button></div>
          </form>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-xs`} placeholder="Suche Name, E-Mail, Betreff" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Nur offene</label>
        <span className="text-sm text-muted">{data?.total ?? 0} Treffer</span>
      </div>
      <Card>
        {loading ? <p className="text-sm text-muted">Lade …</p> : !data?.items.length ? <Empty>Keine Anfragen. Verbinden Sie Ihr Kontaktformular oder erfassen Sie eine Anfrage manuell.</Empty> : (
          <Table head={["Eingang", "Von", "Betreff", "Kategorie", "Priorität", "Status"]}>
            {data.items.map((i) => (
              <tr key={i.id} className="hover:bg-sand">
                <td className="py-2 pr-3 text-xs text-muted">{fmtDate(i.created_at)}</td>
                <td className="py-2 pr-3">{i.sender_name || i.sender_email || "–"}</td>
                <td className="py-2 pr-3"><Link href={`/app/anfragen/${i.id}`} className="font-medium text-accent">{i.subject || "(ohne Betreff)"}</Link></td>
                <td className="py-2 pr-3">{i.category ? catLabel[i.category] ?? i.category : "–"}</td>
                <td className="py-2 pr-3"><Badge tone={prioTone[i.priority]}>{prioLabel[i.priority]}</Badge></td>
                <td className="py-2 pr-3"><Badge tone={i.needs_human ? "warn" : "neutral"}>{statusLabel[i.status] ?? i.status}</Badge></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

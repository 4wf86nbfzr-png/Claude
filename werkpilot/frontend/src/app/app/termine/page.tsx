"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, PageHeader, Table, inputCls } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type A = { id: string; title: string; starts_at: string; ends_at: string; status: string; location: string | null; external_calendar_id: string | null };

export default function Termine() {
  const { data, loading, reload } = useApi<A[]>("/api/appointments?upcoming=true");
  const { data: slots } = useApi<{ starts_at: string; ends_at: string; label: string }[]>("/api/appointments/slots?count=5");
  const [err, setErr] = useState<string | null>(null);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget); setErr(null);
    const start = new Date(String(f.get("start"))); const end = new Date(start.getTime() + Number(f.get("dur")) * 60000);
    try { await api("/api/appointments", { method: "POST", json: { title: f.get("title"), starts_at: start.toISOString(), ends_at: end.toISOString(), location: f.get("location") || null } }); reload(); }
    catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Fehler"); }
  }
  return (
    <>
      <PageHeader title="Termine" lead="Bestätigte und vorgeschlagene Termine. Vorschläge blockieren die Zeit, bis der Kunde bestätigt oder der Termin verfällt." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">{loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Keine anstehenden Termine.</Empty> : (
          <Table head={["Beginn", "Titel", "Ort", "Status", "Kalender", ""]}>{data.map((a) => <tr key={a.id}><td className="py-2 pr-3">{fmtDate(a.starts_at)}</td><td className="py-2 pr-3 font-medium">{a.title}</td><td className="py-2 pr-3 text-muted">{a.location}</td><td className="py-2 pr-3"><Badge tone={a.status === "confirmed" ? "ok" : a.status === "proposed" ? "accent" : "neutral"}>{({ confirmed: "bestätigt", proposed: "vorgeschlagen", canceled: "abgesagt", expired: "verfallen" } as Record<string, string>)[a.status] ?? a.status}</Badge></td><td className="py-2 pr-3 text-xs text-muted">{a.external_calendar_id ? "Google ✓" : "–"}</td><td className="py-2 text-xs"><button className="mr-2 text-accent underline" onClick={async () => { await api(`/api/appointments/${a.id}`, { method: "PATCH", json: { status: "confirmed" } }); reload(); }}>bestätigen</button><button className="text-bad underline" onClick={async () => { await api(`/api/appointments/${a.id}`, { method: "PATCH", json: { status: "canceled" } }); reload(); }}>absagen</button></td></tr>)}</Table>)}
        </Card>
        <div className="space-y-4">
          <Card title="Termin eintragen"><form onSubmit={create} className="space-y-3"><Field label="Titel"><input name="title" className={inputCls} required /></Field><Field label="Beginn"><input name="start" type="datetime-local" className={inputCls} required /></Field><Field label="Dauer (Min.)"><input name="dur" type="number" className={inputCls} defaultValue={60} min={15} /></Field><Field label="Ort"><input name="location" className={inputCls} /></Field>{err && <Alert tone="bad">{err}</Alert>}<Button type="submit" className="w-full">Speichern</Button></form></Card>
          <Card title="Nächste freie Slots"><ul className="space-y-1 text-sm text-ink-2">{slots?.map((s) => <li key={s.starts_at}>{s.label}</li>) ?? <li className="text-muted">–</li>}</ul><p className="mt-2 text-xs text-muted">Aus Geschäftszeiten (Einstellungen) abzüglich belegter Zeiten.</p></Card>
        </div>
      </div>
    </>
  );
}

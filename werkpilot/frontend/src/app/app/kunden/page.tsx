"use client";

import { useState } from "react";
import { Button, Card, Empty, Field, PageHeader, Table, inputCls } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type C = { id: string; name: string; email: string | null; phone: string | null; address: string | null; notes: string | null; inquiries: number };

export default function Kunden() {
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const { data, loading, reload } = useApi<C[]>(`/api/customers?q=${encodeURIComponent(q)}`);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    await api("/api/customers", { method: "POST", json: { name: f.get("name"), email: f.get("email") || null, phone: f.get("phone") || null, address: f.get("address") || null, notes: f.get("notes") || null } });
    setShow(false); reload();
  }
  return (
    <>
      <PageHeader title="Kunden" lead="Endkunden Ihres Betriebs. Werden automatisch aus Anfragen angelegt." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => window.open("/api/tenant/export/customers.csv")}>CSV-Export</Button><Button onClick={() => setShow((v) => !v)}>Kunde anlegen</Button></div>} />
      {show && <Card className="mb-6"><form onSubmit={create} className="grid gap-3 md:grid-cols-2"><Field label="Name"><input name="name" className={inputCls} required /></Field><Field label="E-Mail"><input name="email" type="email" className={inputCls} /></Field><Field label="Telefon"><input name="phone" className={inputCls} /></Field><Field label="Adresse"><input name="address" className={inputCls} /></Field><div className="md:col-span-2"><Field label="Notizen"><textarea name="notes" className={inputCls} /></Field></div><div><Button type="submit">Speichern</Button></div></form></Card>}
      <input className={`${inputCls} mb-4 max-w-xs`} placeholder="Suche" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card>{loading ? <p className="text-sm text-muted">Lade …</p> : !data?.length ? <Empty>Noch keine Kunden.</Empty> : (
        <Table head={["Name", "E-Mail", "Telefon", "Adresse", "Anfragen", ""]}>
          {data.map((c) => <tr key={c.id}><td className="py-2 pr-3 font-medium">{c.name || "–"}</td><td className="py-2 pr-3">{c.email}</td><td className="py-2 pr-3">{c.phone}</td><td className="py-2 pr-3 text-muted">{c.address}</td><td className="py-2 pr-3">{c.inquiries}</td><td className="py-2"><button className="text-xs text-bad underline" onClick={async () => { if (confirm("Kunde löschen? Anfragen bleiben erhalten.")) { await api(`/api/customers/${c.id}`, { method: "DELETE" }); reload(); } }}>löschen</button></td></tr>)}
        </Table>)}</Card>
    </>
  );
}

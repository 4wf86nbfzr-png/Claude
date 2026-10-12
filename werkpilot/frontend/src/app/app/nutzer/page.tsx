"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Field, PageHeader, Table, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type M = { user_id: string; email: string; full_name: string; role: string; verified: boolean };

export default function Nutzer() {
  const { data, loading, reload } = useApi<M[]>("/api/tenant/members");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, ok: string) { try { await fn(); setMsg({ tone: "ok", text: ok }); reload(); } catch (ex) { setMsg({ tone: "bad", text: ex instanceof ApiError ? String(ex.detail) : "Fehler" }); } }
  return (
    <>
      <PageHeader title="Nutzer" lead="Inhaber verwalten alles, Admins Einstellungen und Nutzer, Mitarbeiter bearbeiten Anfragen. Alle Rechte werden serverseitig geprüft." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">{loading ? <p className="text-sm text-muted">Lade …</p> : <Table head={["Name", "E-Mail", "Rolle", "Status", ""]}>{data?.map((m) => <tr key={m.user_id}><td className="py-2 pr-3 font-medium">{m.full_name}</td><td className="py-2 pr-3">{m.email}</td><td className="py-2 pr-3"><select className={inputCls} value={m.role} onChange={(e) => run(() => api(`/api/tenant/members/${m.user_id}`, { method: "PATCH", json: { role: e.target.value } }), "Rolle geändert.")}><option value="owner">Inhaber</option><option value="admin">Admin</option><option value="member">Mitarbeiter</option></select></td><td className="py-2 pr-3"><Badge tone={m.verified ? "ok" : "warn"}>{m.verified ? "bestätigt" : "unbestätigt"}</Badge></td><td className="py-2">{m.role !== "owner" && <button className="text-xs text-bad underline" onClick={() => run(() => api(`/api/tenant/members/${m.user_id}`, { method: "DELETE" }), "Entfernt.")}>entfernen</button>}</td></tr>)}</Table>}</Card>
        <Card title="Einladen"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => api("/api/tenant/members/invite", { method: "POST", json: { email: f.get("email"), role: f.get("role") } }), "Einladung gesendet (7 Tage gültig)."); }}><Field label="E-Mail"><input name="email" type="email" className={inputCls} required /></Field><Field label="Rolle"><select name="role" className={inputCls}><option value="member">Mitarbeiter</option><option value="admin">Admin</option></select></Field><Button type="submit" className="w-full">Einladen</Button></form></Card>
      </div>
    </>
  );
}

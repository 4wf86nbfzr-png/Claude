"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/use-api";

type T = { name: string; slug: string; trade: string; contact_email: string | null; phone: string | null; address: string | null; settings: Record<string, unknown>; business_hours: Record<string, string[][]>; data_retention_days: number; role: string; entitlements: { features: string[] } };
const DAYS: [string, string][] = [["mon", "Mo"], ["tue", "Di"], ["wed", "Mi"], ["thu", "Do"], ["fri", "Fr"], ["sat", "Sa"], ["sun", "So"]];
const DEFAULT_HOURS: Record<string, string[][]> = { mon: [["08:00", "16:00"]], tue: [["08:00", "16:00"]], wed: [["08:00", "16:00"]], thu: [["08:00", "16:00"]], fri: [["08:00", "14:00"]], sat: [], sun: [] };

export default function Einstellungen() {
  const { data, loading, reload } = useApi<T>("/api/tenant");
  const { logout } = useAuth();
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [hours, setHours] = useState<Record<string, string[][]>>(DEFAULT_HOURS);
  useEffect(() => { if (data && Object.keys(data.business_hours || {}).length) queueMicrotask(() => setHours(data.business_hours)); }, [data]);
  if (loading || !data) return <p className="text-sm text-muted">Lade …</p>;
  const s = data.settings;
  const canAuto = data.entitlements.features.includes("automations");
  async function save(json: unknown, ok = "Gespeichert.") { setMsg(null); try { await api("/api/tenant", { method: "PATCH", json }); setMsg({ tone: "ok", text: ok }); reload(); } catch (ex) { setMsg({ tone: "bad", text: ex instanceof ApiError ? String(ex.detail) : "Fehler" }); } }
  return (
    <>
      <PageHeader title="Einstellungen" lead="Betriebsdaten, Geschäftszeiten und Automatisierungsregeln." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Betrieb"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ name: f.get("name"), trade: f.get("trade"), contact_email: f.get("contact_email") || null, phone: f.get("phone") || null, address: f.get("address") || null }); }}>
          <Field label="Name"><input name="name" className={inputCls} defaultValue={data.name} required /></Field>
          <Field label="Gewerk"><select name="trade" className={inputCls} defaultValue={data.trade}>{["elektro", "shk", "maler", "dach", "reinigung", "galabau", "bau", "sonstiges"].map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Antwort-Adresse (Reply-To)" hint="Kundenantworten gehen an diese Adresse."><input name="contact_email" type="email" className={inputCls} defaultValue={data.contact_email ?? ""} /></Field>
          <Field label="Telefon"><input name="phone" className={inputCls} defaultValue={data.phone ?? ""} /></Field>
          <Field label="Adresse"><input name="address" className={inputCls} defaultValue={data.address ?? ""} /></Field>
          <Button type="submit">Speichern</Button>
        </form></Card>
        <Card title="Automatisierung"><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ settings: { signature: f.get("signature"), quote_followup_days: Number(f.get("quote_followup_days")), appointment_lead_hours: Number(f.get("appointment_lead_hours")), auto_reply_min_confidence: Number(f.get("auto_reply_min_confidence")), auto_reply_enabled: f.get("auto_reply_enabled") === "on", weekly_report_enabled: f.get("weekly_report_enabled") === "on" } }); }}>
          <Field label="Signatur in Antworten"><input name="signature" className={inputCls} defaultValue={String(s.signature ?? "")} placeholder={data.name} /></Field>
          <Field label="Angebote nachfassen nach (Tage)"><input name="quote_followup_days" type="number" min={1} max={60} className={inputCls} defaultValue={Number(s.quote_followup_days ?? 5)} /></Field>
          <Field label="Vorlauf für Terminvorschläge (Stunden)"><input name="appointment_lead_hours" type="number" min={1} max={168} className={inputCls} defaultValue={Number(s.appointment_lead_hours ?? 20)} /></Field>
          <Field label="Mindest-Sicherheit für automatische Antworten (0,5–1)"><input name="auto_reply_min_confidence" type="number" step="0.05" min={0.5} max={1} className={inputCls} defaultValue={Number(s.auto_reply_min_confidence ?? 0.8)} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="auto_reply_enabled" defaultChecked={Boolean(s.auto_reply_enabled)} disabled={!canAuto} className="mt-1" /><span>Eingangsbestätigung automatisch senden, wenn keine Warnhinweise vorliegen {!canAuto && <span className="text-muted">(ab Tarif Business)</span>}</span></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="weekly_report_enabled" defaultChecked={s.weekly_report_enabled !== false} /> Wochenbericht per E-Mail</label>
          <Button type="submit">Speichern</Button>
        </form></Card>
        <Card title="Geschäftszeiten" className="lg:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{DAYS.map(([k, label]) => { const w = hours[k]?.[0]; return (<div key={k} className="flex items-center gap-2 text-sm"><label className="flex w-14 items-center gap-1"><input type="checkbox" checked={!!w} onChange={(e) => setHours({ ...hours, [k]: e.target.checked ? [["08:00", "16:00"]] : [] })} />{label}</label>{w && <><input type="time" className={inputCls} value={w[0]} onChange={(e) => setHours({ ...hours, [k]: [[e.target.value, w[1]]] })} /><span>–</span><input type="time" className={inputCls} value={w[1]} onChange={(e) => setHours({ ...hours, [k]: [[w[0], e.target.value]] })} /></>}</div>); })}</div>
          <Button className="mt-4" onClick={() => save({ business_hours: hours })}>Geschäftszeiten speichern</Button>
        </Card>
        {data.role === "owner" && (
          <Card title="Daten & Konto" className="lg:col-span-2">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Aufbewahrung abgeschlossener Vorgänge (Tage)"><input type="number" min={30} max={3650} className={inputCls} defaultValue={data.data_retention_days} onBlur={(e) => save({ data_retention_days: Number(e.target.value) })} /></Field>
              <Button variant="secondary" onClick={() => window.open("/api/tenant/export")}>Alle Daten exportieren (JSON)</Button>
              <Button variant="danger" onClick={async () => { const c = prompt(`Betrieb endgültig löschen? Zur Bestätigung „${data.slug}“ eingeben. Ein aktives Abo muss vorher gekündigt sein.`); if (c) { try { await api("/api/tenant/delete", { method: "POST", json: { confirm: c } }); await logout(); router.push("/"); } catch (ex) { setMsg({ tone: "bad", text: ex instanceof ApiError ? String(ex.detail) : "Fehler" }); } } }}>Betrieb löschen</Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

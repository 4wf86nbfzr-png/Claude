"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, PageHeader, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type I = { type: string; name: string; description: string; available: boolean | null; tier: string; status: string; config: Record<string, string>; last_error: string | null };

export default function Integrationen() {
  const { data, loading, reload } = useApi<I[]>("/api/integrations");
  const [secret, setSecret] = useState<{ url: string; secret: string; hint: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [crm, setCrm] = useState("");
  async function run(fn: () => Promise<unknown>) { setMsg(null); try { await fn(); reload(); } catch (ex) { setMsg(ex instanceof ApiError ? String(ex.detail) : "Fehler"); } }
  if (loading) return <p className="text-sm text-muted">Lade …</p>;
  return (
    <>
      <PageHeader title="Integrationen" lead="Einrichtungsassistent: Verbinden Sie nur, was Sie brauchen. Jede Verbindung lässt sich jederzeit trennen; gespeicherte Zugangsdaten werden dann gelöscht." />
      {msg && <div className="mb-4"><Alert tone="bad">{msg}</Alert></div>}
      {secret && <div className="mb-4"><Alert tone="ok"><div><strong>Webhook-URL:</strong> <code>{secret.url}</code></div><div><strong>Secret (nur jetzt sichtbar):</strong> <code>{secret.secret}</code></div><div className="mt-1 text-xs">{secret.hint}</div></Alert></div>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((i) => (
          <Card key={i.type} title={i.name} action={<Badge tone={i.status === "connected" ? "ok" : i.status === "error" ? "bad" : i.available === false ? "neutral" : "warn"}>{i.available === false ? "nicht verfügbar" : i.status === "connected" ? "verbunden" : i.status === "pending" ? "wartet auf Betreiber" : i.status === "error" ? "Fehler" : "nicht eingerichtet"}</Badge>}>
            <p className="text-sm text-ink-2">{i.description}</p>
            <p className="mt-1 text-xs text-muted">Ab Tarif {i.tier}</p>
            {i.last_error && <p className="mt-2 text-xs text-bad">{i.last_error}</p>}
            {i.config.webhook_url && i.status === "connected" && <p className="mt-2 break-all text-xs text-muted">URL: {i.config.webhook_url}</p>}
            {i.config.inbound_address_hint && <p className="mt-2 break-all text-xs text-muted">Weiterleitungsadresse: {i.config.inbound_address_hint}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {i.type === "contact_form" && <Button variant="secondary" onClick={() => run(async () => { const r = await api<{ webhook_url: string; secret: string; hint: string }>("/api/integrations/contact-form/enable", { method: "POST" }); setSecret({ url: r.webhook_url, secret: r.secret, hint: r.hint }); })}>{i.status === "connected" ? "Secret neu erzeugen" : "Aktivieren"}</Button>}
              {i.type === "email_inbound" && i.status !== "connected" && <Button variant="secondary" onClick={() => run(() => api("/api/integrations/email-inbound/enable", { method: "POST" }))}>Aktivieren</Button>}
              {i.type === "google_calendar" && i.available && i.status !== "connected" && <Button variant="secondary" onClick={() => run(async () => { const r = await api<{ url: string }>("/api/integrations/google-calendar/start"); window.location.href = r.url; })}>Mit Google verbinden</Button>}
              {i.type === "google_calendar" && !i.available && <p className="text-xs text-muted">Der Betreiber muss zuerst Google-OAuth-Zugangsdaten hinterlegen.</p>}
              {i.type === "email_outbound" && !i.available && <p className="text-xs text-muted">Kein E-Mail-Anbieter konfiguriert – Antworten werden nur simuliert.</p>}
              {i.type === "crm_webhook" && (<form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); run(() => api("/api/integrations/crm-webhook", { method: "POST", json: { url: crm } })); }}><input className={inputCls} placeholder="https://ihr-crm.de/webhook" value={crm} onChange={(e) => setCrm(e.target.value)} /><Button type="submit" variant="secondary">Speichern</Button></form>)}
              {i.status === "connected" && i.type !== "email_outbound" && <Button variant="danger" onClick={() => run(() => api(`/api/integrations/${i.type}`, { method: "DELETE" }))}>Trennen</Button>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

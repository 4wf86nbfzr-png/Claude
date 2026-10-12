"use client";

import { useState } from "react";
import { Alert, Button, Card, Field, PageHeader, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type P = { code: string; name: string; description: string; price_cents_monthly: number; features: string[]; limits: Record<string, number>; stripe_price_id: string | null; sort_order: number; is_active: boolean; is_public: boolean };

export default function Tarife() {
  const { data, reload } = useApi<P[]>("/api/admin/plans");
  const [msg, setMsg] = useState<string | null>(null);
  async function save(p: P, form: FormData) {
    try {
      await api(`/api/admin/plans/${p.code}`, { method: "PUT", json: { ...p, name: form.get("name"), description: form.get("description"), price_cents_monthly: Math.round(Number(form.get("price")) * 100), stripe_price_id: form.get("stripe_price_id") || null, features: String(form.get("features")).split(",").map((s) => s.trim()).filter(Boolean), limits: JSON.parse(String(form.get("limits"))), is_active: form.get("is_active") === "on", is_public: form.get("is_public") === "on" } });
      setMsg(`Tarif ${p.code} gespeichert.`); reload();
    } catch (ex) { setMsg(ex instanceof ApiError ? String(ex.detail) : "Fehler (Limits müssen gültiges JSON sein)"); }
  }
  return (
    <>
      <PageHeader title="Tarife" lead="Preise, Grenzen, Funktionen und Stripe-Preis-IDs. Änderungen gelten für neue Buchungen; bestehende Stripe-Abos behalten ihren Preis." />
      {msg && <div className="mb-4"><Alert>{msg}</Alert></div>}
      <div className="grid gap-4 lg:grid-cols-3">{data?.map((p) => <Card key={p.code} title={`${p.code}`}><form className="space-y-2" onSubmit={(e) => { e.preventDefault(); save(p, new FormData(e.currentTarget)); }}><Field label="Name"><input name="name" className={inputCls} defaultValue={p.name} /></Field><Field label="Beschreibung"><textarea name="description" className={inputCls} defaultValue={p.description} /></Field><Field label="Preis €/Monat"><input name="price" type="number" step="0.01" className={inputCls} defaultValue={p.price_cents_monthly / 100} /></Field><Field label="Stripe Price ID" hint="price_… aus dem Stripe-Dashboard (Testmodus oder Live)"><input name="stripe_price_id" className={inputCls} defaultValue={p.stripe_price_id ?? ""} /></Field><Field label="Features (Komma)"><input name="features" className={inputCls} defaultValue={p.features.join(", ")} /></Field><Field label="Limits (JSON)"><textarea name="limits" className={`${inputCls} font-mono text-xs`} defaultValue={JSON.stringify(p.limits)} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={p.is_active} /> aktiv</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_public" defaultChecked={p.is_public} /> öffentlich</label><Button type="submit" className="w-full">Speichern</Button></form></Card>)}</div>
      <p className="mt-4 text-xs text-muted">Feature-Codes: inquiries, ai_drafts, customers, reports_basic, automations, appointments, quote_followup, workflows, integrations_advanced, rules_custom, reports_advanced, priority_support. Limits: inquiries_per_month, ai_budget_cents_month, users.</p>
    </>
  );
}

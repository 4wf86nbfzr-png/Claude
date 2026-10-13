"use client";

import { useState } from "react";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function ContactForm() {
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      const r = await api<{ message: string }>("/api/public/contact", { method: "POST", json: { company: f.get("company"), name: f.get("name"), email: f.get("email"), phone: f.get("phone") || null, trade: f.get("trade"), size: f.get("size"), message: f.get("message"), consent: f.get("consent") === "on", website: f.get("website") || null } });
      setDone(r.message);
    } catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Senden fehlgeschlagen."); } finally { setBusy(false); }
  }
  if (done) return <Alert tone="ok">{done}</Alert>;
  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 md:grid-cols-2">
      <Field label="Betrieb"><input name="company" className={inputCls} required minLength={2} /></Field>
      <Field label="Ihr Name"><input name="name" className={inputCls} required minLength={2} /></Field>
      <Field label="E-Mail"><input name="email" type="email" className={inputCls} required /></Field>
      <Field label="Telefon (optional)"><input name="phone" className={inputCls} /></Field>
      <Field label="Gewerk"><select name="trade" className={inputCls}><option value="elektro">Elektro</option><option value="shk">Sanitär/Heizung</option><option value="maler">Maler</option><option value="dach">Dachdecker</option><option value="reinigung">Gebäudereinigung</option><option value="galabau">Garten- und Landschaftsbau</option><option value="bau">Bauunternehmen</option><option value="sonstiges">Sonstiges</option></select></Field>
      <Field label="Betriebsgröße"><select name="size" className={inputCls}><option value="solo">Nur ich</option><option value="2-5">2–5 Mitarbeitende</option><option value="6-15">6–15</option><option value="16+">16 und mehr</option></select></Field>
      <div className="md:col-span-2"><Field label="Nachricht"><textarea name="message" className={`${inputCls} min-h-28`} maxLength={5000} /></Field></div>
      <input name="website" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <label className="flex items-start gap-2 text-sm text-ink-2 md:col-span-2"><input type="checkbox" name="consent" required className="mt-1" /> Ich bin einverstanden, dass Clairify meine Angaben zur Bearbeitung meiner Anfrage speichert und mich per E-Mail kontaktiert. Details in der <a href="/datenschutz" className="text-accent underline">Datenschutzerklärung</a>.</label>
      {err && <div className="md:col-span-2"><Alert tone="bad">{err}</Alert></div>}
      <div><Button type="submit" disabled={busy}>{busy ? "Sende …" : "Anfrage senden"}</Button></div>
    </form>
  );
}

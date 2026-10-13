"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function RegisterForm() {
  const params = useSearchParams();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      await api("/api/auth/register", { method: "POST", json: { email: f.get("email"), password: f.get("password"), full_name: f.get("full_name"), company: f.get("company"), trade: f.get("trade"), accept_terms: f.get("terms") === "on", accept_privacy: f.get("privacy") === "on" } });
      try { sessionStorage.setItem("wp_wunschtarif", params.get("tarif") ?? ""); } catch {}
      setDone(true);
    } catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Registrierung fehlgeschlagen."); } finally { setBusy(false); }
  }
  if (done) return <div className="mt-8"><Alert tone="ok">Fast geschafft: Wir haben Ihnen eine Mail geschickt. Bitte klicken Sie auf den Bestätigungslink, dann geht es direkt ins Dashboard.</Alert></div>;
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <Field label="Betrieb"><input name="company" className={inputCls} required minLength={2} autoComplete="organization" /></Field>
      <Field label="Gewerk"><select name="trade" className={inputCls} defaultValue="shk"><option value="elektro">Elektro</option><option value="shk">Sanitär / Heizung / Klima</option><option value="maler">Maler</option><option value="dach">Dachdecker</option><option value="reinigung">Gebäudereinigung</option><option value="galabau">Garten- und Landschaftsbau</option><option value="bau">Bauunternehmen</option><option value="sonstiges">Sonstiges</option></select></Field>
      <Field label="Ihr Name"><input name="full_name" className={inputCls} required autoComplete="name" /></Field>
      <Field label="Mailadresse"><input name="email" type="email" className={inputCls} required autoComplete="email" /></Field>
      <Field label="Passwort" hint="Mindestens 10 Zeichen, kein Wörterbuchwort."><input name="password" type="password" className={inputCls} required minLength={10} autoComplete="new-password" /></Field>
      <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="terms" required className="mt-1" /> Ich akzeptiere die <a href="/agb" className="text-accent underline">AGB</a>.</label>
      <label className="flex items-start gap-2 text-sm text-ink-2"><input type="checkbox" name="privacy" required className="mt-1" /> Ich habe die <a href="/datenschutz" className="text-accent underline">Datenschutzerklärung</a> gelesen.</label>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Lege Konto an …" : "Konto anlegen"}</Button>
      <p className="text-center text-sm text-muted">Schon registriert? <a href="/anmelden" className="text-accent underline">Anmelden</a></p>
    </form>
  );
}

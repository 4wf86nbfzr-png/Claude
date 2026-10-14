"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isStandalone } from "@/lib/install";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const confirmed = params.get("bestaetigt") === "1";
  // In der installierten App (Desktop-Rahmen oder PWA) führt die Tarifwahl auf die Website im Browser
  const inApp = params.get("app") === "desktop" || params.get("quelle") === "app" || isStandalone();
  const ext = inApp ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try { await login(String(f.get("email")), String(f.get("password"))); router.push("/app"); }
    catch (ex) { setErr(ex instanceof ApiError ? String(ex.detail) : "Anmeldung fehlgeschlagen."); setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      {confirmed && <Alert tone="ok">Mailadresse bestätigt. Jetzt anmelden.</Alert>}
      <Field label="Mailadresse"><input name="email" type="email" className={inputCls} required autoComplete="email" /></Field>
      <Field label="Passwort"><input name="password" type="password" className={inputCls} required autoComplete="current-password" /></Field>
      {err && <Alert tone="bad">{err} Noch kein Konto? Dann wählen Sie auf der Website Ihr Angebot: <a href="/preise" className="underline" {...ext}>Tarife ansehen</a>.</Alert>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Melde an …" : "Anmelden"}</Button>
      <p className="text-center text-sm text-muted"><a href="/passwort-vergessen" className="text-accent underline">Passwort vergessen?</a></p>
      <div className="rounded-[var(--radius-card)] border border-line bg-paper p-4 text-sm">
        <p className="font-medium">Noch kein Konto?</p>
        <p className="mt-1 text-ink-2">Ein Konto entsteht auf der Website: Angebot wählen, registrieren, dann hier anmelden. {inApp ? "Die Website öffnet sich im Browser." : ""}</p>
        <p className="mt-2"><a href="/preise" className="text-accent underline" {...ext}>Angebot wählen und Konto anlegen</a></p>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const confirmed = useSearchParams().get("bestaetigt") === "1";
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
      {confirmed && <Alert tone="ok">E-Mail-Adresse bestätigt. Jetzt anmelden.</Alert>}
      <Field label="E-Mail"><input name="email" type="email" className={inputCls} required autoComplete="email" /></Field>
      <Field label="Passwort"><input name="password" type="password" className={inputCls} required autoComplete="current-password" /></Field>
      {err && <Alert tone="bad">{err}</Alert>}
      <Button type="submit" disabled={busy} className="w-full">{busy ? "Melde an …" : "Anmelden"}</Button>
      <p className="text-center text-sm text-muted"><a href="/passwort-vergessen" className="text-accent underline">Passwort vergessen?</a> · <a href="/registrieren" className="text-accent underline">Neu hier?</a></p>
    </form>
  );
}

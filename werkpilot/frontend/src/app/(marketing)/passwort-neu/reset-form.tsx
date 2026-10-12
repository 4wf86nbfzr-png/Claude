"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
export function ResetForm() {
  const params = useSearchParams();
  const [state, setState] = useState<{ ok?: boolean; err?: string }>({});
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    try { await api("/api/auth/password/reset", { method: "POST", json: { token: params.get("token"), password: f.get("password") } }); setState({ ok: true }); }
    catch (ex) { setState({ err: ex instanceof ApiError ? String(ex.detail) : "Fehler" }); }
  }
  if (state.ok) return <div className="mt-6"><Alert tone="ok">Passwort geändert. <a className="underline" href="/anmelden">Jetzt anmelden</a>.</Alert></div>;
  return <form onSubmit={submit} className="mt-8 space-y-4"><Field label="Neues Passwort"><input name="password" type="password" className={inputCls} required minLength={10} autoComplete="new-password" /></Field>{state.err && <Alert tone="bad">{state.err}</Alert>}<Button type="submit" className="w-full">Speichern</Button></form>;
}

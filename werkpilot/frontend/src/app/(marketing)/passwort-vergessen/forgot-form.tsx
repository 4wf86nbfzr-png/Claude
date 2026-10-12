"use client";
import { useState } from "react";
import { Alert, Button, Field, inputCls } from "@/components/ui";
import { api } from "@/lib/api";
export function ForgotForm() {
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await api("/api/auth/password/forgot", { method: "POST", json: { email: f.get("email") } }).catch(() => null); setDone(true); }
  if (done) return <div className="mt-6"><Alert tone="ok">Falls ein Konto existiert, haben wir eine E-Mail mit einem Link gesendet (2 Stunden gültig).</Alert></div>;
  return <form onSubmit={submit} className="mt-8 space-y-4"><Field label="E-Mail"><input name="email" type="email" className={inputCls} required /></Field><Button type="submit" className="w-full">Link anfordern</Button></form>;
}

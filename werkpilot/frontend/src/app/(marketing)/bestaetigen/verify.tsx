"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui";
import { api, ApiError, setSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const { reload } = useAuth();
  const [state, setState] = useState<"busy" | "ok" | "err">("busy");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { queueMicrotask(() => { setState("err"); setMsg("Kein Token in der Adresse."); }); return; }
    api<{ access_token: string; tenant_id: string | null }>("/api/auth/verify-email", { method: "POST", json: { token } })
      .then(async (d) => { setSession(d.access_token, d.tenant_id); await reload(); setState("ok"); setTimeout(() => router.push("/app?willkommen=1"), 800); })
      .catch((e) => { setState("err"); setMsg(e instanceof ApiError ? String(e.detail) : "Fehler"); });
  }, [params, reload, router]);
  if (state === "busy") return <p className="mt-6 text-sm text-muted">Prüfe Link …</p>;
  if (state === "ok") return <div className="mt-6"><Alert tone="ok">Bestätigt. Sie werden ins Dashboard weitergeleitet.</Alert></div>;
  return <div className="mt-6 space-y-3"><Alert tone="bad">{msg}</Alert><p className="text-sm text-ink-2">Link abgelaufen? <a className="text-accent underline" href="/anmelden">Anmelden</a> und eine neue Bestätigung anfordern.</p></div>;
}

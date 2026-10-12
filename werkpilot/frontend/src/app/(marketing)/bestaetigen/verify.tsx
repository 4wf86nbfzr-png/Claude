"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

export function Verify() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"busy" | "ok" | "err">("busy");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { queueMicrotask(() => { setState("err"); setMsg("Kein Token in der Adresse."); }); return; }
    api<{ message: string; email: string }>("/api/auth/verify-email", { method: "POST", json: { token } })
      .then(() => { setState("ok"); setTimeout(() => router.push("/anmelden?bestaetigt=1"), 1200); })
      .catch((e) => { setState("err"); setMsg(e instanceof ApiError ? String(e.detail) : "Fehler"); });
  }, [params, router]);
  if (state === "busy") return <p className="mt-6 text-sm text-muted">Prüfe Link …</p>;
  if (state === "ok") return <div className="mt-6 space-y-3"><Alert tone="ok">E-Mail-Adresse bestätigt. Bitte melden Sie sich jetzt mit Ihrem Passwort an.</Alert><Button href="/anmelden?bestaetigt=1">Zur Anmeldung</Button></div>;
  return <div className="mt-6 space-y-3"><Alert tone="bad">{msg}</Alert><p className="text-sm text-ink-2">Link abgelaufen? <a className="text-accent underline" href="/anmelden">Anmelden</a> und eine neue Bestätigung anfordern.</p></div>;
}

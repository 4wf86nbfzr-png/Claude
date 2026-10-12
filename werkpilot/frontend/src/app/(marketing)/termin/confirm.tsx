"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { api, ApiError, fmtDate } from "@/lib/api";

type Preview = { starts_at: string; ends_at: string; status: string; business: string };

export function ConfirmAppointment() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    api<Preview>(`/api/public/appointments/confirm?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setErr(e instanceof ApiError ? String(e.detail) : "Link ungültig."));
  }, [token]);
  async function confirm() {
    try { await api("/api/public/appointments/confirm", { method: "POST", json: { token } }); setDone(true); }
    catch (e) { setErr(e instanceof ApiError ? String(e.detail) : "Fehler"); }
  }
  if (!token) return <div className="mt-6"><Alert tone="bad">Kein Token in der Adresse.</Alert></div>;
  if (err) return <div className="mt-6"><Alert tone="bad">{err}</Alert></div>;
  if (done || preview?.status === "confirmed") return <div className="mt-6"><Alert tone="ok">Danke, der Termin am {fmtDate(preview?.starts_at)} ist bestätigt. {preview?.business} meldet sich, falls sich etwas ändert.</Alert></div>;
  if (!preview) return <p className="mt-6 text-sm text-muted">Lade …</p>;
  return (
    <div className="mt-6 space-y-4">
      <p className="text-ink-2">{preview.business} schlägt Ihnen folgenden Termin vor:</p>
      <div className="rounded-xl border border-line bg-paper p-4 text-lg font-medium">{fmtDate(preview.starts_at)} – {new Date(preview.ends_at).toLocaleTimeString("de-DE", { timeStyle: "short" })} Uhr</div>
      <Button onClick={confirm} className="w-full">Diesen Termin bestätigen</Button>
      <p className="text-xs text-muted">Passt der Termin nicht? Antworten Sie einfach auf die E-Mail des Betriebs.</p>
    </div>
  );
}

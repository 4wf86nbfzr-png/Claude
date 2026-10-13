"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { api, ApiError, setSession, getSession } from "@/lib/api";
import { useAuth } from "@/lib/auth";
export function Accept() {
  const params = useSearchParams(); const router = useRouter(); const { user, loading, reload } = useAuth();
  const [msg, setMsg] = useState<string | null>(null);
  const token = params.get("token") ?? "";
  useEffect(() => { try { sessionStorage.setItem("wp_einladung", token); } catch {} }, [token]);
  async function accept() {
    try {
      const r = await api<{ tenant_id: string }>("/api/auth/invitations/accept", { method: "POST", json: { token } });
      const sw = await api<{ access_token: string }>("/api/auth/switch-tenant", { method: "POST", json: { tenant_id: r.tenant_id } });
      setSession(sw.access_token, r.tenant_id); await reload(); router.push("/app");
    } catch (ex) { setMsg(ex instanceof ApiError ? String(ex.detail) : "Fehler"); }
  }
  if (loading) return <p className="mt-6 text-sm text-muted">Lade …</p>;
  if (!user) return <div className="mt-6 space-y-3"><Alert>Bitte zuerst anmelden oder registrieren, mit der Mailadresse, an die die Einladung ging. Danach diesen Link erneut öffnen.</Alert><div className="flex gap-2"><Button href="/anmelden">Anmelden</Button><Button href="/registrieren" variant="secondary">Registrieren</Button></div></div>;
  void getSession;
  return <div className="mt-6 space-y-3">{msg && <Alert tone="bad">{msg}</Alert>}<Button onClick={accept}>Einladung als {user.email} annehmen</Button></div>;
}

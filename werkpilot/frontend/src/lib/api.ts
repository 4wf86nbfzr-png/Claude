"use client";

/** Dünner API-Client. Access-Token im Speicher (+ sessionStorage), Refresh über httpOnly-Cookie. */

let accessToken: string | null = null;
let tenantId: string | null = null;

export function setSession(token: string | null, tenant: string | null) {
  accessToken = token;
  tenantId = tenant;
  try {
    if (token) sessionStorage.setItem("wp_token", token);
    else sessionStorage.removeItem("wp_token");
    if (tenant) sessionStorage.setItem("wp_tenant", tenant);
    else sessionStorage.removeItem("wp_tenant");
    // Merker ohne Geheimnis: Nur wenn er gesetzt ist, fragt die App beim Laden öffentlicher Seiten nach der Sitzung.
    if (token) localStorage.setItem("wp_signed_in", "1");
    else localStorage.removeItem("wp_signed_in");
  } catch {}
}

/** Gibt es Hinweise auf eine Sitzung (Token im Speicher oder Merker vom letzten Login)? */
export function maySignedIn(): boolean {
  if (getSession().accessToken) return true;
  try { return localStorage.getItem("wp_signed_in") === "1"; } catch { return false; }
}

export function getSession() {
  if (!accessToken) {
    try {
      accessToken = sessionStorage.getItem("wp_token");
      tenantId = sessionStorage.getItem("wp_tenant");
    } catch {}
  }
  return { accessToken, tenantId };
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Fehler");
    this.status = status;
    this.detail = detail;
  }
}

async function refresh(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: getSession().tenantId }) });
    if (!r.ok) return false;
    const data = await r.json();
    setSession(data.access_token, data.tenant_id);
    return true;
  } catch {
    return false;
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown; retry?: boolean } = {}): Promise<T> {
  const { json, retry = true, ...rest } = init;
  const { accessToken: tok, tenantId: tid } = getSession();
  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (tok) headers["Authorization"] = `Bearer ${tok}`;
  if (tid) headers["X-Tenant-Id"] = tid;
  const r = await fetch(path, { ...rest, headers, credentials: "include", body: json !== undefined ? JSON.stringify(json) : rest.body });
  if (r.status === 401 && retry && path !== "/api/auth/login") {
    if (await refresh()) return api<T>(path, { ...init, retry: false });
  }
  const ct = r.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await r.json() : await r.text();
  if (!r.ok) throw new ApiError(r.status, (body && (body as { detail?: unknown }).detail) ?? body);
  return body as T;
}

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");
export const fmtDay = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" }) : "–");
export const fmtEur = (cents?: number | null) => (cents == null ? "–" : (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" }));

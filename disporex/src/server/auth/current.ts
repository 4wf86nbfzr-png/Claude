import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, findSession, buildContextFromSession } from "./session";
import type { AuthContext } from "./context";
import type { Permission } from "./permissions";
import { newRequestId } from "../core/ids";

export type CurrentUser = {
  ctx: AuthContext;
  user: { id: string; email: string; name: string; isSystemAdmin: boolean };
};

/**
 * Liefert den angemeldeten Benutzer für Server Components und Server Actions.
 * Pro Request gecacht (React cache), damit Layout und Seite nicht doppelt laden.
 */
export const getCurrent = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const info = await findSession(token);
  if (!info) return null;
  const h = await headers();
  const ctx = await buildContextFromSession(info, { requestId: h.get("x-request-id") ?? newRequestId(), ip: clientIp(h) });
  if (!ctx) return null;
  return { ctx, user: { id: info.user.id, email: info.user.email, name: info.user.name, isSystemAdmin: info.user.isSystemAdmin } };
});

export function clientIp(h: Headers): string | undefined {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim();
  return h.get("x-real-ip") ?? undefined;
}

/** Erzwingt Anmeldung; leitet sonst zur Login-Seite um. */
export async function requireCurrent(...permissions: Permission[]): Promise<CurrentUser> {
  const current = await getCurrent();
  if (!current) redirect("/login");
  if (!current.ctx.tenantId && !current.ctx.isSystemAdmin) redirect("/login?grund=kein-mandant");
  for (const p of permissions) {
    if (!current.ctx.permissions.has(p)) redirect("/keine-berechtigung");
  }
  return current;
}

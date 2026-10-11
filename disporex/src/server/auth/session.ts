import { and, eq, gt, isNull } from "drizzle-orm";
import { withSystem } from "../db/client";
import { sessions, users, memberships, rolePermissionOverrides, tenants } from "../db/schema";
import { randomToken, sha256 } from "../core/crypto";
import { env } from "../core/env";
import { resolvePermissions } from "./permissions";
import type { AuthContext } from "./context";
import { newRequestId } from "../core/ids";

export const SESSION_COOKIE = "drx_session";

export type SessionInfo = {
  sessionId: string;
  userId: string;
  tenantId: string | null;
  expiresAt: Date;
  reauthAt: Date | null;
};

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().SESSION_COOKIE_SECURE || env().APP_ENV === "production",
    path: "/",
    expires,
  };
}

export async function createSession(input: { userId: string; tenantId: string | null; ip?: string; userAgent?: string; reauth?: boolean }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().SESSION_TTL_HOURS * 3_600_000);
  const [row] = await withSystem((tx) =>
    tx
      .insert(sessions)
      .values({
        userId: input.userId,
        tenantId: input.tenantId,
        tokenHash: sha256(token),
        expiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent?.slice(0, 300) ?? null,
        reauthAt: input.reauth ? new Date() : null,
      })
      .returning({ id: sessions.id }),
  );
  if (!row) throw new Error("Sitzung konnte nicht angelegt werden");
  return { token, expiresAt, sessionId: row.id };
}

/** Liefert die Sitzung zum Cookie-Token oder null (abgelaufen, widerrufen, Benutzer gesperrt). */
export async function findSession(token: string | undefined | null): Promise<(SessionInfo & { user: typeof users.$inferSelect }) | null> {
  if (!token || token.length < 20) return null;
  const tokenHash = sha256(token);
  return withSystem(async (tx) => {
    const rows = await tx
      .select({ s: sessions, u: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    if (row.u.status !== "active") return null;
    if (row.u.sessionsInvalidBefore && row.s.createdAt < row.u.sessionsInvalidBefore) return null;
    // Aktivität selten aktualisieren (max. einmal pro 5 Minuten), um Schreiblast zu sparen.
    if (Date.now() - row.s.lastSeenAt.getTime() > 5 * 60_000) {
      await tx.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
    }
    return {
      sessionId: row.s.id,
      userId: row.s.userId,
      tenantId: row.s.tenantId,
      expiresAt: row.s.expiresAt,
      reauthAt: row.s.reauthAt,
      user: row.u,
    };
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await withSystem((tx) => tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId)));
}

export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await withSystem(async (tx) => {
    const all = await tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    for (const s of all) {
      if (s.id === exceptSessionId) continue;
      await tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, s.id));
    }
  });
}

export async function switchSessionTenant(sessionId: string, userId: string, tenantId: string): Promise<boolean> {
  return withSystem(async (tx) => {
    const m = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId), eq(memberships.status, "active")))
      .limit(1);
    if (!m[0]) return false;
    await tx.update(sessions).set({ tenantId }).where(eq(sessions.id, sessionId));
    return true;
  });
}

/**
 * Baut aus Sitzung + Mitgliedschaft den AuthContext.
 * Systemadministratoren ohne Mitgliedschaft erhalten einen Kontext ohne Mandanten (nur Systembereich).
 */
export async function buildContextFromSession(
  info: SessionInfo & { user: typeof users.$inferSelect },
  opts: { requestId?: string; ip?: string } = {},
): Promise<AuthContext | null> {
  return withSystem(async (tx) => {
    let tenantId = info.tenantId;
    if (!tenantId) {
      // Erste aktive Mitgliedschaft als Standard
      const first = await tx
        .select({ tenantId: memberships.tenantId })
        .from(memberships)
        .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
        .where(and(eq(memberships.userId, info.userId), eq(memberships.status, "active"), eq(tenants.status, "active")))
        .limit(1);
      tenantId = first[0]?.tenantId ?? null;
      if (tenantId) await tx.update(sessions).set({ tenantId }).where(eq(sessions.id, info.sessionId));
    }
    if (!tenantId) {
      if (!info.user.isSystemAdmin) return null;
      return {
        kind: "session",
        tenantId: "",
        userId: info.userId,
        userName: info.user.name,
        role: "system",
        permissions: new Set(),
        isSystemAdmin: true,
        employeeId: null,
        customerId: null,
        partnerId: null,
        sessionId: info.sessionId,
        requestId: opts.requestId ?? newRequestId(),
        ip: opts.ip,
        reauthAt: info.reauthAt,
      };
    }
    const m = (
      await tx
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, info.userId), eq(memberships.tenantId, tenantId), eq(memberships.status, "active")))
        .limit(1)
    )[0];
    if (!m) {
      if (!info.user.isSystemAdmin) return null;
      // Systemadmin "betritt" einen Mandanten mit Adminrechten (wird protokolliert).
      const { ROLE_PERMISSIONS } = await import("./permissions");
      return {
        kind: "session",
        tenantId,
        userId: info.userId,
        userName: info.user.name,
        role: "tenant_admin",
        permissions: ROLE_PERMISSIONS.tenant_admin,
        isSystemAdmin: true,
        employeeId: null,
        customerId: null,
        partnerId: null,
        sessionId: info.sessionId,
        requestId: opts.requestId ?? newRequestId(),
        ip: opts.ip,
        reauthAt: info.reauthAt,
      };
    }
    const overrides = await tx
      .select({ permission: rolePermissionOverrides.permission, allowed: rolePermissionOverrides.allowed })
      .from(rolePermissionOverrides)
      .where(and(eq(rolePermissionOverrides.tenantId, tenantId), eq(rolePermissionOverrides.role, m.role)));
    return {
      kind: "session",
      tenantId,
      userId: info.userId,
      userName: info.user.name,
      role: m.role,
      permissions: resolvePermissions(m.role, overrides),
      isSystemAdmin: info.user.isSystemAdmin,
      employeeId: m.employeeId,
      customerId: m.customerId,
      partnerId: m.partnerId,
      sessionId: info.sessionId,
      requestId: opts.requestId ?? newRequestId(),
      ip: opts.ip,
      reauthAt: info.reauthAt,
    };
  });
}

import { and, eq, sql, desc } from "drizzle-orm";
import { withSystem, withTenant } from "../../db/client";
import { users, memberships, invitations, sessions, rolePermissionOverrides, type RoleKey, ROLE_KEYS } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ReauthRequiredError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { isPermission } from "../../auth/permissions";
import { z } from "zod";

export type MemberRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: RoleKey;
  status: string;
  userStatus: string;
  lastLoginAt: Date | null;
  employeeId: string | null;
  customerId: string | null;
  partnerId: string | null;
};

/** Sensible Aktionen verlangen eine Passwortbestätigung innerhalb der letzten 15 Minuten. */
export function requireRecentReauth(ctx: AuthContext): void {
  if (ctx.kind !== "session") return;
  if (!ctx.reauthAt || Date.now() - ctx.reauthAt.getTime() > 15 * 60_000) throw new ReauthRequiredError();
}

export async function listMembers(ctx: AuthContext): Promise<MemberRow[]> {
  requirePermission(ctx, "users:read");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        userStatus: users.status,
        lastLoginAt: users.lastLoginAt,
        employeeId: memberships.employeeId,
        customerId: memberships.customerId,
        partnerId: memberships.partnerId,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.tenantId, ctx.tenantId))
      .orderBy(users.name),
  );
}

export async function listOpenInvitations(ctx: AuthContext) {
  requirePermission(ctx, "users:read");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ id: invitations.id, email: invitations.email, role: invitations.role, expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt, createdAt: invitations.createdAt })
      .from(invitations)
      .where(eq(invitations.tenantId, ctx.tenantId))
      .orderBy(desc(invitations.createdAt))
      .limit(50),
  );
}

export const changeRoleSchema = z.object({ membershipId: z.string().uuid(), role: z.enum(ROLE_KEYS) });

export async function changeMemberRole(ctx: AuthContext, input: z.infer<typeof changeRoleSchema>): Promise<void> {
  requirePermission(ctx, "users:write");
  requireRecentReauth(ctx);
  const data = changeRoleSchema.parse(input);
  await withTenant(ctx.tenantId, async (tx) => {
    const m = (await tx.select().from(memberships).where(and(eq(memberships.id, data.membershipId), eq(memberships.tenantId, ctx.tenantId))).limit(1))[0];
    if (!m) throw new NotFoundError("Mitgliedschaft nicht gefunden");
    if (m.userId === ctx.userId) throw new ValidationError("Die eigene Rolle kann nicht geändert werden.");
    await ensureNotLastAdmin(tx, ctx.tenantId, m.id, data.role);
    await tx.update(memberships).set({ role: data.role }).where(eq(memberships.id, m.id));
    await audit(tx, ctx, { action: "member.role_changed", entityType: "membership", entityId: m.id, before: { role: m.role }, after: { role: data.role } });
  });
}

async function ensureNotLastAdmin(tx: Parameters<Parameters<typeof withTenant>[1]>[0], tenantId: string, membershipId: string, newRole: RoleKey | "suspended") {
  if (newRole === "tenant_admin") return;
  const admins = await tx
    .select({ c: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "tenant_admin"), eq(memberships.status, "active"), sql`${memberships.id} <> ${membershipId}`));
  if ((admins[0]?.c ?? 0) === 0) throw new ConflictError("Es muss mindestens ein aktiver Unternehmensadministrator verbleiben.");
}

export async function setMemberStatus(ctx: AuthContext, membershipId: string, status: "active" | "suspended"): Promise<void> {
  requirePermission(ctx, "users:write");
  requireRecentReauth(ctx);
  await withTenant(ctx.tenantId, async (tx) => {
    const m = (await tx.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.tenantId, ctx.tenantId))).limit(1))[0];
    if (!m) throw new NotFoundError();
    if (m.userId === ctx.userId) throw new ValidationError("Das eigene Konto kann nicht gesperrt werden.");
    if (status === "suspended") await ensureNotLastAdmin(tx, ctx.tenantId, m.id, "suspended");
    await tx.update(memberships).set({ status }).where(eq(memberships.id, m.id));
    await audit(tx, ctx, { action: status === "suspended" ? "member.suspended" : "member.reactivated", entityType: "membership", entityId: m.id });
  });
  if (status === "suspended") {
    // Laufende Sitzungen dieses Benutzers in diesem Mandanten beenden.
    const m = await withSystem((tx) => tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.id, membershipId)).limit(1));
    if (m[0]) await withSystem((tx) => tx.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, m[0]!.userId), eq(sessions.tenantId, ctx.tenantId))));
  }
}

export async function listUserSessions(ctx: AuthContext, userId: string) {
  if (userId !== ctx.userId) requirePermission(ctx, "users:write");
  return withSystem((tx) =>
    tx
      .select({ id: sessions.id, ip: sessions.ip, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, expiresAt: sessions.expiresAt, revokedAt: sessions.revokedAt })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(30),
  );
}

export async function revokeUserSession(ctx: AuthContext, sessionId: string): Promise<void> {
  const s = (await withSystem((tx) => tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)))[0];
  if (!s) throw new NotFoundError();
  if (s.userId !== ctx.userId) {
    requirePermission(ctx, "users:write");
    // Nur Sitzungen von Mitgliedern dieses Mandanten
    const member = await withTenant(ctx.tenantId, (tx) => tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.tenantId, ctx.tenantId))).limit(1));
    if (!member[0]) throw new NotFoundError();
  }
  await withSystem((tx) => tx.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId)));
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "session.revoked", entityType: "session", entityId: sessionId }));
}

export async function listRoleOverrides(ctx: AuthContext) {
  requirePermission(ctx, "settings:read");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(rolePermissionOverrides).where(eq(rolePermissionOverrides.tenantId, ctx.tenantId)));
}

export async function setRoleOverride(ctx: AuthContext, role: RoleKey, permission: string, allowed: boolean | null): Promise<void> {
  requirePermission(ctx, "settings:write");
  requireRecentReauth(ctx);
  if (!isPermission(permission)) throw new ValidationError("Unbekannte Berechtigung");
  if (role === "tenant_admin") throw new ValidationError("Das Administratorprofil ist nicht einschränkbar.");
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.delete(rolePermissionOverrides).where(and(eq(rolePermissionOverrides.tenantId, ctx.tenantId), eq(rolePermissionOverrides.role, role), eq(rolePermissionOverrides.permission, permission)));
    if (allowed !== null) await tx.insert(rolePermissionOverrides).values({ tenantId: ctx.tenantId, role, permission, allowed });
    await audit(tx, ctx, { action: "role_override.set", entityType: "role", after: { role, permission, allowed } });
  });
}

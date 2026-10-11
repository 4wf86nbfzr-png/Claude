import { randomUUID } from "node:crypto";
import { withSystem } from "../src/server/db/client";
import { tenants, users, memberships, type RoleKey } from "../src/server/db/schema";
import { hashPassword } from "../src/server/core/crypto";
import { resolvePermissions } from "../src/server/auth/permissions";
import type { AuthContext } from "../src/server/auth/context";

export type Fixture = { tenantId: string; userId: string; email: string; password: string; ctx: AuthContext };

/** Legt einen Mandanten mit einem Benutzer der angegebenen Rolle an (synthetische Daten). */
export async function makeTenant(role: RoleKey = "tenant_admin", opts: { name?: string; employeeId?: string } = {}): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const email = `user-${suffix}@test.invalid`;
  const password = `Test-Passwort-${suffix}`;
  const passwordHash = await hashPassword(password);
  const r = await withSystem(async (tx) => {
    const [t] = await tx.insert(tenants).values({ name: opts.name ?? `Firma ${suffix}`, slug: `firma-${suffix}`, settings: { timezone: "Europe/Berlin", responseDeadlineHours: 24, minRestHours: 11, maxShiftHours: 12, reconciliationToleranceMinutes: 5 } }).returning();
    const [u] = await tx.insert(users).values({ email, name: `Test ${suffix}`, passwordHash }).returning();
    await tx.insert(memberships).values({ tenantId: t!.id, userId: u!.id, role, employeeId: opts.employeeId ?? null });
    return { tenantId: t!.id, userId: u!.id };
  });
  const ctx: AuthContext = {
    kind: "session",
    tenantId: r.tenantId,
    userId: r.userId,
    userName: `Test ${suffix}`,
    role,
    permissions: resolvePermissions(role),
    isSystemAdmin: false,
    employeeId: opts.employeeId ?? null,
    customerId: null,
    partnerId: null,
    requestId: `test-${suffix}`,
  };
  return { tenantId: r.tenantId, userId: r.userId, email, password, ctx };
}

/** Kontext mit anderer Rolle im selben Mandanten. */
export function asRole(f: Fixture, role: RoleKey, extra: Partial<AuthContext> = {}): AuthContext {
  return { ...f.ctx, role, permissions: resolvePermissions(role), ...extra };
}

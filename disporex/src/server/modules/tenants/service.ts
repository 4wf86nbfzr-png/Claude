import { eq } from "drizzle-orm";
import { withSystem } from "../../db/client";
import { tenants, memberships, type TenantSettings } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { NotFoundError } from "../../core/errors";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { audit } from "../../core/audit";

export const settingsSchema = z.object({
  timezone: z.string().min(1).max(64).default("Europe/Berlin"),
  responseDeadlineHours: z.coerce.number().int().min(1).max(720).default(24),
  minRestHours: z.coerce.number().min(0).max(24).default(11),
  maxShiftHours: z.coerce.number().min(1).max(24).default(12),
  retentionDaysInactiveEmployees: z.coerce.number().int().min(30).max(3650).default(365),
  retentionDaysAuditLogs: z.coerce.number().int().min(30).max(3650).default(730),
  reconciliationToleranceMinutes: z.coerce.number().int().min(0).max(120).default(5),
});

export async function getTenant(tenantId: string) {
  const t = (await withSystem((tx) => tx.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)))[0];
  if (!t) throw new NotFoundError("Mandant nicht gefunden");
  return t;
}

export function effectiveSettings(settings: TenantSettings | null | undefined): z.infer<typeof settingsSchema> {
  return settingsSchema.parse(settings ?? {});
}

export async function updateTenant(ctx: AuthContext, input: { name?: string; settings?: Partial<TenantSettings> }) {
  requirePermission(ctx, "settings:write");
  const before = await getTenant(ctx.tenantId);
  const settings = input.settings ? settingsSchema.parse({ ...before.settings, ...input.settings }) : before.settings;
  const name = input.name?.trim() ? input.name.trim().slice(0, 120) : before.name;
  await withSystem((tx) => tx.update(tenants).set({ name, settings }).where(eq(tenants.id, ctx.tenantId)));
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "tenant.updated", entityType: "tenant", entityId: ctx.tenantId, before: { name: before.name, settings: before.settings }, after: { name, settings } }));
}

/** Mandanten, denen der Benutzer angehört (für den Mandantenwechsel). */
export async function listUserTenants(userId: string) {
  return withSystem((tx) =>
    tx
      .select({ id: tenants.id, name: tenants.name, role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId))
      .orderBy(tenants.name),
  );
}

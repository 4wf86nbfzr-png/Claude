import { and, eq, asc, lte, sql, isNotNull, desc } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { qualifications, employeeQualifications, employees } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError } from "../../core/errors";
import { audit } from "../../core/audit";

export const qualificationSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_-]+$/, "Nur Kleinbuchstaben, Ziffern, - und _"),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  expires: z.boolean().default(false),
});

export async function listQualifications(ctx: AuthContext) {
  requirePermission(ctx, "employees:read");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(qualifications).where(eq(qualifications.tenantId, ctx.tenantId)).orderBy(asc(qualifications.name)));
}

export async function createQualification(ctx: AuthContext, input: z.infer<typeof qualificationSchema>) {
  requirePermission(ctx, "employees:write");
  const data = qualificationSchema.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const dup = await tx.select({ id: qualifications.id }).from(qualifications).where(and(eq(qualifications.tenantId, ctx.tenantId), eq(qualifications.key, data.key))).limit(1);
    if (dup[0]) throw new ConflictError(`Schlüssel „${data.key}“ existiert bereits.`);
    const [row] = await tx.insert(qualifications).values({ tenantId: ctx.tenantId, ...data, description: data.description ?? null }).returning();
    await audit(tx, ctx, { action: "qualification.created", entityType: "qualification", entityId: row!.id, after: data });
    return row!;
  });
}

export async function updateQualification(ctx: AuthContext, id: string, input: Partial<z.infer<typeof qualificationSchema>>) {
  requirePermission(ctx, "employees:write");
  const data = qualificationSchema.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(qualifications).where(and(eq(qualifications.id, id), eq(qualifications.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Qualifikation nicht gefunden");
    const [row] = await tx.update(qualifications).set(data).where(eq(qualifications.id, id)).returning();
    await audit(tx, ctx, { action: "qualification.updated", entityType: "qualification", entityId: id, before, after: row });
    return row!;
  });
}

export async function deleteQualification(ctx: AuthContext, id: string) {
  requirePermission(ctx, "employees:write");
  await withTenant(ctx.tenantId, async (tx) => {
    const used = (await tx.select({ c: sql<number>`count(*)::int` }).from(employeeQualifications).where(eq(employeeQualifications.qualificationId, id)))[0]?.c ?? 0;
    if (used > 0) throw new ConflictError(`Qualifikation ist ${used} Mitarbeitern zugeordnet und kann nicht gelöscht werden.`);
    const res = await tx.delete(qualifications).where(and(eq(qualifications.id, id), eq(qualifications.tenantId, ctx.tenantId))).returning({ id: qualifications.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "qualification.deleted", entityType: "qualification", entityId: id });
  });
}

/** Qualifikationen, die innerhalb von `days` Tagen ablaufen oder abgelaufen sind. */
export async function listExpiringQualifications(ctx: AuthContext, days = 30) {
  requirePermission(ctx, "employees:read");
  const limit = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        id: employeeQualifications.id,
        employeeId: employees.id,
        employeeNumber: employees.employeeNumber,
        firstName: employees.firstName,
        lastName: employees.lastName,
        qualification: qualifications.name,
        validUntil: employeeQualifications.validUntil,
      })
      .from(employeeQualifications)
      .innerJoin(employees, eq(employees.id, employeeQualifications.employeeId))
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .where(and(eq(employeeQualifications.tenantId, ctx.tenantId), eq(employees.status, "active"), isNotNull(employeeQualifications.validUntil), lte(employeeQualifications.validUntil, limit)))
      .orderBy(asc(employeeQualifications.validUntil), desc(employees.lastName)),
  );
}

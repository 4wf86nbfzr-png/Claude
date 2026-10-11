import { and, eq, gte, lte, asc, desc, lt, gt } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "../../db/client";
import { availabilities, employees, shifts } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requireAny, requirePermission } from "../../auth/context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";

export const availabilityInput = z
  .object({
    employeeId: z.string().uuid(),
    kind: z.enum(["available", "unavailable"]),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    note: z.string().trim().max(300).optional().nullable(),
  })
  .refine((a) => a.endsAt > a.startsAt, { message: "Ende muss nach Beginn liegen.", path: ["endsAt"] });

function ensureOwnOrPermission(ctx: AuthContext, employeeId: string) {
  if (ctx.role === "employee") {
    if (ctx.employeeId !== employeeId || !ctx.permissions.has("availability:write_own")) throw new ForbiddenError("Nur eigene Verfügbarkeiten.");
  } else {
    requirePermission(ctx, "availability:write");
  }
}

export async function listAvailabilities(ctx: AuthContext, filter: { employeeId?: string; from?: Date; to?: Date; kind?: "available" | "unavailable" } = {}) {
  requireAny(ctx, "availability:read", "portal:employee");
  const conds = [eq(availabilities.tenantId, ctx.tenantId)];
  if (ctx.role === "employee") conds.push(eq(availabilities.employeeId, ctx.employeeId ?? "00000000-0000-0000-0000-000000000000"));
  else if (filter.employeeId) conds.push(eq(availabilities.employeeId, filter.employeeId));
  if (filter.from) conds.push(gte(availabilities.endsAt, filter.from));
  if (filter.to) conds.push(lte(availabilities.startsAt, filter.to));
  if (filter.kind) conds.push(eq(availabilities.kind, filter.kind));
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ a: availabilities, firstName: employees.firstName, lastName: employees.lastName, employeeNumber: employees.employeeNumber })
      .from(availabilities)
      .innerJoin(employees, eq(employees.id, availabilities.employeeId))
      .where(and(...conds))
      .orderBy(asc(availabilities.startsAt), asc(employees.lastName))
      .limit(500),
  );
}

export async function createAvailability(ctx: AuthContext, input: z.infer<typeof availabilityInput>) {
  const data = availabilityInput.parse(input);
  ensureOwnOrPermission(ctx, data.employeeId);
  return withTenant(ctx.tenantId, async (tx) => {
    const emp = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, ctx.tenantId))).limit(1);
    if (!emp[0]) throw new NotFoundError("Mitarbeiter nicht gefunden");
    if (data.kind === "unavailable") {
      // Hinweis auf bereits geplante Einsätze im Zeitraum (keine Blockade, aber sichtbar)
      const planned = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(and(eq(shifts.employeeId, data.employeeId), lt(shifts.startsAt, data.endsAt), gt(shifts.endsAt, data.startsAt), eq(shifts.status, "confirmed")));
      if (planned.length && ctx.role === "employee") throw new ConflictError(`Im Zeitraum liegen ${planned.length} bestätigte Einsätze. Bitte zuerst mit der Disposition klären.`);
    }
    const [row] = await tx.insert(availabilities).values({ tenantId: ctx.tenantId, ...data, note: data.note ?? null, createdBy: ctx.userId }).returning();
    await audit(tx, ctx, { action: "availability.created", entityType: "availability", entityId: row!.id, after: row });
    return row!;
  });
}

export async function deleteAvailability(ctx: AuthContext, id: string) {
  await withTenant(ctx.tenantId, async (tx) => {
    const row = (await tx.select().from(availabilities).where(and(eq(availabilities.id, id), eq(availabilities.tenantId, ctx.tenantId))).limit(1))[0];
    if (!row) throw new NotFoundError();
    ensureOwnOrPermission(ctx, row.employeeId);
    await tx.delete(availabilities).where(eq(availabilities.id, id));
    await audit(tx, ctx, { action: "availability.deleted", entityType: "availability", entityId: id, before: row });
  });
}

/** Mitarbeiter, die im Zeitraum keine Abwesenheit und keine aktive Schicht haben (für schnelle Vorschläge). */
export async function freeEmployees(ctx: AuthContext, from: Date, to: Date) {
  requirePermission(ctx, "availability:read");
  if (to <= from) throw new ValidationError("Ungültiger Zeitraum");
  return withTenant(ctx.tenantId, async (tx) => {
    const all = await tx.select().from(employees).where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.status, "active"))).orderBy(asc(employees.lastName));
    const away = await tx.select({ employeeId: availabilities.employeeId }).from(availabilities).where(and(eq(availabilities.kind, "unavailable"), lt(availabilities.startsAt, to), gt(availabilities.endsAt, from)));
    const busy = await tx.select({ employeeId: shifts.employeeId }).from(shifts).where(and(lt(shifts.startsAt, to), gt(shifts.endsAt, from), eq(shifts.status, "confirmed")));
    const blocked = new Set([...away.map((a) => a.employeeId), ...busy.map((b) => b.employeeId)]);
    return all.filter((e) => !blocked.has(e.id));
  });
}

export { desc };

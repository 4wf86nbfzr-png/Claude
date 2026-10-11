import { and, eq, sql, desc, asc, ilike, or, gte, inArray } from "drizzle-orm";
import { withTenant, type Tx } from "../../db/client";
import { employees, employeeQualifications, qualifications, employeeNotes, shifts, events, availabilities, memberships, users } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { nextNumber } from "../../core/numbering";
import { toPage, offsetOf, type Page } from "../../core/pagination";
import { employeeInput, employeeListQuery, employeeQualificationInput, type EmployeeInput, type EmployeeListQuery } from "./schema";
import { effectiveSettings, getTenant } from "../tenants/service";
import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import { z } from "zod";

export type Employee = typeof employees.$inferSelect;

export async function listEmployees(ctx: AuthContext, query: Partial<EmployeeListQuery> = {}): Promise<Page<Employee & { qualificationCount: number }>> {
  requirePermission(ctx, "employees:read");
  const q = employeeListQuery.parse(query);
  const conds = [eq(employees.tenantId, ctx.tenantId)];
  if (q.status !== "all") conds.push(eq(employees.status, q.status));
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(or(ilike(employees.firstName, like), ilike(employees.lastName, like), ilike(employees.employeeNumber, like), ilike(employees.email, like), ilike(employees.city, like))!);
  }
  if (q.area) conds.push(sql`${q.area} = any(${employees.areas})`);
  if (q.qualificationId) conds.push(sql`exists (select 1 from employee_qualifications eq where eq.employee_id = ${employees.id} and eq.qualification_id = ${q.qualificationId})`);
  const where = and(...conds);
  const sortCol = { lastName: employees.lastName, employeeNumber: employees.employeeNumber, createdAt: employees.createdAt, status: employees.status }[q.sort];
  const order = q.dir === "asc" ? asc(sortCol) : desc(sortCol);
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({ e: employees, qualificationCount: sql<number>`(select count(*)::int from employee_qualifications eq where eq.employee_id = ${employees.id})` })
      .from(employees)
      .where(where)
      .orderBy(order, asc(employees.firstName))
      .limit(q.pageSize)
      .offset(offsetOf(q));
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(employees).where(where))[0]?.c ?? 0;
    return toPage(
      rows.map((r) => ({ ...r.e, qualificationCount: r.qualificationCount })),
      total,
      q,
    );
  });
}

export async function getEmployee(ctx: AuthContext, id: string) {
  requirePermission(ctx, "employees:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const e = (await tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId))).limit(1))[0];
    if (!e) throw new NotFoundError("Mitarbeiter nicht gefunden");
    const quals = await tx
      .select({ id: employeeQualifications.id, qualificationId: qualifications.id, name: qualifications.name, key: qualifications.key, expires: qualifications.expires, validFrom: employeeQualifications.validFrom, validUntil: employeeQualifications.validUntil, note: employeeQualifications.note })
      .from(employeeQualifications)
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .where(eq(employeeQualifications.employeeId, id))
      .orderBy(asc(qualifications.name));
    const notes = await tx.select({ n: employeeNotes, author: users.name }).from(employeeNotes).leftJoin(users, eq(users.id, employeeNotes.authorId)).where(eq(employeeNotes.employeeId, id)).orderBy(desc(employeeNotes.createdAt)).limit(50);
    const upcoming = await tx
      .select({ id: shifts.id, startsAt: shifts.startsAt, endsAt: shifts.endsAt, status: shifts.status, eventId: events.id, eventName: events.name })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .where(and(eq(shifts.employeeId, id), gte(shifts.endsAt, new Date()), inArray(shifts.status, ["requested", "accepted", "confirmed"])))
      .orderBy(asc(shifts.startsAt))
      .limit(30);
    const past = await tx
      .select({ id: shifts.id, startsAt: shifts.startsAt, endsAt: shifts.endsAt, status: shifts.status, eventId: events.id, eventName: events.name })
      .from(shifts)
      .innerJoin(events, eq(events.id, shifts.eventId))
      .where(and(eq(shifts.employeeId, id), sql`${shifts.endsAt} < now()`))
      .orderBy(desc(shifts.startsAt))
      .limit(20);
    const avail = await tx.select().from(availabilities).where(and(eq(availabilities.employeeId, id), gte(availabilities.endsAt, new Date()))).orderBy(asc(availabilities.startsAt)).limit(30);
    const account = (await tx.select({ userId: memberships.userId, status: memberships.status, email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.employeeId, id))).limit(1))[0] ?? null;
    return { employee: e, qualifications: quals, notes: notes.map((r) => ({ ...r.n, author: r.author })), upcomingShifts: upcoming, pastShifts: past, availabilities: avail, account };
  });
}

async function ensureUniqueNumber(tx: Tx, tenantId: string, employeeNumber: string, exceptId?: string) {
  const dup = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), eq(employees.employeeNumber, employeeNumber), exceptId ? sql`${employees.id} <> ${exceptId}` : sql`true`))
    .limit(1);
  if (dup[0]) throw new ConflictError(`Mitarbeiter-ID „${employeeNumber}“ ist bereits vergeben.`);
}

export async function createEmployee(ctx: AuthContext, input: EmployeeInput): Promise<Employee> {
  requirePermission(ctx, "employees:write");
  const data = employeeInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const employeeNumber = data.employeeNumber?.trim() || (await nextNumber(tx, "employees", "employee_number", ctx.tenantId, "MA"));
    await ensureUniqueNumber(tx, ctx.tenantId, employeeNumber);
    const [row] = await tx
      .insert(employees)
      .values({ tenantId: ctx.tenantId, ...data, employeeNumber, email: data.email ?? null })
      .returning();
    await audit(tx, ctx, { action: "employee.created", entityType: "employee", entityId: row!.id, after: row });
    return row!;
  });
}

export async function updateEmployee(ctx: AuthContext, id: string, input: Partial<EmployeeInput>): Promise<Employee> {
  requirePermission(ctx, "employees:write");
  const data = employeeInput.partial().parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Mitarbeiter nicht gefunden");
    if (data.employeeNumber && data.employeeNumber !== before.employeeNumber) await ensureUniqueNumber(tx, ctx.tenantId, data.employeeNumber, id);
    const { employeeNumber, ...rest } = data;
    const [row] = await tx
      .update(employees)
      .set({ ...rest, ...(employeeNumber ? { employeeNumber } : {}) })
      .where(eq(employees.id, id))
      .returning();
    await audit(tx, ctx, { action: "employee.updated", entityType: "employee", entityId: id, before, after: row });
    return row!;
  });
}

/** Deaktivieren setzt Aufbewahrungsfrist; offene künftige Einsätze werden gemeldet, nicht stillschweigend gelöscht. */
export async function setEmployeeStatus(ctx: AuthContext, id: string, status: "active" | "inactive" | "left", reason?: string) {
  requirePermission(ctx, "employees:write");
  const tenant = await getTenant(ctx.tenantId);
  const settings = effectiveSettings(tenant.settings);
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(employees).where(and(eq(employees.id, id), eq(employees.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError();
    const deactivating = status !== "active";
    const open = deactivating
      ? await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(shifts)
          .where(and(eq(shifts.employeeId, id), gte(shifts.startsAt, new Date()), inArray(shifts.status, ["requested", "accepted", "confirmed"])))
      : [{ c: 0 }];
    if ((open[0]?.c ?? 0) > 0) throw new ConflictError(`Mitarbeiter hat ${open[0]!.c} künftige Einsätze. Bitte zuerst ersetzen oder zurückziehen.`);
    const retainUntil = deactivating ? new Date(Date.now() + settings.retentionDaysInactiveEmployees * 86_400_000).toISOString().slice(0, 10) : null;
    const [row] = await tx
      .update(employees)
      .set({ status, deactivatedAt: deactivating ? new Date() : null, retainUntil })
      .where(eq(employees.id, id))
      .returning();
    await audit(tx, ctx, { action: deactivating ? "employee.deactivated" : "employee.reactivated", entityType: "employee", entityId: id, before: { status: before.status }, after: { status }, reason });
    return row!;
  });
}

export async function addEmployeeNote(ctx: AuthContext, employeeId: string, input: { kind?: "note" | "call" | "email" | "meeting"; body: string }) {
  requirePermission(ctx, "employees:write");
  const body = z.string().trim().min(1).max(4000).parse(input.body);
  return withTenant(ctx.tenantId, async (tx) => {
    const exists = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), eq(employees.tenantId, ctx.tenantId))).limit(1);
    if (!exists[0]) throw new NotFoundError();
    const [row] = await tx.insert(employeeNotes).values({ tenantId: ctx.tenantId, employeeId, authorId: ctx.userId, kind: input.kind ?? "note", body }).returning();
    return row!;
  });
}

export async function setEmployeeQualification(ctx: AuthContext, employeeId: string, input: z.infer<typeof employeeQualificationInput>) {
  requirePermission(ctx, "employees:write");
  const data = employeeQualificationInput.parse(input);
  if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) throw new ValidationError("„Gültig bis“ liegt vor „gültig ab“.");
  return withTenant(ctx.tenantId, async (tx) => {
    const q = (await tx.select().from(qualifications).where(and(eq(qualifications.id, data.qualificationId), eq(qualifications.tenantId, ctx.tenantId))).limit(1))[0];
    if (!q) throw new NotFoundError("Qualifikation nicht gefunden");
    if (q.expires && !data.validUntil) throw new ValidationError(`„${q.name}“ läuft ab – bitte „gültig bis“ angeben.`);
    const [row] = await tx
      .insert(employeeQualifications)
      .values({ tenantId: ctx.tenantId, employeeId, qualificationId: data.qualificationId, validFrom: data.validFrom ?? null, validUntil: data.validUntil ?? null, note: data.note ?? null })
      .onConflictDoUpdate({ target: [employeeQualifications.employeeId, employeeQualifications.qualificationId], set: { validFrom: data.validFrom ?? null, validUntil: data.validUntil ?? null, note: data.note ?? null } })
      .returning();
    await audit(tx, ctx, { action: "employee.qualification_set", entityType: "employee", entityId: employeeId, after: data });
    return row!;
  });
}

export async function removeEmployeeQualification(ctx: AuthContext, employeeId: string, qualificationId: string) {
  requirePermission(ctx, "employees:write");
  await withTenant(ctx.tenantId, async (tx) => {
    await tx.delete(employeeQualifications).where(and(eq(employeeQualifications.employeeId, employeeId), eq(employeeQualifications.qualificationId, qualificationId), eq(employeeQualifications.tenantId, ctx.tenantId)));
    await audit(tx, ctx, { action: "employee.qualification_removed", entityType: "employee", entityId: employeeId, after: { qualificationId } });
  });
}

// ---------------------------------------------------------------------------
// Import / Export (CSV)
// ---------------------------------------------------------------------------
const CSV_COLUMNS = ["employee_number", "first_name", "last_name", "email", "phone", "city", "status", "employment_type", "areas", "qualifications"] as const;

export async function exportEmployeesCsv(ctx: AuthContext): Promise<string> {
  requirePermission(ctx, "employees:export");
  const rows = await withTenant(ctx.tenantId, async (tx) => {
    const list = await tx.select().from(employees).where(eq(employees.tenantId, ctx.tenantId)).orderBy(asc(employees.lastName), asc(employees.firstName));
    const quals = await tx
      .select({ employeeId: employeeQualifications.employeeId, key: qualifications.key })
      .from(employeeQualifications)
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .where(eq(employeeQualifications.tenantId, ctx.tenantId));
    const byEmp = new Map<string, string[]>();
    for (const q of quals) byEmp.set(q.employeeId, [...(byEmp.get(q.employeeId) ?? []), q.key]);
    return list.map((e) => ({
      employee_number: e.employeeNumber,
      first_name: e.firstName,
      last_name: e.lastName,
      email: e.email ?? "",
      phone: e.phone ?? "",
      city: e.city ?? "",
      status: e.status,
      employment_type: e.employmentType ?? "",
      areas: e.areas.join("|"),
      qualifications: (byEmp.get(e.id) ?? []).join("|"),
    }));
  });
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "employee.exported", entityType: "employee", after: { count: rows.length } }));
  return stringifyCsv(rows, { header: true, columns: [...CSV_COLUMNS], delimiter: ";" });
}

export type ImportResult = { created: number; updated: number; skipped: number; errors: { row: number; message: string }[] };

/**
 * CSV-Import (Trennzeichen ; oder , automatisch). Bestehende Mitarbeiter (gleiche
 * Mitarbeiter-ID) werden aktualisiert, neue angelegt. Zeilenfehler werden gesammelt;
 * die Datei wird als Ganzes in einer Transaktion verarbeitet.
 */
export async function importEmployeesCsv(ctx: AuthContext, csv: string, opts: { dryRun?: boolean } = {}): Promise<ImportResult> {
  requirePermission(ctx, "employees:import");
  const delimiter = (csv.split("\n")[0] ?? "").includes(";") ? ";" : ",";
  let records: Record<string, string>[];
  try {
    records = parseCsv(csv, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase().replace(/\s+/g, "_")), delimiter, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true });
  } catch (err) {
    throw new ValidationError(`CSV konnte nicht gelesen werden: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (records.length === 0) throw new ValidationError("Die Datei enthält keine Datenzeilen.");
  if (records.length > 5000) throw new ValidationError("Maximal 5000 Zeilen je Import.");
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  await withTenant(ctx.tenantId, async (tx) => {
    const qualList = await tx.select().from(qualifications).where(eq(qualifications.tenantId, ctx.tenantId));
    const qualByKey = new Map(qualList.map((q) => [q.key, q]));
    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const rowNo = i + 2;
      const parsed = employeeInput.safeParse({
        employeeNumber: r.employee_number || r.mitarbeiter_id || r.personalnummer || null,
        firstName: r.first_name ?? r.vorname ?? "",
        lastName: r.last_name ?? r.nachname ?? "",
        email: r.email || null,
        phone: r.phone || r.telefon || null,
        city: r.city || r.ort || null,
        status: (r.status || "active") as "active",
        employmentType: r.employment_type || r.beschaeftigung || null,
        areas: (r.areas || r.bereiche || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean),
      });
      if (!parsed.success) {
        result.errors.push({ row: rowNo, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
        continue;
      }
      const data = parsed.data;
      const qualKeys = (r.qualifications || r.qualifikationen || "").split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const unknownQ = qualKeys.filter((k) => !qualByKey.has(k));
      if (unknownQ.length) {
        result.errors.push({ row: rowNo, message: `Unbekannte Qualifikation(en): ${unknownQ.join(", ")}` });
        continue;
      }
      if (opts.dryRun) {
        if (data.employeeNumber) {
          const ex = await tx.select({ id: employees.id }).from(employees).where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.employeeNumber, data.employeeNumber))).limit(1);
          if (ex[0]) result.updated++;
          else result.created++;
        } else result.created++;
        continue;
      }
      let employeeId: string;
      const existing = data.employeeNumber ? (await tx.select().from(employees).where(and(eq(employees.tenantId, ctx.tenantId), eq(employees.employeeNumber, data.employeeNumber))).limit(1))[0] : undefined;
      if (existing) {
        await tx.update(employees).set({ firstName: data.firstName, lastName: data.lastName, email: data.email ?? existing.email, phone: data.phone ?? existing.phone, city: data.city ?? existing.city, employmentType: data.employmentType ?? existing.employmentType, areas: data.areas.length ? data.areas : existing.areas }).where(eq(employees.id, existing.id));
        employeeId = existing.id;
        result.updated++;
      } else {
        const employeeNumber = data.employeeNumber || (await nextNumber(tx, "employees", "employee_number", ctx.tenantId, "MA"));
        const [row] = await tx.insert(employees).values({ tenantId: ctx.tenantId, ...data, employeeNumber, email: data.email ?? null }).returning({ id: employees.id });
        employeeId = row!.id;
        result.created++;
      }
      for (const k of qualKeys) {
        await tx.insert(employeeQualifications).values({ tenantId: ctx.tenantId, employeeId, qualificationId: qualByKey.get(k)!.id }).onConflictDoNothing();
      }
    }
    if (!opts.dryRun) await audit(tx, ctx, { action: "employee.imported", entityType: "employee", after: { created: result.created, updated: result.updated, errors: result.errors.length } });
  });
  return result;
}

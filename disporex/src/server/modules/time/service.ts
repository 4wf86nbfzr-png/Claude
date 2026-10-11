import { and, eq, sql, desc, asc, gte, lte, inArray, isNull, lt, gt } from "drizzle-orm";
import { z } from "zod";
import { withTenant, type Tx } from "../../db/client";
import { timeImports, timeRecords, reconciliationItems, timeCorrections, employees, shifts, events, positions, users } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { ConflictError, NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { sha256 } from "../../core/crypto";
import { emitEvent } from "../../core/events";
import { nextNumber } from "../../core/numbering";
import { minutesBetween } from "../../core/time";
import { effectiveSettings, getTenant } from "../tenants/service";
import { parseCsvTimeRecords, parseXlsxTimeRecords, type ParsedRow, type ParseResult } from "./parse";
import { stringify as stringifyCsv } from "csv-stringify/sync";
import { notifyRoles } from "../notifications/service";

export type ImportResult = {
  importId: string;
  reference: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  errors: { row: number; message: string }[];
  unmatchedEmployees: string[];
  reconciliation: { matched: number; deviations: number; unplanned: number; missing: number };
};

export function rowHashFor(tenantId: string, employeeNumber: string, startedAt: Date, endedAt: Date): string {
  return sha256(`${tenantId}|${employeeNumber.trim().toLowerCase()}|${startedAt.toISOString()}|${endedAt.toISOString()}`);
}

export const RECON_KIND_LABELS: Record<string, string> = { match: "Übereinstimmung", deviation: "Abweichung", missing_record: "Nachweis fehlt", unplanned_record: "Nicht geplant" };
export const RECON_STATUS_LABELS: Record<string, string> = { open: "Offen", approved: "Bestätigt", rejected: "Abgelehnt", corrected: "Korrigiert" };

/**
 * Import einer Datei (CSV/XLSX/JSON-Zeilen). Jeder Import erhält eine Kennung und
 * einen Datei-Hash; identische Dateien werden abgewiesen (außer force), identische
 * Zeilen (gleicher Mitarbeiter, Beginn, Ende) werden als Duplikate übersprungen.
 */
export async function importTimeRecords(
  ctx: AuthContext,
  file: { filename: string; data: Buffer; format?: "csv" | "xlsx" | "json" },
  opts: { force?: boolean; columnMapping?: Record<string, string>; rows?: { employeeNumber: string; startedAt: Date; endedAt: Date; breakMinutes?: number }[] } = {},
): Promise<ImportResult> {
  requirePermission(ctx, "time:import");
  const settings = effectiveSettings((await getTenant(ctx.tenantId)).settings);
  const tz = settings.timezone;
  const fileHash = sha256(file.data);
  const format = opts.rows ? "api" : file.format ?? (file.filename.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv");
  let parsed: ParseResult;
  if (opts.rows) {
    parsed = { rows: opts.rows.map((r, i) => ({ row: i + 1, employeeNumber: r.employeeNumber, startedAt: r.startedAt, endedAt: r.endedAt, breakMinutes: r.breakMinutes ?? 0, raw: r as unknown as Record<string, unknown> })), errors: [], columnMapping: {}, totalRows: opts.rows.length };
  } else if (format === "xlsx") parsed = await parseXlsxTimeRecords(file.data, tz, opts.columnMapping);
  else parsed = parseCsvTimeRecords(file.data.toString("utf8"), tz, opts.columnMapping);
  if (parsed.totalRows > 20000) throw new ValidationError("Maximal 20.000 Zeilen je Import.");

  return withTenant(ctx.tenantId, async (tx) => {
    if (!opts.force) {
      const same = (await tx.select({ id: timeImports.id, reference: timeImports.reference }).from(timeImports).where(and(eq(timeImports.tenantId, ctx.tenantId), eq(timeImports.fileHash, fileHash), eq(timeImports.status, "completed"))).limit(1))[0];
      if (same) throw new ConflictError(`Diese Datei wurde bereits importiert (${same.reference}). Erneuter Import nur mit ausdrücklicher Bestätigung.`);
    }
    const year = new Date().getFullYear();
    const reference = await nextNumber(tx, "time_imports", "reference", ctx.tenantId, `IMP-${year}`);
    const [imp] = await tx.insert(timeImports).values({ tenantId: ctx.tenantId, reference, filename: file.filename, format: format === "json" ? "api" : format, fileHash, status: "processing", rowCount: parsed.totalRows, columnMapping: parsed.columnMapping, importedBy: ctx.userId }).returning();

    const empList = await tx.select({ id: employees.id, employeeNumber: employees.employeeNumber }).from(employees).where(eq(employees.tenantId, ctx.tenantId));
    const empByNumber = new Map(empList.map((e) => [e.employeeNumber.trim().toLowerCase(), e.id]));
    const unmatched = new Set<string>();
    let imported = 0;
    let duplicates = 0;
    const insertedIds: string[] = [];
    for (const r of parsed.rows) {
      const employeeId = empByNumber.get(r.employeeNumber.trim().toLowerCase()) ?? null;
      if (!employeeId) unmatched.add(r.employeeNumber);
      const rowHash = rowHashFor(ctx.tenantId, r.employeeNumber, r.startedAt, r.endedAt);
      const ins = await tx
        .insert(timeRecords)
        .values({ tenantId: ctx.tenantId, importId: imp!.id, employeeId, employeeNumberRaw: r.employeeNumber, startedAt: r.startedAt, endedAt: r.endedAt, breakMinutes: r.breakMinutes, source: format === "api" ? "api" : "import", status: employeeId ? "raw" : "unmatched", rowHash, raw: r.raw, createdBy: ctx.userId })
        .onConflictDoNothing({ target: [timeRecords.tenantId, timeRecords.rowHash] })
        .returning({ id: timeRecords.id });
      if (ins[0]) {
        imported++;
        insertedIds.push(ins[0].id);
      } else duplicates++;
    }
    const recon = await reconcileRecords(tx, ctx, insertedIds, settings.reconciliationToleranceMinutes);
    const summary = { errors: parsed.errors, unmatchedEmployees: Array.from(unmatched), warnings: duplicates ? [`${duplicates} Zeilen waren bereits vorhanden und wurden übersprungen.`] : [] };
    await tx.update(timeImports).set({ status: "completed", importedCount: imported, duplicateCount: duplicates, errorCount: parsed.errors.length, summary, completedAt: new Date() }).where(eq(timeImports.id, imp!.id));
    await audit(tx, ctx, { action: "time_import.completed", entityType: "time_import", entityId: imp!.id, after: { reference, imported, duplicates, errors: parsed.errors.length, ...recon } });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "time_import.completed", entityType: "time_import", entityId: imp!.id, payload: { id: imp!.id, reference, filename: file.filename, imported, duplicates, errors: parsed.errors.length, ...recon }, actorUserId: ctx.userId });
    await notifyRoles(tx, ctx.tenantId, ["accounting", "tenant_admin"], {
      kind: "import.completed",
      title: `Zeitnachweis-Import ${reference} abgeschlossen`,
      body: `${imported} Datensätze, ${duplicates} Duplikate, ${parsed.errors.length} Fehler. Abgleich: ${recon.matched} passend, ${recon.deviations} Abweichungen, ${recon.unplanned} ungeplant.`,
      link: `/zeitnachweise/${imp!.id}`,
      priority: recon.deviations > 0 ? "high" : "normal",
      dedupeKey: `import:${imp!.id}`,
    });
    return { importId: imp!.id, reference, totalRows: parsed.totalRows, imported, duplicates, errors: parsed.errors, unmatchedEmployees: Array.from(unmatched), reconciliation: recon };
  });
}

/** Findet die passende Schicht: gleicher Mitarbeiter, Überschneidung mit dem Nachweis, bestätigt/zugesagt. */
async function findShiftFor(tx: Tx, tenantId: string, employeeId: string, startedAt: Date, endedAt: Date) {
  const pad = 4 * 3_600_000;
  const candidates = await tx
    .select()
    .from(shifts)
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.employeeId, employeeId), inArray(shifts.status, ["confirmed", "accepted"]), lt(shifts.startsAt, new Date(endedAt.getTime() + pad)), gt(shifts.endsAt, new Date(startedAt.getTime() - pad))));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.startsAt.getTime() - startedAt.getTime()) - Math.abs(b.startsAt.getTime() - startedAt.getTime()));
  return candidates[0]!;
}

/** Soll-Ist-Abgleich für neu importierte Datensätze; legt/aktualisiert Prüfeinträge an. */
export async function reconcileRecords(tx: Tx, ctx: AuthContext, recordIds: string[], toleranceMinutes: number) {
  const result = { matched: 0, deviations: 0, unplanned: 0, missing: 0 };
  if (recordIds.length === 0) return result;
  const recs = await tx.select().from(timeRecords).where(inArray(timeRecords.id, recordIds));
  const touchedEmployees = new Set<string>();
  let minStart: Date | null = null;
  let maxEnd: Date | null = null;
  for (const r of recs) {
    if (!r.employeeId) continue;
    touchedEmployees.add(r.employeeId);
    if (!minStart || r.startedAt < minStart) minStart = r.startedAt;
    if (!maxEnd || r.endedAt > maxEnd) maxEnd = r.endedAt;
    const shift = await findShiftFor(tx, ctx.tenantId, r.employeeId, r.startedAt, r.endedAt);
    if (!shift) {
      await tx
        .insert(reconciliationItems)
        .values({ tenantId: ctx.tenantId, shiftId: null, timeRecordId: r.id, employeeId: r.employeeId, kind: "unplanned_record", status: "open", actualStart: r.startedAt, actualEnd: r.endedAt, deviationMinutes: minutesBetween(r.startedAt, r.endedAt) - r.breakMinutes })
        .onConflictDoNothing();
      await tx.update(timeRecords).set({ status: "matched" }).where(eq(timeRecords.id, r.id));
      result.unplanned++;
      continue;
    }
    const startDiff = minutesBetween(shift.startsAt, r.startedAt);
    const endDiff = minutesBetween(shift.endsAt, r.endedAt);
    const plannedMin = minutesBetween(shift.startsAt, shift.endsAt) - shift.breakMinutes;
    const actualMin = minutesBetween(r.startedAt, r.endedAt) - r.breakMinutes;
    const deviation = actualMin - plannedMin;
    const kind = Math.abs(startDiff) <= toleranceMinutes && Math.abs(endDiff) <= toleranceMinutes ? "match" : "deviation";
    const existing = (await tx.select().from(reconciliationItems).where(eq(reconciliationItems.shiftId, shift.id)).limit(1))[0];
    const values = {
      timeRecordId: r.id,
      employeeId: r.employeeId,
      kind: kind as "match" | "deviation",
      status: (kind === "match" ? "approved" : "open") as "approved" | "open",
      plannedStart: shift.startsAt,
      plannedEnd: shift.endsAt,
      actualStart: r.startedAt,
      actualEnd: r.endedAt,
      deviationMinutes: deviation,
      approvedStart: kind === "match" ? r.startedAt : null,
      approvedEnd: kind === "match" ? r.endedAt : null,
      approvedBreakMinutes: kind === "match" ? r.breakMinutes : null,
      resolvedBy: kind === "match" ? null : null,
      resolvedAt: kind === "match" ? new Date() : null,
      resolutionNote: kind === "match" ? "Automatisch: innerhalb der Toleranz" : null,
    };
    let itemId: string;
    if (existing) {
      if (existing.status === "approved" || existing.status === "corrected") {
        // Bereits geprüfte Schicht: neuen Nachweis nicht stillschweigend übernehmen
        await tx.update(timeRecords).set({ status: "matched", shiftId: shift.id }).where(eq(timeRecords.id, r.id));
        continue;
      }
      await tx.update(reconciliationItems).set(values).where(eq(reconciliationItems.id, existing.id));
      itemId = existing.id;
    } else {
      const [ins] = await tx.insert(reconciliationItems).values({ tenantId: ctx.tenantId, shiftId: shift.id, ...values }).returning({ id: reconciliationItems.id });
      itemId = ins!.id;
    }
    await tx.update(timeRecords).set({ status: "matched", shiftId: shift.id }).where(eq(timeRecords.id, r.id));
    if (kind === "match") result.matched++;
    else {
      result.deviations++;
      await emitEvent(tx, { tenantId: ctx.tenantId, type: "reconciliation.deviation", entityType: "reconciliation_item", entityId: itemId, payload: { id: itemId, shiftId: shift.id, employeeId: r.employeeId, plannedStart: shift.startsAt, plannedEnd: shift.endsAt, actualStart: r.startedAt, actualEnd: r.endedAt, deviationMinutes: deviation }, actorUserId: ctx.userId });
    }
  }
  // Fehlende Nachweise: alle bestätigten, bereits beendeten Schichten im Importzeitraum ohne Nachweis.
  // Ein späterer Import mit dem passenden Nachweis aktualisiert den offenen Eintrag.
  if (minStart && maxEnd && touchedEmployees.size) {
    const dayStart = new Date(minStart.getTime() - 12 * 3_600_000);
    const dayEnd = new Date(maxEnd.getTime() + 12 * 3_600_000);
    const planned = await tx
      .select({ s: shifts })
      .from(shifts)
      .leftJoin(reconciliationItems, eq(reconciliationItems.shiftId, shifts.id))
      .where(and(eq(shifts.tenantId, ctx.tenantId), eq(shifts.status, "confirmed"), gte(shifts.startsAt, dayStart), lte(shifts.endsAt, dayEnd), lte(shifts.endsAt, new Date()), isNull(reconciliationItems.id)));
    for (const { s } of planned) {
      await tx.insert(reconciliationItems).values({ tenantId: ctx.tenantId, shiftId: s.id, employeeId: s.employeeId, kind: "missing_record", status: "open", plannedStart: s.startsAt, plannedEnd: s.endsAt, deviationMinutes: -(minutesBetween(s.startsAt, s.endsAt) - s.breakMinutes) }).onConflictDoNothing();
      result.missing++;
    }
  }
  return result;
}

export async function listImports(ctx: AuthContext) {
  requirePermission(ctx, "time:read");
  return withTenant(ctx.tenantId, (tx) => tx.select({ i: timeImports, importer: users.name }).from(timeImports).leftJoin(users, eq(users.id, timeImports.importedBy)).where(eq(timeImports.tenantId, ctx.tenantId)).orderBy(desc(timeImports.createdAt)).limit(100));
}

export async function getImport(ctx: AuthContext, id: string) {
  requirePermission(ctx, "time:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const imp = (await tx.select().from(timeImports).where(and(eq(timeImports.id, id), eq(timeImports.tenantId, ctx.tenantId))).limit(1))[0];
    if (!imp) throw new NotFoundError("Import nicht gefunden");
    const recs = await tx
      .select({ r: timeRecords, employeeName: sql<string | null>`case when ${employees.id} is null then null else ${employees.lastName} || ', ' || ${employees.firstName} end`, item: reconciliationItems })
      .from(timeRecords)
      .leftJoin(employees, eq(employees.id, timeRecords.employeeId))
      .leftJoin(reconciliationItems, eq(reconciliationItems.timeRecordId, timeRecords.id))
      .where(eq(timeRecords.importId, id))
      .orderBy(asc(timeRecords.startedAt))
      .limit(2000);
    return { import: imp, records: recs };
  });
}

export const reconListQuery = z.object({
  status: z.enum(["open", "approved", "rejected", "corrected", "all"]).default("open"),
  kind: z.enum(["match", "deviation", "missing_record", "unplanned_record", "all"]).default("all"),
  employeeId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function listReconciliation(ctx: AuthContext, query: Partial<z.infer<typeof reconListQuery>> = {}) {
  requirePermission(ctx, "time:read");
  const q = reconListQuery.parse(query);
  const conds = [eq(reconciliationItems.tenantId, ctx.tenantId)];
  if (q.status !== "all") conds.push(eq(reconciliationItems.status, q.status));
  if (q.kind !== "all") conds.push(eq(reconciliationItems.kind, q.kind));
  if (q.employeeId) conds.push(eq(reconciliationItems.employeeId, q.employeeId));
  if (q.from) conds.push(gte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, q.from));
  if (q.to) conds.push(lte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, q.to));
  const where = and(...conds);
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx
      .select({ it: reconciliationItems, employeeName: sql<string | null>`case when ${employees.id} is null then null else ${employees.lastName} || ', ' || ${employees.firstName} end`, employeeNumber: employees.employeeNumber, eventName: events.name, positionName: positions.name, eventId: events.id })
      .from(reconciliationItems)
      .leftJoin(employees, eq(employees.id, reconciliationItems.employeeId))
      .leftJoin(shifts, eq(shifts.id, reconciliationItems.shiftId))
      .leftJoin(events, eq(events.id, shifts.eventId))
      .leftJoin(positions, eq(positions.id, shifts.positionId))
      .where(where)
      .orderBy(desc(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(reconciliationItems).where(where))[0]?.c ?? 0;
    return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
  });
}

export async function getReconciliationItem(ctx: AuthContext, id: string) {
  requirePermission(ctx, "time:read");
  return withTenant(ctx.tenantId, async (tx) => {
    const it = (await tx.select().from(reconciliationItems).where(and(eq(reconciliationItems.id, id), eq(reconciliationItems.tenantId, ctx.tenantId))).limit(1))[0];
    if (!it) throw new NotFoundError("Prüfeintrag nicht gefunden");
    const corrections = await tx.select({ c: timeCorrections, userName: users.name }).from(timeCorrections).leftJoin(users, eq(users.id, timeCorrections.userId)).where(eq(timeCorrections.reconciliationItemId, id)).orderBy(desc(timeCorrections.createdAt));
    const emp = it.employeeId ? (await tx.select().from(employees).where(eq(employees.id, it.employeeId)).limit(1))[0] : null;
    const shift = it.shiftId ? (await tx.select({ s: shifts, eventName: events.name, positionName: positions.name }).from(shifts).innerJoin(events, eq(events.id, shifts.eventId)).innerJoin(positions, eq(positions.id, shifts.positionId)).where(eq(shifts.id, it.shiftId)).limit(1))[0] : null;
    const record = it.timeRecordId ? (await tx.select().from(timeRecords).where(eq(timeRecords.id, it.timeRecordId)).limit(1))[0] : null;
    return { item: it, corrections, employee: emp ?? null, shift: shift ?? null, record: record ?? null };
  });
}

/** Bestätigung: übernimmt die gemeldeten (oder korrigierten) Zeiten als abrechenbare Ist-Zeit. */
export async function approveItem(ctx: AuthContext, id: string, note?: string) {
  requirePermission(ctx, "time:approve");
  return withTenant(ctx.tenantId, async (tx) => {
    const it = (await tx.select().from(reconciliationItems).where(and(eq(reconciliationItems.id, id), eq(reconciliationItems.tenantId, ctx.tenantId))).limit(1))[0];
    if (!it) throw new NotFoundError();
    if (it.status === "approved") throw new ConflictError("Bereits bestätigt.");
    if (it.kind === "missing_record" && !it.approvedStart) throw new ValidationError("Ohne Zeitnachweis kann nur nach manueller Korrektur (Zeiten eintragen) bestätigt werden.");
    const approvedStart = it.approvedStart ?? it.actualStart;
    const approvedEnd = it.approvedEnd ?? it.actualEnd;
    const record = it.timeRecordId ? (await tx.select().from(timeRecords).where(eq(timeRecords.id, it.timeRecordId)).limit(1))[0] : null;
    const [row] = await tx
      .update(reconciliationItems)
      .set({ status: "approved", approvedStart, approvedEnd, approvedBreakMinutes: it.approvedBreakMinutes ?? record?.breakMinutes ?? 0, resolvedBy: ctx.userId, resolvedAt: new Date(), resolutionNote: note ?? it.resolutionNote })
      .where(eq(reconciliationItems.id, id))
      .returning();
    if (record) await tx.update(timeRecords).set({ status: "reviewed" }).where(eq(timeRecords.id, record.id));
    await audit(tx, ctx, { action: "reconciliation.approved", entityType: "reconciliation_item", entityId: id, after: { approvedStart, approvedEnd }, reason: note });
    await emitEvent(tx, { tenantId: ctx.tenantId, type: "reconciliation.corrected", entityType: "reconciliation_item", entityId: id, payload: { id, status: "approved", shiftId: it.shiftId, approvedStart, approvedEnd }, actorUserId: ctx.userId });
    return row!;
  });
}

export async function rejectItem(ctx: AuthContext, id: string, reason: string) {
  requirePermission(ctx, "time:approve");
  if (!reason?.trim()) throw new ValidationError("Bitte Grund angeben.");
  return withTenant(ctx.tenantId, async (tx) => {
    const it = (await tx.select().from(reconciliationItems).where(and(eq(reconciliationItems.id, id), eq(reconciliationItems.tenantId, ctx.tenantId))).limit(1))[0];
    if (!it) throw new NotFoundError();
    const [row] = await tx.update(reconciliationItems).set({ status: "rejected", resolvedBy: ctx.userId, resolvedAt: new Date(), resolutionNote: reason }).where(eq(reconciliationItems.id, id)).returning();
    if (it.timeRecordId) await tx.update(timeRecords).set({ status: "rejected" }).where(eq(timeRecords.id, it.timeRecordId));
    await audit(tx, ctx, { action: "reconciliation.rejected", entityType: "reconciliation_item", entityId: id, reason });
    return row!;
  });
}

export const correctionInput = z
  .object({
    approvedStart: z.coerce.date(),
    approvedEnd: z.coerce.date(),
    approvedBreakMinutes: z.coerce.number().int().min(0).max(480).default(0),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((c) => c.approvedEnd > c.approvedStart, { message: "Ende muss nach Beginn liegen.", path: ["approvedEnd"] });

/**
 * Manuelle Korrektur mit Protokoll (alt, neu, wer, wann, Begründung). Setzt den
 * Eintrag auf „korrigiert“; die Bestätigung bleibt ein eigener Schritt.
 */
export async function correctItem(ctx: AuthContext, id: string, input: z.infer<typeof correctionInput>) {
  requirePermission(ctx, "time:correct");
  const data = correctionInput.parse(input);
  return withTenant(ctx.tenantId, async (tx) => {
    const it = (await tx.select().from(reconciliationItems).where(and(eq(reconciliationItems.id, id), eq(reconciliationItems.tenantId, ctx.tenantId))).limit(1))[0];
    if (!it) throw new NotFoundError();
    if (it.status === "approved") throw new ConflictError("Bestätigte Einträge können nicht mehr korrigiert werden. Bitte zuerst zurücksetzen (Buchhaltung).");
    const fields: { field: string; oldValue: string | null; newValue: string }[] = [
      { field: "approvedStart", oldValue: (it.approvedStart ?? it.actualStart)?.toISOString() ?? null, newValue: data.approvedStart.toISOString() },
      { field: "approvedEnd", oldValue: (it.approvedEnd ?? it.actualEnd)?.toISOString() ?? null, newValue: data.approvedEnd.toISOString() },
      { field: "approvedBreakMinutes", oldValue: it.approvedBreakMinutes === null ? null : String(it.approvedBreakMinutes), newValue: String(data.approvedBreakMinutes) },
    ].filter((f) => f.oldValue !== f.newValue);
    for (const f of fields) await tx.insert(timeCorrections).values({ tenantId: ctx.tenantId, reconciliationItemId: id, field: f.field, oldValue: f.oldValue, newValue: f.newValue, reason: data.reason, userId: ctx.userId! });
    const plannedMin = it.plannedStart && it.plannedEnd ? minutesBetween(it.plannedStart, it.plannedEnd) : 0;
    const approvedMin = minutesBetween(data.approvedStart, data.approvedEnd) - data.approvedBreakMinutes;
    const [row] = await tx
      .update(reconciliationItems)
      .set({ status: "corrected", approvedStart: data.approvedStart, approvedEnd: data.approvedEnd, approvedBreakMinutes: data.approvedBreakMinutes, deviationMinutes: it.plannedStart ? approvedMin - plannedMin : approvedMin, resolutionNote: data.reason })
      .where(eq(reconciliationItems.id, id))
      .returning();
    await audit(tx, ctx, { action: "reconciliation.corrected", entityType: "reconciliation_item", entityId: id, before: { approvedStart: it.approvedStart, approvedEnd: it.approvedEnd }, after: { approvedStart: data.approvedStart, approvedEnd: data.approvedEnd }, reason: data.reason });
    return row!;
  });
}

/** Zurücksetzen einer Bestätigung (nur Buchhaltung/Admin), protokolliert. */
export async function reopenItem(ctx: AuthContext, id: string, reason: string) {
  requirePermission(ctx, "time:approve");
  if (!reason?.trim()) throw new ValidationError("Bitte Grund angeben.");
  return withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(reconciliationItems).set({ status: "open", resolvedBy: null, resolvedAt: null, resolutionNote: `Zurückgesetzt: ${reason}` }).where(and(eq(reconciliationItems.id, id), eq(reconciliationItems.tenantId, ctx.tenantId))).returning({ id: reconciliationItems.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "reconciliation.reopened", entityType: "reconciliation_item", entityId: id, reason });
  });
}

/** Manueller Zeitnachweis (z. B. telefonische Meldung) – läuft durch denselben Abgleich. */
export async function createManualRecord(ctx: AuthContext, input: { employeeId: string; startedAt: Date; endedAt: Date; breakMinutes?: number; note?: string }) {
  requirePermission(ctx, "time:correct");
  if (input.endedAt <= input.startedAt) throw new ValidationError("Ende muss nach Beginn liegen.");
  const settings = effectiveSettings((await getTenant(ctx.tenantId)).settings);
  return withTenant(ctx.tenantId, async (tx) => {
    const emp = (await tx.select().from(employees).where(and(eq(employees.id, input.employeeId), eq(employees.tenantId, ctx.tenantId))).limit(1))[0];
    if (!emp) throw new NotFoundError("Mitarbeiter nicht gefunden");
    const rowHash = rowHashFor(ctx.tenantId, emp.employeeNumber, input.startedAt, input.endedAt);
    const ins = await tx
      .insert(timeRecords)
      .values({ tenantId: ctx.tenantId, employeeId: emp.id, employeeNumberRaw: emp.employeeNumber, startedAt: input.startedAt, endedAt: input.endedAt, breakMinutes: input.breakMinutes ?? 0, source: "manual", status: "raw", rowHash, raw: { note: input.note ?? null, manual: true }, createdBy: ctx.userId })
      .onConflictDoNothing({ target: [timeRecords.tenantId, timeRecords.rowHash] })
      .returning({ id: timeRecords.id });
    if (!ins[0]) throw new ConflictError("Ein identischer Zeitnachweis existiert bereits.");
    await audit(tx, ctx, { action: "time_record.manual", entityType: "time_record", entityId: ins[0].id, after: input, reason: input.note });
    const recon = await reconcileRecords(tx, ctx, [ins[0].id], settings.reconciliationToleranceMinutes);
    return { recordId: ins[0].id, reconciliation: recon };
  });
}

/** Prüfbericht als CSV (gefilterte Einträge). */
export async function exportReconciliationCsv(ctx: AuthContext, query: Partial<z.infer<typeof reconListQuery>> = {}): Promise<string> {
  requirePermission(ctx, "reports:export");
  const page = await listReconciliation(ctx, { ...query, pageSize: 500, page: 1 });
  const rows = page.items.map(({ it, employeeName, employeeNumber, eventName, positionName }) => ({
    mitarbeiter: employeeName ?? "",
    mitarbeiter_id: employeeNumber ?? "",
    veranstaltung: eventName ?? "",
    position: positionName ?? "",
    art: RECON_KIND_LABELS[it.kind],
    status: RECON_STATUS_LABELS[it.status],
    geplant_von: it.plannedStart?.toISOString() ?? "",
    geplant_bis: it.plannedEnd?.toISOString() ?? "",
    gemeldet_von: it.actualStart?.toISOString() ?? "",
    gemeldet_bis: it.actualEnd?.toISOString() ?? "",
    bestaetigt_von: it.approvedStart?.toISOString() ?? "",
    bestaetigt_bis: it.approvedEnd?.toISOString() ?? "",
    abweichung_minuten: it.deviationMinutes,
    hinweis: it.resolutionNote ?? "",
  }));
  await withTenant(ctx.tenantId, (tx) => audit(tx, ctx, { action: "reconciliation.exported", entityType: "reconciliation_item", after: { count: rows.length, query } }));
  return stringifyCsv(rows, { header: true, delimiter: ";" });
}

export type { ParsedRow };

export const timeRecordListQuery = z.object({
  employeeId: z.string().uuid().optional(),
  importId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(["raw", "matched", "unmatched", "reviewed", "rejected", "all"]).default("all"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

export async function listTimeRecords(ctx: AuthContext, query: Partial<z.infer<typeof timeRecordListQuery>> = {}) {
  requirePermission(ctx, "time:read");
  const q = timeRecordListQuery.parse(query);
  const conds = [eq(timeRecords.tenantId, ctx.tenantId)];
  if (q.employeeId) conds.push(eq(timeRecords.employeeId, q.employeeId));
  if (q.importId) conds.push(eq(timeRecords.importId, q.importId));
  if (q.from) conds.push(gte(timeRecords.endedAt, q.from));
  if (q.to) conds.push(lte(timeRecords.startedAt, q.to));
  if (q.status !== "all") conds.push(eq(timeRecords.status, q.status));
  const where = and(...conds);
  return withTenant(ctx.tenantId, async (tx) => {
    const items = await tx.select().from(timeRecords).where(where).orderBy(desc(timeRecords.startedAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    const total = (await tx.select({ c: sql<number>`count(*)::int` }).from(timeRecords).where(where))[0]?.c ?? 0;
    return { items, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
  });
}

/** Zusammenfassung für Prüfberichte (Zähler je Art und Status, Summe Abweichungen). */
export async function reconciliationSummary(ctx: AuthContext, filter: { from?: Date; to?: Date } = {}) {
  requirePermission(ctx, "time:read");
  const conds = [eq(reconciliationItems.tenantId, ctx.tenantId)];
  if (filter.from) conds.push(gte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, filter.from));
  if (filter.to) conds.push(lte(sql`coalesce(${reconciliationItems.plannedStart}, ${reconciliationItems.actualStart})`, filter.to));
  return withTenant(ctx.tenantId, async (tx) => {
    const rows = await tx
      .select({ kind: reconciliationItems.kind, status: reconciliationItems.status, count: sql<number>`count(*)::int`, deviation: sql<number>`coalesce(sum(${reconciliationItems.deviationMinutes}),0)::int` })
      .from(reconciliationItems)
      .where(and(...conds))
      .groupBy(reconciliationItems.kind, reconciliationItems.status);
    const total = rows.reduce((a, r) => a + r.count, 0);
    const open = rows.filter((r) => r.status === "open").reduce((a, r) => a + r.count, 0);
    return { total, open, byKindAndStatus: rows, generatedAt: new Date(), preliminary: open > 0 };
  });
}

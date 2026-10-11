import { pgTable, text, uuid, integer, timestamp, index, uniqueIndex, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { employees } from "./personnel";
import { shifts } from "./operations";

export const importStatus = pgEnum("import_status", ["pending", "processing", "completed", "failed"]);

/** Ein Importvorgang (eine Datei). Eindeutige Kennung + Datei-Hash gegen Doppelimport. */
export const timeImports = pgTable(
  "time_imports",
  {
    id: id(),
    tenantId: tenantRef(),
    /** Lesbare Kennung, z. B. IMP-2026-000012 */
    reference: text("reference").notNull(),
    filename: text("filename").notNull(),
    format: text("format", { enum: ["csv", "xlsx", "api"] }).notNull(),
    fileHash: text("file_hash").notNull(),
    status: importStatus("status").notNull().default("pending"),
    rowCount: integer("row_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    /** Zeilenfehler, Spaltenzuordnung, Zusammenfassung. */
    summary: jsonb("summary").$type<ImportSummary>(),
    columnMapping: jsonb("column_mapping").$type<Record<string, string>>(),
    importedBy: uuid("imported_by"),
    createdAt: createdAt(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("time_imports_tenant_ref_idx").on(t.tenantId, t.reference), index("time_imports_tenant_hash_idx").on(t.tenantId, t.fileHash)],
);

export type ImportSummary = {
  errors: { row: number; message: string }[];
  unmatchedEmployees: string[];
  warnings?: string[];
};

export const timeRecordStatus = pgEnum("time_record_status", ["raw", "matched", "unmatched", "reviewed", "rejected"]);

/** Importierte Rohdaten je Zeile (unverändert) + Zuordnung. */
export const timeRecords = pgTable(
  "time_records",
  {
    id: id(),
    tenantId: tenantRef(),
    importId: uuid("import_id").references(() => timeImports.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    /** Mitarbeiterkennung, wie in der Quelldatei. */
    employeeNumberRaw: text("employee_number_raw").notNull(),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    source: text("source", { enum: ["import", "manual", "api"] }).notNull().default("import"),
    status: timeRecordStatus("status").notNull().default("raw"),
    /** Fingerabdruck (Mitarbeiter + Beginn + Ende) gegen Doppelbuchung bei erneutem Import. */
    rowHash: text("row_hash").notNull(),
    raw: jsonb("raw"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("time_records_tenant_rowhash_idx").on(t.tenantId, t.rowHash),
    index("time_records_employee_time_idx").on(t.tenantId, t.employeeId, t.startedAt),
    index("time_records_import_idx").on(t.importId),
  ],
);

export const reconciliationKind = pgEnum("reconciliation_kind", ["match", "deviation", "missing_record", "unplanned_record"]);
export const reconciliationStatus = pgEnum("reconciliation_status", ["open", "approved", "rejected", "corrected"]);

/** Ergebnis des Soll-Ist-Abgleichs je Schicht bzw. je unerwartetem Zeitnachweis. */
export const reconciliationItems = pgTable(
  "reconciliation_items",
  {
    id: id(),
    tenantId: tenantRef(),
    shiftId: uuid("shift_id").references(() => shifts.id, { onDelete: "cascade" }),
    timeRecordId: uuid("time_record_id").references(() => timeRecords.id, { onDelete: "set null" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    kind: reconciliationKind("kind").notNull(),
    status: reconciliationStatus("status").notNull().default("open"),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    plannedEnd: timestamp("planned_end", { withTimezone: true }),
    actualStart: timestamp("actual_start", { withTimezone: true }),
    actualEnd: timestamp("actual_end", { withTimezone: true }),
    /** Abweichung in Minuten (positiv = länger gearbeitet als geplant). */
    deviationMinutes: integer("deviation_minutes").notNull().default(0),
    /** Nach Prüfung bestätigte Zeiten (Grundlage für Abrechnung). */
    approvedStart: timestamp("approved_start", { withTimezone: true }),
    approvedEnd: timestamp("approved_end", { withTimezone: true }),
    approvedBreakMinutes: integer("approved_break_minutes"),
    resolvedBy: uuid("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("reconciliation_shift_idx").on(t.shiftId),
    index("reconciliation_tenant_status_idx").on(t.tenantId, t.status, t.kind),
  ],
);

/** Protokoll jeder manuellen Korrektur (Pflichtfelder: alt, neu, wer, wann, Begründung). */
export const timeCorrections = pgTable(
  "time_corrections",
  {
    id: id(),
    tenantId: tenantRef(),
    reconciliationItemId: uuid("reconciliation_item_id").notNull().references(() => reconciliationItems.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason").notNull(),
    userId: uuid("user_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("time_corrections_item_idx").on(t.reconciliationItemId, t.createdAt)],
);

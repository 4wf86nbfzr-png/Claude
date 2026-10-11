import { pgTable, text, uuid, timestamp, date, index, uniqueIndex, jsonb, pgEnum, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { users } from "./tenancy";

export const employeeStatus = pgEnum("employee_status", ["active", "inactive", "applicant", "left"]);

export const employees = pgTable(
  "employees",
  {
    id: id(),
    tenantId: tenantRef(),
    /** Interne Mitarbeiter-ID (z. B. aus der Lohnbuchhaltung), je Mandant eindeutig. */
    employeeNumber: text("employee_number").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    status: employeeStatus("status").notNull().default("active"),
    /** Beschäftigungsform als freier, mandantenseitig gepflegter Schlüssel (keine rechtliche Bewertung). */
    employmentType: text("employment_type"),
    /** Einsatzbereiche, z. B. ["security","gastro"]. */
    areas: text("areas").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    /** Organisatorische Hinweise (z. B. "kein Nachtdienst"). */
    orgNotes: text("org_notes"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    /** Frühester Löschzeitpunkt gemäß Aufbewahrungskonzept. */
    retainUntil: date("retain_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("employees_tenant_number_idx").on(t.tenantId, t.employeeNumber),
    index("employees_tenant_status_idx").on(t.tenantId, t.status),
    index("employees_tenant_name_idx").on(t.tenantId, t.lastName, t.firstName),
  ],
);

export const qualifications = pgTable(
  "qualifications",
  {
    id: id(),
    tenantId: tenantRef(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Läuft diese Qualifikation ab (Nachweis mit Gültigkeitsdatum)? */
    expires: boolean("expires").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("qualifications_tenant_key_idx").on(t.tenantId, t.key)],
);

export const employeeQualifications = pgTable(
  "employee_qualifications",
  {
    id: id(),
    tenantId: tenantRef(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    qualificationId: uuid("qualification_id").notNull().references(() => qualifications.id, { onDelete: "cascade" }),
    validFrom: date("valid_from"),
    validUntil: date("valid_until"),
    documentId: uuid("document_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("employee_qualifications_unique").on(t.employeeId, t.qualificationId),
    index("employee_qualifications_tenant_valid_idx").on(t.tenantId, t.validUntil),
  ],
);

export const availabilityKind = pgEnum("availability_kind", ["available", "unavailable"]);

/** Verfügbarkeiten / Abwesenheiten eines Mitarbeiters als Zeitfenster. */
export const availabilities = pgTable(
  "availabilities",
  {
    id: id(),
    tenantId: tenantRef(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    kind: availabilityKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("availabilities_employee_time_idx").on(t.tenantId, t.employeeId, t.startsAt, t.endsAt)],
);

/** Kommunikationshistorie (Anrufe, Gespräche, Notizen) am Mitarbeiter. */
export const employeeNotes = pgTable(
  "employee_notes",
  {
    id: id(),
    tenantId: tenantRef(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    authorId: uuid("author_id"),
    kind: text("kind", { enum: ["note", "call", "email", "meeting"] }).notNull().default("note"),
    body: text("body").notNull(),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [index("employee_notes_employee_idx").on(t.employeeId, t.createdAt)],
);

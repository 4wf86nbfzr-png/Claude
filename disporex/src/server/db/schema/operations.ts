import { pgTable, text, uuid, integer, timestamp, index, uniqueIndex, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { customers, customerContacts, locations } from "./customers";
import { employees } from "./personnel";
import { users } from "./tenancy";

// ---------------------------------------------------------------------------
// Kundenanfrage (unverbindlich) -> Auftrag (verbindlich) -> Veranstaltung (Durchführung)
// -> Positionen (Bedarf) -> Schichten (einzelne Einsätze von Personen)
// ---------------------------------------------------------------------------

export const requestStatus = pgEnum("request_status", [
  "new",
  "in_review",
  "needs_info",
  "quoted",
  "accepted",
  "declined",
  "converted",
  "duplicate",
]);
export const requestSource = pgEnum("request_source", ["manual", "api", "email", "portal", "ai_draft"]);

export const customerRequests = pgTable(
  "customer_requests",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    status: requestStatus("status").notNull().default("new"),
    source: requestSource("source").notNull().default("manual"),
    title: text("title").notNull(),
    description: text("description"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    locationText: text("location_text"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    headcount: integer("headcount"),
    /** Gewünschte Rollen/Qualifikationen als freie Liste (vor Normalisierung). */
    requestedRoles: jsonb("requested_roles").$type<{ name: string; count?: number; qualifications?: string[] }[]>(),
    /** Fehlende Angaben, die vor Umwandlung geklärt werden müssen. */
    missingFields: text("missing_fields").array().notNull().default(sql`'{}'::text[]`),
    /** Ursprüngliche Rohdaten (API-Payload, E-Mail-Text). */
    rawPayload: jsonb("raw_payload"),
    /** Normalisierter Fingerabdruck zur Duplikaterkennung. */
    dedupeHash: text("dedupe_hash"),
    duplicateOfId: uuid("duplicate_of_id"),
    externalRef: text("external_ref"),
    /** KI-Extraktionsergebnis inkl. Unsicherheiten – nur Entwurf, nie automatisch verbindlich. */
    aiExtraction: jsonb("ai_extraction"),
    convertedEventId: uuid("converted_event_id"),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customer_requests_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    index("customer_requests_dedupe_idx").on(t.tenantId, t.dedupeHash),
    uniqueIndex("customer_requests_external_ref_idx").on(t.tenantId, t.externalRef),
  ],
);

export const eventStatus = pgEnum("event_status", ["draft", "planned", "confirmed", "in_progress", "completed", "cancelled"]);

export const events = pgTable(
  "events",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => customerContacts.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => customerRequests.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: eventStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    setupStartsAt: timestamp("setup_starts_at", { withTimezone: true }),
    teardownEndsAt: timestamp("teardown_ends_at", { withTimezone: true }),
    dresscode: text("dresscode"),
    briefing: text("briefing"),
    meetingPoint: text("meeting_point"),
    specialNotes: text("special_notes"),
    internalNotes: text("internal_notes"),
    billingNotes: text("billing_notes"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("events_tenant_time_idx").on(t.tenantId, t.startsAt),
    index("events_tenant_customer_idx").on(t.tenantId, t.customerId),
    index("events_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const orderStatus = pgEnum("order_status", ["draft", "offered", "confirmed", "changed", "cancelled", "completed"]);

/** Verbindlicher Auftrag zu einer Veranstaltung. */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: tenantRef(),
    orderNumber: text("order_number").notNull(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "restrict" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => customerRequests.id, { onDelete: "set null" }),
    status: orderStatus("status").notNull().default("draft"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by"),
    /** Textuelle Beschreibung/Änderungshinweise nach Bestätigung. */
    notes: text("notes"),
    /** Vom Kunden freigegeben (Kundenportal sieht nur freigegebene Aufträge). */
    releasedToCustomerAt: timestamp("released_to_customer_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("orders_tenant_number_idx").on(t.tenantId, t.orderNumber), index("orders_tenant_customer_idx").on(t.tenantId, t.customerId)],
);

/** Personalbedarf je Rolle innerhalb einer Veranstaltung. */
export const positions = pgTable(
  "positions",
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    headcountRequired: integer("headcount_required").notNull().default(1),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    requiredQualificationIds: uuid("required_qualification_ids").array().notNull().default(sql`'{}'::uuid[]`),
    dresscode: text("dresscode"),
    notes: text("notes"),
    /** Abrechnungsposition (Schlüssel für Stundensatz-Zuordnung). */
    billingCategory: text("billing_category"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("positions_event_idx").on(t.eventId), index("positions_tenant_time_idx").on(t.tenantId, t.startsAt)],
);

export const SHIFT_STATUSES = [
  "open",
  "requested",
  "accepted",
  "declined",
  "no_response",
  "confirmed",
  "withdrawn",
  "replaced",
  "cancelled",
] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
export const shiftStatus = pgEnum("shift_status", SHIFT_STATUSES);

/** Einzelner Einsatz (Slot) einer Position. Ein Slot kann offen sein oder einer Person zugeordnet. */
export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    positionId: uuid("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
    employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
    /** Vom Partner gestellt (Fremdpersonal) – dann kein employeeId nötig. */
    partnerId: uuid("partner_id"),
    partnerStaffName: text("partner_staff_name"),
    status: shiftStatus("status").notNull().default("open"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    breakMinutes: integer("break_minutes").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    responseDeadlineAt: timestamp("response_deadline_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by"),
    /** Bewusst freigegebene Konflikte (protokolliert). */
    conflictOverrideReason: text("conflict_override_reason"),
    conflictOverrideBy: uuid("conflict_override_by"),
    conflictOverrideAt: timestamp("conflict_override_at", { withTimezone: true }),
    replacedByShiftId: uuid("replaced_by_shift_id"),
    /** Wurde dieser Einsatz für den Mitarbeiter freigegeben (sichtbar im Mitarbeiterportal)? */
    releasedToEmployeeAt: timestamp("released_to_employee_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("shifts_tenant_time_idx").on(t.tenantId, t.startsAt, t.endsAt),
    index("shifts_employee_time_idx").on(t.tenantId, t.employeeId, t.startsAt, t.endsAt),
    index("shifts_position_idx").on(t.positionId),
    index("shifts_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/** Nachvollziehbare Statushistorie je Schicht. */
export const shiftStatusHistory = pgTable(
  "shift_status_history",
  {
    id: id(),
    tenantId: tenantRef(),
    shiftId: uuid("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
    fromStatus: shiftStatus("from_status"),
    toStatus: shiftStatus("to_status").notNull(),
    employeeId: uuid("employee_id"),
    actorUserId: uuid("actor_user_id"),
    actorLabel: text("actor_label"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("shift_status_history_shift_idx").on(t.shiftId, t.createdAt)],
);

/** Änderungshistorie an Veranstaltungen nach Bestätigung (fachliche Änderungen). */
export const eventChanges = pgTable(
  "event_changes",
  {
    id: id(),
    tenantId: tenantRef(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("event_changes_event_idx").on(t.eventId, t.createdAt)],
);

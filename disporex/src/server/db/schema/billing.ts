import { pgTable, text, uuid, integer, date, index, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { customers } from "./customers";

/** Stundensätze mit Gültigkeitszeitraum. Historische Sätze werden nie überschrieben, nur beendet. */
export const rateCards = pgTable(
  "rate_cards",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    /** Abrechnungsposition (z. B. "security", "host", "logistics"). Leer = Standardsatz. */
    billingCategory: text("billing_category"),
    label: text("label").notNull(),
    hourlyRateCents: integer("hourly_rate_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("rate_cards_lookup_idx").on(t.tenantId, t.customerId, t.billingCategory, t.validFrom)],
);

/** Zuschlagsregeln als explizite Parameter (Nacht, Sonntag, Feiertag). */
export const surchargeRules = pgTable(
  "surcharge_rules",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["night", "sunday", "holiday", "saturday"] }).notNull(),
    percent: integer("percent").notNull(),
    /** Für Nachtzuschlag: Zeitfenster "22:00" – "06:00". */
    fromTime: text("from_time"),
    toTime: text("to_time"),
    /** Feiertage als ISO-Daten. */
    holidays: jsonb("holidays").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("surcharge_rules_tenant_idx").on(t.tenantId, t.kind)],
);

/** Eingefrorene Abrechnungsgrundlage je Schicht (Snapshot, wird nicht rückwirkend verändert). */
export const billingItems = pgTable(
  "billing_items",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").notNull(),
    eventId: uuid("event_id").notNull(),
    shiftId: uuid("shift_id").notNull(),
    rateCardId: uuid("rate_card_id"),
    billingCategory: text("billing_category"),
    plannedMinutes: integer("planned_minutes").notNull(),
    approvedMinutes: integer("approved_minutes"),
    hourlyRateCents: integer("hourly_rate_cents").notNull(),
    surchargeCents: integer("surcharge_cents").notNull().default(0),
    surchargeDetails: jsonb("surcharge_details").$type<{ rule: string; percent: number; minutes: number; amountCents: number }[]>(),
    totalCents: integer("total_cents").notNull(),
    status: text("status", { enum: ["preliminary", "final"] }).notNull().default("preliminary"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedBy: uuid("finalized_by"),
  },
  (t) => [uniqueIndex("billing_items_shift_idx").on(t.shiftId), index("billing_items_customer_idx").on(t.tenantId, t.customerId, t.status)],
);

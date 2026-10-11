import { pgTable, text, uuid, integer, timestamp, index, pgEnum, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { positions } from "./operations";
import { users } from "./tenancy";

export const partners = pgTable(
  "partners",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    status: text("status", { enum: ["active", "inactive", "pending"] }).notNull().default("active"),
    email: text("email"),
    phone: text("phone"),
    city: text("city"),
    /** Hinterlegte Qualifikationen/Voraussetzungen, die der Partner liefern kann (Qualification-IDs). */
    qualificationIds: uuid("qualification_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** Nachweis-Status (z. B. Bewachungserlaubnis, Haftpflicht) – frei gepflegt. */
    complianceNotes: text("compliance_notes"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("partners_tenant_idx").on(t.tenantId, t.name)],
);

export const partnerContacts = pgTable(
  "partner_contacts",
  {
    id: id(),
    tenantId: tenantRef(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("partner_contacts_partner_idx").on(t.partnerId)],
);

export const partnerOfferStatus = pgEnum("partner_offer_status", ["offered", "accepted", "partially_accepted", "declined", "withdrawn", "fulfilled"]);

/** Angebot einer Position an einen Partner zur (Teil-)Besetzung. */
export const partnerOffers = pgTable(
  "partner_offers",
  {
    id: id(),
    tenantId: tenantRef(),
    partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
    positionId: uuid("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
    headcountRequested: integer("headcount_requested").notNull(),
    headcountCommitted: integer("headcount_committed").notNull().default(0),
    status: partnerOfferStatus("status").notNull().default("offered"),
    /** Welche Informationen der Partner sehen darf (Briefing, Treffpunkt sind Standard; interne Notizen nie). */
    shareBriefing: boolean("share_briefing").notNull().default(true),
    message: text("message"),
    responseNote: text("response_note"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: uuid("responded_by"),
    offeredBy: uuid("offered_by"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("partner_offers_partner_idx").on(t.tenantId, t.partnerId, t.status), index("partner_offers_position_idx").on(t.positionId)],
);

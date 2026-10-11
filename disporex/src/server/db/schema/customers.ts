import { pgTable, text, uuid, boolean, index, uniqueIndex, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { users } from "./tenancy";

export const customerStatus = pgEnum("customer_status", ["lead", "active", "inactive", "blocked"]);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantRef(),
    customerNumber: text("customer_number").notNull(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    status: customerStatus("status").notNull().default("active"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    billingAddress: jsonb("billing_address").$type<Address>(),
    billingEmail: text("billing_email"),
    vatId: text("vat_id"),
    paymentTermsDays: text("payment_terms_days"),
    /** Individuelle Anforderungen (Dresscode-Standards, Sicherheitsvorgaben …). */
    requirements: text("requirements"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_tenant_number_idx").on(t.tenantId, t.customerNumber),
    index("customers_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

export type Address = { street?: string | null; zip?: string | null; city?: string | null; country?: string | null };

export const customerContacts = pgTable(
  "customer_contacts",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("customer_contacts_customer_idx").on(t.customerId)],
);

/** Einsatzorte / Standorte. Optional kundengebunden. */
export const locations = pgTable(
  "locations",
  {
    id: id(),
    tenantId: tenantRef(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    street: text("street"),
    zip: text("zip"),
    city: text("city"),
    country: text("country"),
    /** Hinweise zur Anfahrt, Treffpunkt, Parken. */
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("locations_tenant_idx").on(t.tenantId, t.name)],
);

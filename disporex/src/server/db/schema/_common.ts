import { timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenancy";

/** Primärschlüssel als UUID (serverseitig erzeugt). */
export const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);

/** Pflicht-Mandantenbezug. Jede Geschäftstabelle trägt diese Spalte. */
export const tenantRef = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" });

export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

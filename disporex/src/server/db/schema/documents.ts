import { pgTable, text, uuid, integer, timestamp, index, date, pgEnum, boolean } from "drizzle-orm/pg-core";
import { id, tenantRef, createdAt, updatedAt } from "./_common";

export const documentEntityType = pgEnum("document_entity_type", ["employee", "customer", "partner", "event", "tenant", "request", "time_import"]);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    tenantId: tenantRef(),
    entityType: documentEntityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    category: text("category").notNull().default("general"),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Schlüssel im Speicher (nie öffentlich, nur über signierte Links). */
    storageKey: text("storage_key").notNull(),
    sha256: text("sha256").notNull(),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id"),
    /** Vertraulichkeitsstufe steuert, wer herunterladen darf. */
    confidentiality: text("confidentiality", { enum: ["internal", "confidential", "shared"] }).notNull().default("internal"),
    expiresAt: date("expires_at"),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by"),
    /** Löschfrist nach Aufbewahrungskonzept. */
    retainUntil: date("retain_until"),
    scanned: boolean("scanned").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_entity_idx").on(t.tenantId, t.entityType, t.entityId),
    index("documents_expiry_idx").on(t.tenantId, t.expiresAt),
  ],
);

/** Zeitlich begrenzte Download-Tokens. */
export const documentAccessTokens = pgTable("document_access_tokens", {
  id: id(),
  tenantId: tenantRef(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

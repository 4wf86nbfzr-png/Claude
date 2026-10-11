import { pgTable, text, uuid, integer, timestamp, index, uniqueIndex, jsonb, pgEnum, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, tenantRef, createdAt, updatedAt } from "./_common";
import { users, tenants } from "./tenancy";

// ---------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------
export const notificationChannel = pgEnum("notification_channel", ["in_app", "email", "whatsapp", "sms"]);
export const notificationStatus = pgEnum("notification_status", ["pending", "sent", "failed", "read", "skipped"]);
export const notificationPriority = pgEnum("notification_priority", ["low", "normal", "high", "critical"]);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantRef(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Externer Empfänger (z. B. Mitarbeiter ohne Benutzerkonto, E-Mail/Telefon). */
    recipientAddress: text("recipient_address"),
    channel: notificationChannel("channel").notNull(),
    priority: notificationPriority("priority").notNull().default("normal"),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    status: notificationStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    /** Verhindert Mehrfachmeldungen desselben Anlasses. */
    dedupeKey: text("dedupe_key"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    meta: jsonb("meta"),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.tenantId, t.userId, t.status, t.createdAt),
    uniqueIndex("notifications_dedupe_idx").on(t.tenantId, t.dedupeKey),
    index("notifications_status_idx").on(t.status, t.createdAt),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    tenantId: tenantRef(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** kind -> { in_app: bool, email: bool } */
    prefs: jsonb("prefs").$type<Record<string, { in_app?: boolean; email?: boolean; whatsapp?: boolean }>>().notNull().default(sql`'{}'::jsonb`),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("notification_prefs_unique").on(t.tenantId, t.userId)],
);

// ---------------------------------------------------------------------------
// Domain-Events (Outbox) – Quelle für Webhooks, Automatisierungen, Benachrichtigungen
// ---------------------------------------------------------------------------
export const domainEvents = pgTable(
  "domain_events",
  {
    id: id(),
    tenantId: tenantRef(),
    type: text("type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").notNull(),
    actorUserId: uuid("actor_user_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("domain_events_unprocessed_idx").on(t.processedAt, t.createdAt), index("domain_events_tenant_type_idx").on(t.tenantId, t.type, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Hintergrundjobs (eigene, datenbankgestützte Warteschlange)
// ---------------------------------------------------------------------------
export const jobStatus = pgEnum("job_status", ["queued", "running", "completed", "failed", "dead"]);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    status: jobStatus("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    /** Eindeutigkeit, damit kritische Aktionen nicht doppelt eingeplant werden. */
    dedupeKey: text("dedupe_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("jobs_poll_idx").on(t.status, t.runAt, t.priority), uniqueIndex("jobs_dedupe_idx").on(t.dedupeKey)],
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------
export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** Signaturgeheimnis, verschlüsselt mit APP_ENCRYPTION_KEY. */
    secretEncrypted: text("secret_encrypted").notNull(),
    eventTypes: text("event_types").array().notNull().default(sql`'{}'::text[]`),
    active: boolean("active").notNull().default(true),
    description: text("description"),
    createdBy: uuid("created_by"),
    failureCount: integer("failure_count").notNull().default(0),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("webhook_endpoints_tenant_idx").on(t.tenantId)],
);

export const deliveryStatus = pgEnum("delivery_status", ["pending", "delivered", "failed", "exhausted"]);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    tenantId: tenantRef(),
    endpointId: uuid("endpoint_id").notNull().references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    domainEventId: uuid("domain_event_id"),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    lastResponseSnippet: text("last_response_snippet"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.createdAt), index("webhook_deliveries_status_idx").on(t.status, t.nextAttemptAt)],
);

// ---------------------------------------------------------------------------
// Automatisierungen
// ---------------------------------------------------------------------------
export const automationRules = pgTable(
  "automation_rules",
  {
    id: id(),
    tenantId: tenantRef(),
    name: text("name").notNull(),
    description: text("description"),
    trigger: text("trigger").notNull(),
    conditions: jsonb("conditions").$type<AutomationCondition[]>().notNull().default(sql`'[]'::jsonb`),
    actions: jsonb("actions").$type<AutomationAction[]>().notNull().default(sql`'[]'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    /** Maximale Ausführungen pro Stunde (Schutz vor Schleifen). */
    maxRunsPerHour: integer("max_runs_per_hour").notNull().default(100),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("automation_rules_tenant_trigger_idx").on(t.tenantId, t.trigger, t.enabled)],
);

export type AutomationCondition =
  | { type: "field_present"; field: string }
  | { type: "field_equals"; field: string; value: string | number | boolean }
  | { type: "field_missing"; field: string }
  | { type: "field_gt"; field: string; value: number };

export type AutomationAction =
  | { type: "notify_role"; role: string; title: string; body?: string; priority?: "low" | "normal" | "high" | "critical" }
  | { type: "flag_missing_fields"; fields: string[] }
  | { type: "set_request_status"; status: string }
  | { type: "assign_request_to_user"; userId: string }
  | { type: "webhook"; eventType: string }
  | { type: "ai_extract_request" };

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: id(),
    tenantId: tenantRef(),
    ruleId: uuid("rule_id").notNull().references(() => automationRules.id, { onDelete: "cascade" }),
    domainEventId: uuid("domain_event_id"),
    status: text("status", { enum: ["success", "skipped", "failed"] }).notNull(),
    log: jsonb("log").$type<{ step: string; ok: boolean; message?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    dedupeKey: text("dedupe_key"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [index("automation_runs_rule_idx").on(t.ruleId, t.createdAt), uniqueIndex("automation_runs_dedupe_idx").on(t.dedupeKey)],
);

// ---------------------------------------------------------------------------
// KI-Protokoll und eingehende E-Mails
// ---------------------------------------------------------------------------
export const aiRequests = pgTable(
  "ai_requests",
  {
    id: id(),
    tenantId: tenantRef(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status", { enum: ["success", "failed", "rejected"] }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Kostenschätzung in Mikro-Cent (1/1.000.000 EUR), modellabhängig konfiguriert. */
    costMicros: integer("cost_micros").notNull().default(0),
    durationMs: integer("duration_ms"),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    error: text("error"),
    userId: uuid("user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_requests_tenant_idx").on(t.tenantId, t.createdAt)],
);

export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: id(),
    tenantId: tenantRef(),
    messageId: text("message_id").notNull(),
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    subject: text("subject"),
    bodyText: text("body_text"),
    attachments: jsonb("attachments").$type<{ filename: string; mimeType: string; sizeBytes: number; documentId?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["new", "processed", "ignored", "failed"] }).notNull().default("new"),
    customerId: uuid("customer_id"),
    requestId: uuid("request_id"),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("inbound_emails_message_idx").on(t.tenantId, t.messageId), index("inbound_emails_status_idx").on(t.tenantId, t.status)],
);

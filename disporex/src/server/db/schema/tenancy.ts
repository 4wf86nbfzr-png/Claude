import { pgTable, text, boolean, integer, timestamp, uuid, jsonb, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt } from "./_common";

/**
 * Mandanten (Unternehmen, die DispoRex nutzen).
 * Globale Tabelle ohne RLS – nur über Mitgliedschaft erreichbar.
 */
export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Mandantenweite Einstellungen (Zeitzone, Rückmeldefrist, Arbeitszeitregeln, Aufbewahrung). */
  settings: jsonb("settings").$type<TenantSettings>().notNull().default(sql`'{}'::jsonb`),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type TenantSettings = {
  timezone?: string;
  /** Stunden, die ein Mitarbeiter auf eine Einsatzanfrage reagieren darf. */
  responseDeadlineHours?: number;
  /** Mindest-Ruhezeit zwischen zwei Schichten in Stunden (Warnung, keine Rechtsprüfung). */
  minRestHours?: number;
  /** Maximale Schichtdauer in Stunden (Warnung). */
  maxShiftHours?: number;
  /** Aufbewahrungsfrist für deaktivierte Mitarbeiter in Tagen. */
  retentionDaysInactiveEmployees?: number;
  /** Aufbewahrungsfrist für Audit-Einträge in Tagen. */
  retentionDaysAuditLogs?: number;
  /** Toleranz in Minuten beim Soll-Ist-Abgleich. */
  reconciliationToleranceMinutes?: number;
};

export const userStatus = pgEnum("user_status", ["active", "invited", "locked", "disabled"]);

/** Benutzerkonten (global, ein Konto kann mehreren Mandanten angehören). */
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    isSystemAdmin: boolean("is_system_admin").notNull().default(false),
    status: userStatus("status").notNull().default("active"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    /** Zeitpunkt, ab dem alle älteren Sitzungen ungültig sind (z. B. nach Passwortwechsel). */
    sessionsInvalidBefore: timestamp("sessions_invalid_before", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const ROLE_KEYS = [
  "tenant_admin",
  "dispatcher",
  "operations_lead",
  "hr",
  "accounting",
  "customer",
  "partner",
  "employee",
] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
export const roleKey = pgEnum("role_key", ROLE_KEYS);

/** Mitgliedschaft eines Benutzers in einem Mandanten mit genau einer Rolle. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: roleKey("role").notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    /** Verknüpfung zu Fachobjekt – legt fest, welche Daten ein Mitarbeiter/Kunde/Partner sieht. */
    employeeId: uuid("employee_id"),
    customerId: uuid("customer_id"),
    partnerId: uuid("partner_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_idx").on(t.tenantId, t.userId), index("memberships_user_idx").on(t.userId)],
);

/** Mandantenspezifische Abweichungen vom Standard-Rollenprofil (feingranulare Rechte). */
export const rolePermissionOverrides = pgTable(
  "role_permission_overrides",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    role: roleKey("role").notNull(),
    permission: text("permission").notNull(),
    allowed: boolean("allowed").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("role_overrides_unique").on(t.tenantId, t.role, t.permission)],
);

/** Server-seitige Sitzungen. Im Cookie steht nur ein zufälliges Token, hier der Hash. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** Aktiver Mandant der Sitzung (Benutzer kann wechseln). */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** Zeitpunkt der letzten Re-Authentifizierung (für sensible Aktionen). */
    reauthAt: timestamp("reauth_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleKey("role").notNull(),
    employeeId: uuid("employee_id"),
    customerId: uuid("customer_id"),
    partnerId: uuid("partner_id"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invitations_tenant_idx").on(t.tenantId)],
);

export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  requestedIp: text("requested_ip"),
  createdAt: createdAt(),
});

/** API-Schlüssel für externe Integrationen. Nur Hash gespeichert; Klartext erscheint genau einmal. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Erste Zeichen zur Identifikation in Listen (z. B. "drx_live_ab12"). */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    /** Eingeschränkte Rechte (Permission-Strings), nie mehr als die erstellende Rolle. */
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** Bei Rotation: Vorgängerschlüssel bleibt bis zur Frist gültig. */
    rotatedFromId: uuid("rotated_from_id"),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_tenant_idx").on(t.tenantId)],
);

/** Änderungs- und Sicherheitsprotokoll. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id"),
    actorApiKeyId: uuid("actor_api_key_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
    requestId: text("request_id"),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** Idempotenz-Schlüssel für schreibende API-Aufrufe. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("idempotency_tenant_key_idx").on(t.tenantId, t.key)],
);

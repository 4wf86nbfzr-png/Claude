import { and, eq, sql, desc, isNull, inArray } from "drizzle-orm";
import { withTenant, type Tx } from "../../db/client";
import { notifications, notificationPreferences, memberships, users } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import type { RoleKey } from "../../db/schema";
import { enqueueJob } from "../../jobs/queue";

export type NotifyInput = {
  userId: string;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  priority?: "low" | "normal" | "high" | "critical";
  dedupeKey?: string | null;
  meta?: Record<string, unknown>;
  /** E-Mail zusätzlich (abhängig von Präferenz; Standard: ja bei high/critical). */
  email?: boolean;
};

/**
 * Legt In-App-Benachrichtigung an und – je nach Priorität/Präferenz – einen
 * E-Mail-Versand als Hintergrundjob. Gleicher dedupeKey => keine zweite Meldung.
 */
export async function notifyUser(tx: Tx, tenantId: string, input: NotifyInput): Promise<string | null> {
  const prefRow = (await tx.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, tenantId), eq(notificationPreferences.userId, input.userId))).limit(1))[0];
  const pref = prefRow?.prefs[input.kind] ?? prefRow?.prefs["*"] ?? {};
  const priority = input.priority ?? "normal";
  if (pref.in_app === false && priority !== "critical") return null;

  const inserted = await tx
    .insert(notifications)
    .values({
      tenantId,
      userId: input.userId,
      channel: "in_app",
      priority,
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      status: "sent",
      sentAt: new Date(),
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:in_app` : null,
      meta: input.meta ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  const row = inserted[0];
  if (!row) return null; // Duplikat

  const wantsEmail = input.email ?? (priority === "high" || priority === "critical");
  const emailAllowed = pref.email !== false;
  if (wantsEmail && emailAllowed) {
    const u = (await tx.select({ email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
    if (u) {
      const [mailRow] = await tx
        .insert(notifications)
        .values({
          tenantId,
          userId: input.userId,
          recipientAddress: u.email,
          channel: "email",
          priority,
          kind: input.kind,
          title: input.title,
          body: input.body,
          link: input.link ?? null,
          status: "pending",
          dedupeKey: input.dedupeKey ? `${input.dedupeKey}:email` : null,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      if (mailRow) await enqueueJob(tx, { tenantId, type: "notification.deliver", payload: { notificationId: mailRow.id }, dedupeKey: `notif:${mailRow.id}` });
    }
  }
  return row.id;
}

/** Benachrichtigt alle aktiven Mitglieder mit einer der Rollen. */
export async function notifyRoles(tx: Tx, tenantId: string, roles: RoleKey[], input: Omit<NotifyInput, "userId">): Promise<number> {
  const members = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.status, "active"), inArray(memberships.role, roles)));
  let n = 0;
  for (const m of members) {
    const id = await notifyUser(tx, tenantId, { ...input, userId: m.userId, dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${m.userId}` : null });
    if (id) n++;
  }
  return n;
}

export async function unreadNotificationCount(ctx: AuthContext): Promise<number> {
  if (!ctx.userId) return 0;
  const r = await withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId!), eq(notifications.channel, "in_app"), isNull(notifications.readAt))),
  );
  return r[0]?.c ?? 0;
}

export async function listMyNotifications(ctx: AuthContext, limit = 50) {
  if (!ctx.userId) return [];
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select()
      .from(notifications)
      .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId!), eq(notifications.channel, "in_app")))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );
}

export async function markRead(ctx: AuthContext, id: string | "all"): Promise<void> {
  if (!ctx.userId) return;
  await withTenant(ctx.tenantId, (tx) =>
    tx
      .update(notifications)
      .set({ readAt: new Date(), status: "read" })
      .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId!), isNull(notifications.readAt), id === "all" ? sql`true` : eq(notifications.id, id))),
  );
}

/** Administrative Übersicht fehlgeschlagener Zustellungen. */
export async function listFailedDeliveries(ctx: AuthContext, limit = 100) {
  requirePermission(ctx, "notifications:admin");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({ n: notifications, userName: users.name })
      .from(notifications)
      .leftJoin(users, eq(users.id, notifications.userId))
      .where(and(eq(notifications.tenantId, ctx.tenantId), sql`${notifications.channel} <> 'in_app'`))
      .orderBy(desc(notifications.createdAt))
      .limit(limit),
  );
}

export async function getMyPreferences(ctx: AuthContext) {
  if (!ctx.userId) return {};
  const row = (await withTenant(ctx.tenantId, (tx) => tx.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, ctx.tenantId), eq(notificationPreferences.userId, ctx.userId!))).limit(1)))[0];
  return row?.prefs ?? {};
}

export async function setMyPreferences(ctx: AuthContext, prefs: Record<string, { in_app?: boolean; email?: boolean }>): Promise<void> {
  if (!ctx.userId) return;
  await withTenant(ctx.tenantId, (tx) =>
    tx
      .insert(notificationPreferences)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId!, prefs })
      .onConflictDoUpdate({ target: [notificationPreferences.tenantId, notificationPreferences.userId], set: { prefs } }),
  );
}

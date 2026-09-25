import 'server-only';
import { db } from './db';
import { dispatchWebhook } from './webhooks';
import type { NotificationKind, Role } from '@prisma/client';

/**
 * Benachrichtigungen (Spec 28).
 * `dedupeKey` verhindert, dass derselbe Hinweis bei jedem Job-Durchlauf
 * erneut erscheint ("Dokument läuft ab" soll einmal auftauchen, nicht täglich).
 */
export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
}

export async function notifyUsers(userIds: readonly string[], input: NotifyInput): Promise<number> {
  if (!userIds.length) return 0;
  const result = await db.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

/** Alle Benutzer einer Rolle benachrichtigen – z.B. die gesamte Disposition. */
export async function notifyRoles(roles: readonly Role[], input: NotifyInput): Promise<number> {
  const users = await db.user.findMany({
    where: { role: { in: [...roles] }, active: true, deletedAt: null },
    select: { id: true },
  });
  return notifyUsers(users.map((u) => u.id), input);
}

export const DISPO_ROLES: Role[] = ['SUPERADMIN', 'DISPOSITION', 'GESCHAEFTSFUEHRUNG'];

/** Benachrichtigung an die Disposition plus passender Webhook. */
export async function notifyDispo(input: NotifyInput & { webhookEvent?: string; webhookPayload?: unknown }): Promise<void> {
  await notifyRoles(DISPO_ROLES, input);
  if (input.webhookEvent) {
    await dispatchWebhook(input.webhookEvent, input.webhookPayload ?? { title: input.title, link: input.link });
  }
}

export async function markRead(userId: string, ids: string[]): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

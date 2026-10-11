import { eq, and, lte, isNull, isNotNull } from "drizzle-orm";
import { withSystem, withTenant } from "../db/client";
import { notifications, domainEvents, tenants, employees, employeeQualifications, qualifications } from "../db/schema";
import { sendMail } from "../modules/mail/mailer";
import { logger } from "../core/logger";
import { systemContext } from "../auth/context";
import { expireUnansweredRequests, remindPendingRequests } from "../modules/shifts/service";
import { remindExpiringDocuments, purgeDeletedDocuments } from "../modules/documents/service";
import { notifyRoles } from "../modules/notifications/service";
import { emitEvent } from "../core/events";
import { effectiveSettings } from "../modules/tenants/service";
import { enqueueJob, releaseStaleJobs } from "./queue";
import { dispatchDomainEvent } from "../modules/integrations/dispatch";
import { deliverWebhook } from "../modules/webhooks/service";
import { pollImapInbox, imapConfigured } from "../modules/email/imap";
import type { jobs } from "../db/schema";

export type JobHandler = (job: typeof jobs.$inferSelect) => Promise<void>;

/** E-Mail-Benachrichtigung zustellen; Status und Fehler am Datensatz festhalten. */
const deliverNotification: JobHandler = async (job) => {
  const id = String(job.payload.notificationId ?? "");
  const n = (await withSystem((tx) => tx.select().from(notifications).where(eq(notifications.id, id)).limit(1)))[0];
  if (!n || n.status === "sent" || n.status === "read") return;
  if (n.channel !== "email") {
    await withSystem((tx) => tx.update(notifications).set({ status: "skipped", lastError: `Kanal ${n.channel} nicht konfiguriert` }).where(eq(notifications.id, id)));
    return;
  }
  if (!n.recipientAddress) {
    await withSystem((tx) => tx.update(notifications).set({ status: "failed", lastError: "Keine Empfängeradresse" }).where(eq(notifications.id, id)));
    return;
  }
  const res = await sendMail({ to: n.recipientAddress, subject: `DispoRex: ${n.title}`, text: `${n.body}${n.link ? `\n\n${process.env.APP_URL ?? ""}${n.link}` : ""}` });
  if (res.ok) {
    await withSystem((tx) => tx.update(notifications).set({ status: "sent", sentAt: new Date(), attempts: n.attempts + 1, lastError: null }).where(eq(notifications.id, id)));
    return;
  }
  const attempts = n.attempts + 1;
  const dead = attempts >= job.maxAttempts;
  await withSystem((tx) => tx.update(notifications).set({ status: dead ? "failed" : "pending", attempts, lastError: res.error }).where(eq(notifications.id, id)));
  if (dead && n.tenantId) {
    await withTenant(n.tenantId, async (tx) => {
      await emitEvent(tx, { tenantId: n.tenantId, type: "notification.failed", entityType: "notification", entityId: n.id, payload: { id: n.id, channel: n.channel, error: res.error } });
      await notifyRoles(tx, n.tenantId, ["tenant_admin"], { kind: "notification.failed", title: "E-Mail-Zustellung fehlgeschlagen", body: `${n.title} an ${n.recipientAddress}: ${res.error}`, link: "/einstellungen/zustellung", priority: "high", email: false, dedupeKey: `notif.failed:${n.id}` });
    });
  }
  throw new Error(`E-Mail-Versand fehlgeschlagen: ${res.error}`);
};

/** Domain-Event an Webhooks und Automatisierungen verteilen. */
const dispatchEvent: JobHandler = async (job) => {
  const id = String(job.payload.domainEventId ?? "");
  const ev = (await withSystem((tx) => tx.select().from(domainEvents).where(eq(domainEvents.id, id)).limit(1)))[0];
  if (!ev || ev.processedAt) return;
  await dispatchDomainEvent(ev);
  await withSystem((tx) => tx.update(domainEvents).set({ processedAt: new Date() }).where(eq(domainEvents.id, id)));
};

const webhookDeliver: JobHandler = async (job) => {
  await deliverWebhook(String(job.payload.deliveryId ?? ""), job.attempts, job.maxAttempts);
};

/** Periodische Pflege je Mandant: Fristen, Erinnerungen, Ablaufprüfungen, Aufbewahrung. */
const maintenance: JobHandler = async () => {
  await releaseStaleJobs();
  const all = await withSystem((tx) => tx.select().from(tenants).where(eq(tenants.status, "active")));
  for (const t of all) {
    const ctx = systemContext(t.id, "maintenance");
    try {
      const expired = await expireUnansweredRequests(ctx);
      const reminded = await remindPendingRequests(ctx);
      const docs = await remindExpiringDocuments(ctx);
      const quals = await remindExpiringQualifications(t.id);
      const retention = await flagRetention(t.id, effectiveSettings(t.settings).retentionDaysInactiveEmployees);
      if (expired || reminded || docs || quals || retention) logger.info({ tenantId: t.id, expired, reminded, docs, quals, retention }, "Wartungslauf");
    } catch (err) {
      logger.error({ err, tenantId: t.id }, "Wartungslauf für Mandant fehlgeschlagen");
    }
  }
  const purged = await purgeDeletedDocuments(30);
  if (purged) logger.info({ purged }, "Gelöschte Dokumente endgültig entfernt");
  if (imapConfigured()) {
    try {
      const r = await pollImapInbox();
      if (r.fetched) logger.info(r, "IMAP-Abruf");
    } catch (err) {
      logger.error({ err }, "IMAP-Abruf fehlgeschlagen");
    }
  }
};

async function remindExpiringQualifications(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const limit = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const rows = await tx
      .select({ eq: employeeQualifications, q: qualifications, e: employees })
      .from(employeeQualifications)
      .innerJoin(qualifications, eq(qualifications.id, employeeQualifications.qualificationId))
      .innerJoin(employees, eq(employees.id, employeeQualifications.employeeId))
      .where(and(eq(employeeQualifications.tenantId, tenantId), eq(employees.status, "active"), isNotNull(employeeQualifications.validUntil), lte(employeeQualifications.validUntil, limit)));
    let n = 0;
    for (const r of rows) {
      const id = await notifyRoles(tx, tenantId, ["hr", "tenant_admin"], {
        kind: "document.expiring",
        title: `Qualifikation läuft ab: ${r.e.lastName}, ${r.e.firstName} – ${r.q.name}`,
        body: `Gültig bis ${r.eq.validUntil}.`,
        link: `/mitarbeiter/${r.e.id}`,
        priority: "normal",
        dedupeKey: `qual.expiring:${r.eq.id}:${r.eq.validUntil}`,
      });
      if (id) {
        n++;
        await emitEvent(tx, { tenantId, type: "qualification.expiring", entityType: "employee", entityId: r.e.id, payload: { employeeId: r.e.id, qualification: r.q.key, validUntil: r.eq.validUntil } });
      }
    }
    return n;
  });
}

/** Mitarbeiter, deren Aufbewahrungsfrist abgelaufen ist, zur Löschprüfung melden (keine automatische Löschung). */
async function flagRetention(tenantId: string, _days: number): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const today = new Date().toISOString().slice(0, 10);
    const due = await tx.select().from(employees).where(and(eq(employees.tenantId, tenantId), isNotNull(employees.retainUntil), lte(employees.retainUntil, today), isNull(employees.userId)));
    let n = 0;
    for (const e of due) {
      const id = await notifyRoles(tx, tenantId, ["tenant_admin", "hr"], {
        kind: "retention.due",
        title: `Löschfrist erreicht: ${e.lastName}, ${e.firstName}`,
        body: `Der Datensatz ist seit ${e.retainUntil} zur Löschung vorgesehen. Bitte prüfen und löschen oder Frist verlängern.`,
        link: `/mitarbeiter/${e.id}`,
        priority: "normal",
        dedupeKey: `retention:${e.id}:${e.retainUntil}`,
      });
      if (id) n++;
    }
    return n;
  });
}

export const handlers: Record<string, JobHandler> = {
  "notification.deliver": deliverNotification,
  "domain_event.dispatch": dispatchEvent,
  "webhook.deliver": webhookDeliver,
  maintenance,
};

/** Wartungsjob einplanen (dedupliziert über Zeitfenster). */
export async function scheduleMaintenance(intervalMinutes = 5): Promise<void> {
  const slot = Math.floor(Date.now() / (intervalMinutes * 60_000));
  await withSystem((tx) => enqueueJob(tx, { type: "maintenance", dedupeKey: `maintenance:${slot}`, maxAttempts: 1, priority: -10 }));
}

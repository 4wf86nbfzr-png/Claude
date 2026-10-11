import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant, withSystem } from "../../db/client";
import { webhookEndpoints, webhookDeliveries, type domainEvents } from "../../db/schema";
import type { AuthContext } from "../../auth/context";
import { requirePermission } from "../../auth/context";
import { NotFoundError, ValidationError } from "../../core/errors";
import { audit } from "../../core/audit";
import { encryptSecret, decryptSecret, randomToken, hmacSha256 } from "../../core/crypto";
import { env } from "../../core/env";
import { enqueueJob } from "../../jobs/queue";
import { validateWebhookUrl } from "./ssrf";
import { DOMAIN_EVENT_TYPES } from "../../core/events";
import { logger } from "../../core/logger";

export const endpointInput = z.object({
  name: z.string().trim().min(2).max(80),
  url: z.string().trim().url().max(500),
  eventTypes: z.array(z.string()).min(1).max(50),
  description: z.string().trim().max(500).optional().nullable(),
});

const MAX_CONSECUTIVE_FAILURES = 50;

function requireHttps() {
  return env().APP_ENV === "production";
}

export async function listEndpoints(ctx: AuthContext) {
  requirePermission(ctx, "webhooks:manage");
  return withTenant(ctx.tenantId, (tx) =>
    tx
      .select({
        id: webhookEndpoints.id,
        name: webhookEndpoints.name,
        url: webhookEndpoints.url,
        eventTypes: webhookEndpoints.eventTypes,
        active: webhookEndpoints.active,
        description: webhookEndpoints.description,
        failureCount: webhookEndpoints.failureCount,
        disabledAt: webhookEndpoints.disabledAt,
        createdAt: webhookEndpoints.createdAt,
        deliveries: sql<number>`(select count(*)::int from webhook_deliveries d where d.endpoint_id = ${webhookEndpoints.id})`,
        failed: sql<number>`(select count(*)::int from webhook_deliveries d where d.endpoint_id = ${webhookEndpoints.id} and d.status in ('failed','exhausted'))`,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.tenantId, ctx.tenantId))
      .orderBy(webhookEndpoints.createdAt),
  );
}

/** Legt einen Endpunkt an; das Signaturgeheimnis wird genau einmal zurückgegeben. */
export async function createEndpoint(ctx: AuthContext, input: z.infer<typeof endpointInput>) {
  requirePermission(ctx, "webhooks:manage");
  const data = endpointInput.parse(input);
  const unknown = data.eventTypes.filter((t) => t !== "*" && !(DOMAIN_EVENT_TYPES as readonly string[]).includes(t));
  if (unknown.length) throw new ValidationError(`Unbekannte Ereignistypen: ${unknown.join(", ")}`);
  await validateWebhookUrl(data.url, { requireHttps: requireHttps() });
  const secret = `whsec_${randomToken(32)}`;
  const row = await withTenant(ctx.tenantId, async (tx) => {
    const [r] = await tx.insert(webhookEndpoints).values({ tenantId: ctx.tenantId, name: data.name, url: data.url, eventTypes: data.eventTypes, description: data.description ?? null, secretEncrypted: encryptSecret(secret), createdBy: ctx.userId }).returning();
    await audit(tx, ctx, { action: "webhook.created", entityType: "webhook", entityId: r!.id, after: { name: data.name, url: data.url, eventTypes: data.eventTypes } });
    return r!;
  });
  return { endpoint: row, secret };
}

export async function updateEndpoint(ctx: AuthContext, id: string, input: Partial<z.infer<typeof endpointInput>> & { active?: boolean }) {
  requirePermission(ctx, "webhooks:manage");
  const data = endpointInput.partial().extend({ active: z.boolean().optional() }).parse(input);
  if (data.url) await validateWebhookUrl(data.url, { requireHttps: requireHttps() });
  return withTenant(ctx.tenantId, async (tx) => {
    const before = (await tx.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId))).limit(1))[0];
    if (!before) throw new NotFoundError("Webhook nicht gefunden");
    const [row] = await tx
      .update(webhookEndpoints)
      .set({ ...data, description: data.description === undefined ? before.description : data.description, ...(data.active ? { failureCount: 0, disabledAt: null } : {}) })
      .where(eq(webhookEndpoints.id, id))
      .returning();
    await audit(tx, ctx, { action: "webhook.updated", entityType: "webhook", entityId: id, before: { url: before.url, eventTypes: before.eventTypes, active: before.active }, after: { url: row!.url, eventTypes: row!.eventTypes, active: row!.active } });
    return row!;
  });
}

export async function rotateEndpointSecret(ctx: AuthContext, id: string): Promise<string> {
  requirePermission(ctx, "webhooks:manage");
  const secret = `whsec_${randomToken(32)}`;
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.update(webhookEndpoints).set({ secretEncrypted: encryptSecret(secret) }).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId))).returning({ id: webhookEndpoints.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "webhook.secret_rotated", entityType: "webhook", entityId: id });
  });
  return secret;
}

export async function deleteEndpoint(ctx: AuthContext, id: string) {
  requirePermission(ctx, "webhooks:manage");
  await withTenant(ctx.tenantId, async (tx) => {
    const res = await tx.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, ctx.tenantId))).returning({ id: webhookEndpoints.id });
    if (!res[0]) throw new NotFoundError();
    await audit(tx, ctx, { action: "webhook.deleted", entityType: "webhook", entityId: id });
  });
}

export async function listDeliveries(ctx: AuthContext, endpointId: string, limit = 100) {
  requirePermission(ctx, "webhooks:manage");
  return withTenant(ctx.tenantId, (tx) => tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.endpointId, endpointId), eq(webhookDeliveries.tenantId, ctx.tenantId))).orderBy(desc(webhookDeliveries.createdAt)).limit(limit));
}

export async function retryDelivery(ctx: AuthContext, deliveryId: string) {
  requirePermission(ctx, "webhooks:manage");
  await withTenant(ctx.tenantId, async (tx) => {
    const d = (await tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.tenantId, ctx.tenantId))).limit(1))[0];
    if (!d) throw new NotFoundError();
    await tx.update(webhookDeliveries).set({ status: "pending", attempts: 0, lastError: null }).where(eq(webhookDeliveries.id, d.id));
    await enqueueJob(tx, { tenantId: ctx.tenantId, type: "webhook.deliver", payload: { deliveryId: d.id }, dedupeKey: `wh:${d.id}:${Date.now()}` });
    await audit(tx, ctx, { action: "webhook.delivery_retried", entityType: "webhook_delivery", entityId: d.id });
  });
}

/** Legt für jeden passenden Endpunkt eine Zustellung an und plant den Versand ein. */
export async function fanOutWebhooks(ev: typeof domainEvents.$inferSelect): Promise<number> {
  return withTenant(ev.tenantId, async (tx) => {
    const eps = await tx.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.tenantId, ev.tenantId), eq(webhookEndpoints.active, true)));
    let n = 0;
    for (const ep of eps) {
      if (!ep.eventTypes.includes("*") && !ep.eventTypes.includes(ev.type)) continue;
      const [d] = await tx
        .insert(webhookDeliveries)
        .values({ tenantId: ev.tenantId, endpointId: ep.id, domainEventId: ev.id, eventType: ev.type, payload: { id: ev.id, type: ev.type, createdAt: ev.createdAt, data: ev.payload }, status: "pending" })
        .returning({ id: webhookDeliveries.id });
      await enqueueJob(tx, { tenantId: ev.tenantId, type: "webhook.deliver", payload: { deliveryId: d!.id }, dedupeKey: `wh:${d!.id}`, maxAttempts: 8 });
      n++;
    }
    return n;
  });
}

export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

/** Prüft eine Signatur (für Empfänger und Tests). */
export function verifyWebhookSignature(secret: string, header: string, body: string, toleranceSec = 300, now = Date.now()): boolean {
  const m = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(header);
  if (!m) return false;
  const ts = Number(m[1]);
  if (Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const expected = hmacSha256(secret, `${ts}.${body}`);
  return expected.length === m[2]!.length && expected === m[2];
}

/** Führt eine Zustellung aus (vom Worker aufgerufen). Wirft bei Fehlschlag, damit der Job erneut eingeplant wird. */
export async function deliverWebhook(deliveryId: string, attempt: number, maxAttempts: number): Promise<void> {
  const row = await withSystem(async (tx) => {
    const d = (await tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1))[0];
    if (!d) return null;
    const ep = (await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, d.endpointId)).limit(1))[0];
    return ep ? { d, ep } : null;
  });
  if (!row) return;
  const { d, ep } = row;
  if (d.status === "delivered") return;
  if (!ep.active) {
    await withSystem((tx) => tx.update(webhookDeliveries).set({ status: "failed", lastError: "Endpunkt deaktiviert" }).where(eq(webhookDeliveries.id, d.id)));
    return;
  }
  const body = JSON.stringify(d.payload);
  const ts = Math.floor(Date.now() / 1000);
  let statusCode: number | null = null;
  let error: string | null = null;
  let snippet: string | null = null;
  try {
    const { url, ip } = await validateWebhookUrl(ep.url, { requireHttps: requireHttps() });
    void ip;
    const secret = decryptSecret(ep.secretEncrypted);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "DispoRex-Webhooks/1", "x-disporex-signature": signWebhook(secret, ts, body), "x-disporex-event": d.eventType, "x-disporex-delivery": d.id, "x-disporex-timestamp": String(ts) },
        body,
        signal: controller.signal,
        redirect: "manual",
      });
      statusCode = res.status;
      snippet = (await res.text().catch(() => "")).slice(0, 500);
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const attempts = d.attempts + 1;
  if (!error) {
    await withSystem(async (tx) => {
      await tx.update(webhookDeliveries).set({ status: "delivered", attempts, lastStatusCode: statusCode, lastResponseSnippet: snippet, deliveredAt: new Date(), lastError: null }).where(eq(webhookDeliveries.id, d.id));
      await tx.update(webhookEndpoints).set({ failureCount: 0 }).where(eq(webhookEndpoints.id, ep.id));
    });
    return;
  }
  const exhausted = attempt >= maxAttempts;
  await withSystem(async (tx) => {
    await tx.update(webhookDeliveries).set({ status: exhausted ? "exhausted" : "failed", attempts, lastStatusCode: statusCode, lastError: error, lastResponseSnippet: snippet, nextAttemptAt: exhausted ? null : new Date(Date.now() + Math.min(3600, 2 ** attempt * 15) * 1000) }).where(eq(webhookDeliveries.id, d.id));
    const fc = ep.failureCount + 1;
    const disable = fc >= MAX_CONSECUTIVE_FAILURES;
    await tx.update(webhookEndpoints).set({ failureCount: fc, ...(disable ? { active: false, disabledAt: new Date() } : {}) }).where(eq(webhookEndpoints.id, ep.id));
    if (disable) logger.warn({ endpointId: ep.id }, "Webhook nach wiederholten Fehlern deaktiviert");
  });
  throw new Error(`Webhook-Zustellung fehlgeschlagen: ${error}`);
}

export { inArray };

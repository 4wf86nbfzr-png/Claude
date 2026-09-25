import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db';

/**
 * Ausgehende Webhooks (Spec 42).
 * Jede Auslieferung wird signiert (HMAC-SHA256 über Zeitstempel + Rumpf)
 * und protokolliert, damit ein Empfänger Wiederholungen erkennen kann.
 */
export const WEBHOOK_EVENTS = [
  'request.created',
  'event.created',
  'event.updated',
  'assignment.created',
  'assignment.confirmed',
  'assignment.declined',
  'reconciliation.closed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifySignature(secret: string, timestamp: number, body: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(secret, timestamp, body), 'utf8');
  const given = Buffer.from(signature, 'utf8');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Stellt ein Ereignis an alle passenden Empfänger zu.
 * Fehler werden protokolliert, aber nie an den Aufrufer durchgereicht:
 * ein nicht erreichbarer Fremddienst darf keine Disposition blockieren.
 */
export async function dispatchWebhook(event: string, payload: unknown): Promise<void> {
  let hooks;
  try {
    hooks = await db.webhook.findMany({ where: { active: true, events: { has: event } } });
  } catch (error) {
    console.error('[HST Planer] Webhooks konnten nicht gelesen werden:', error);
    return;
  }
  if (!hooks.length) return;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  const ts = Math.floor(Date.now() / 1000);

  await Promise.all(hooks.map(async (hook) => {
    const delivery = await db.webhookDelivery.create({
      data: { webhookId: hook.id, event, payload: JSON.parse(body), attempts: 1 },
    });
    try {
      const response = await fetch(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hst-event': event,
          'x-hst-timestamp': String(ts),
          'x-hst-signature': signPayload(hook.secret, ts, body),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: response.status, deliveredAt: response.ok ? new Date() : null, error: response.ok ? null : `HTTP ${response.status}` },
      });
    } catch (error) {
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }));
}

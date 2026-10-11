import { env } from "./env";
import { logger } from "./logger";

/**
 * Fehlerüberwachung: strukturiertes Log immer; zusätzlich Versand an einen
 * Sentry-kompatiblen Endpunkt (Envelope-API), wenn SENTRY_DSN gesetzt ist.
 * Kein SDK nötig; Payload enthält keine Personendaten, nur Fehler und Kontext-IDs.
 */
export async function captureError(err: unknown, context: { requestId?: string; route?: string; tenantId?: string; kind?: string } = {}): Promise<void> {
  const e = err instanceof Error ? err : new Error(String(err));
  logger.error({ err: e, ...context }, "Fehler erfasst");
  const dsn = env().SENTRY_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, "");
    const key = u.username;
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/envelope/`;
    const eventId = globalThis.crypto.randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      environment: env().APP_ENV,
      release: process.env.npm_package_version ?? "0.1.0",
      tags: { route: context.route ?? "", kind: context.kind ?? "" },
      extra: { requestId: context.requestId, tenantId: context.tenantId },
      exception: { values: [{ type: e.name, value: e.message, stacktrace: { frames: (e.stack ?? "").split("\n").slice(1, 30).map((l) => ({ function: l.trim() })) } }] },
    };
    const body = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=disporex/0.1` }, body, signal: controller.signal }).catch(() => undefined);
    clearTimeout(t);
  } catch (sendErr) {
    logger.warn({ err: sendErr }, "Fehlerbericht konnte nicht gesendet werden");
  }
}

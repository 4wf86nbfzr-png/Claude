import type { domainEvents } from "../../db/schema";
import { fanOutWebhooks } from "../webhooks/service";
import { runAutomationsFor } from "../automations/engine";
import { logger } from "../../core/logger";

/**
 * Verteilt ein Domain-Event an alle Abnehmer. Jeder Abnehmer ist isoliert:
 * ein Fehler bei Webhooks verhindert keine Automatisierung und umgekehrt.
 */
export async function dispatchDomainEvent(ev: typeof domainEvents.$inferSelect): Promise<void> {
  await fanOutWebhooks(ev).catch((err) => logger.error({ err, eventId: ev.id }, "Webhook-Verteilung fehlgeschlagen"));
  await runAutomationsFor(ev).catch((err) => logger.error({ err, eventId: ev.id }, "Automatisierungen fehlgeschlagen"));
}

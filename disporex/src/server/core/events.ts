import type { Tx } from "../db/client";
import { domainEvents } from "../db/schema";
import { enqueueJob } from "../jobs/queue";

export const DOMAIN_EVENT_TYPES = [
  "customer_request.created",
  "customer_request.updated",
  "event.created",
  "event.updated",
  "event.cancelled",
  "order.confirmed",
  "shift.created",
  "shift.requested",
  "shift.accepted",
  "shift.declined",
  "shift.confirmed",
  "shift.withdrawn",
  "shift.filled",
  "shift.opened",
  "partner_offer.created",
  "partner_offer.responded",
  "document.expiring",
  "qualification.expiring",
  "time_import.completed",
  "reconciliation.deviation",
  "reconciliation.corrected",
  "notification.failed",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/**
 * Schreibt ein fachliches Ereignis in die Outbox (gleiche Transaktion wie die
 * Fachänderung) und plant die asynchrone Verarbeitung ein (Webhooks, Automatisierungen).
 */
export async function emitEvent(
  tx: Tx,
  input: { tenantId: string; type: DomainEventType; entityType?: string; entityId?: string | null; payload: Record<string, unknown>; actorUserId?: string | null },
): Promise<string> {
  const [row] = await tx
    .insert(domainEvents)
    .values({
      tenantId: input.tenantId,
      type: input.type,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload,
      actorUserId: input.actorUserId ?? null,
    })
    .returning({ id: domainEvents.id });
  await enqueueJob(tx, { tenantId: input.tenantId, type: "domain_event.dispatch", payload: { domainEventId: row!.id }, dedupeKey: `evt:${row!.id}` });
  return row!.id;
}

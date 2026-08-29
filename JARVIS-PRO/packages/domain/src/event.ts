import { z } from 'zod';
import { untrusted, type UntrustedText } from './untrusted.js';
import { ChannelSchema, type Channel, type Urgency } from './channel.js';
import type { EventId } from './ids.js';

/**
 * Ein eingehendes Ereignis (neue E-Mail, neue WhatsApp-Nachricht).
 *
 * `providerId` ist die ID des Providers (Graph-Message-ID bzw. Meta-Message-ID)
 * und traegt die Deduplizierung: derselbe Provider-Datensatz darf nie zweimal
 * zu einem Anruf fuehren, egal wie oft der Webhook zustellt.
 */
export interface InboundEvent {
  readonly id: EventId;
  readonly channel: Channel;
  readonly providerId: string;
  readonly providerAccount: string;
  readonly threadId: string | null;
  readonly senderDisplay: UntrustedText;
  readonly senderAddress: string;
  readonly subject: UntrustedText | null;
  readonly preview: UntrustedText;
  readonly body: UntrustedText | null;
  readonly receivedAt: string;
  readonly urgency: Urgency;
  readonly attachments: readonly EventAttachment[];
  /** true, wenn Jarvis diese Nachricht selbst gesendet hat - erzeugt nie einen Anruf. */
  readonly selfOriginated: boolean;
  readonly handled: boolean;
}

export interface EventAttachment {
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly providerAttachmentId: string | null;
}

export const EventAttachmentSchema = z.object({
  name: z.string().max(400),
  mimeType: z.string().max(200),
  sizeBytes: z.number().int().nonnegative(),
  providerAttachmentId: z.string().max(400).nullable().default(null),
});

/** Rohdaten, wie ein Connector sie liefert. Bewusst ohne `id`/`handled`. */
export const InboundEventDraftSchema = z.object({
  channel: ChannelSchema,
  providerId: z.string().min(1).max(400),
  providerAccount: z.string().min(1).max(400),
  threadId: z.string().max(400).nullable().default(null),
  senderDisplay: z.string().max(400),
  senderAddress: z.string().max(400),
  subject: z.string().max(2000).nullable().default(null),
  preview: z.string().max(4000),
  body: z.string().max(200_000).nullable().default(null),
  receivedAt: z.iso.datetime({ offset: true }),
  urgency: z.enum(['low', 'normal', 'high']).default('normal'),
  attachments: z.array(EventAttachmentSchema).max(50).default([]),
  selfOriginated: z.boolean().default(false),
});
export type InboundEventDraft = z.infer<typeof InboundEventDraftSchema>;

/**
 * Deduplizierungsschluessel eines Ereignisses. Bewusst nur Kanal + Konto +
 * Provider-ID: mehrfache Zustellung derselben Nachricht kollabiert damit
 * auf genau einen Datensatz.
 */
export function eventDedupKey(d: {
  channel: Channel;
  providerAccount: string;
  providerId: string;
}): string {
  return `${d.channel}:${d.providerAccount}:${d.providerId}`;
}

export function materializeEvent(id: EventId, d: InboundEventDraft): InboundEvent {
  const origin = `${d.channel}:${d.providerId}`;
  return {
    id,
    channel: d.channel,
    providerId: d.providerId,
    providerAccount: d.providerAccount,
    threadId: d.threadId,
    senderDisplay: untrusted(d.senderDisplay, origin),
    senderAddress: d.senderAddress,
    subject: d.subject === null ? null : untrusted(d.subject, origin),
    preview: untrusted(d.preview, origin),
    body: d.body === null ? null : untrusted(d.body, origin),
    receivedAt: d.receivedAt,
    urgency: d.urgency,
    attachments: d.attachments,
    selfOriginated: d.selfOriginated,
    handled: false,
  };
}

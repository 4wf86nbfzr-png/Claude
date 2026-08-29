import { z } from 'zod';
import { ChannelSchema, type Channel } from './channel.js';
import type { DraftId, EventId } from './ids.js';

export const OutboundAttachmentSchema = z.object({
  name: z.string().min(1).max(400),
  mimeType: z.string().min(1).max(200),
  sizeBytes: z.number().int().nonnegative(),
  /** Lokaler Pfad oder Provider-Handle. Nie der Inhalt selbst. */
  ref: z.string().min(1).max(1000),
});
export type OutboundAttachment = z.infer<typeof OutboundAttachmentSchema>;

/**
 * Ein Nachrichtenentwurf. Das Sprachmodell darf Entwuerfe erzeugen und
 * ueberarbeiten - senden kann es sie nicht. Der Versand laeuft ausschliesslich
 * ueber die Approval Engine.
 */
export const OutboundDraftSchema = z.object({
  channel: ChannelSchema,
  providerAccount: z.string().min(1).max(400),
  recipient: z.string().min(1).max(400),
  subject: z.string().max(2000).nullable().default(null),
  body: z.string().min(1).max(50_000),
  attachments: z.array(OutboundAttachmentSchema).max(20).default([]),
  threadId: z.string().max(400).nullable().default(null),
  inReplyToEventId: z.string().max(200).nullable().default(null),
});
export type OutboundDraftInput = z.infer<typeof OutboundDraftSchema>;

export interface OutboundDraft {
  readonly id: DraftId;
  readonly channel: Channel;
  readonly providerAccount: string;
  readonly recipient: string;
  readonly subject: string | null;
  readonly body: string;
  readonly attachments: readonly OutboundAttachment[];
  readonly threadId: string | null;
  readonly inReplyToEventId: EventId | null;
  readonly createdAt: string;
  readonly revision: number;
}

/**
 * Kanonische, eindeutige Serialisierung eines Entwurfs fuer die Hash-Bindung
 * der Freigabe.
 *
 * Wichtig fuer die Sicherheit:
 *  - Jedes Feld wird laengenpraefixiert (`name:len:wert`). Damit kann keine
 *    Verschiebung von Inhalt zwischen zwei Feldern denselben String erzeugen
 *    (z. B. Betreff "A" + Text "B" gegen Betreff "AB" + leerer Text).
 *  - Zeilenenden und Unicode werden normalisiert, damit ein reines
 *    Umschreiben der Zeilenenden die Freigabe nicht unnoetig invalidiert.
 *  - Inhaltliche Aenderungen aendern den Hash immer.
 */
export function canonicalizeDraft(d: {
  channel: Channel;
  providerAccount: string;
  recipient: string;
  subject: string | null;
  body: string;
  attachments: readonly OutboundAttachment[];
  threadId: string | null;
}): string {
  const norm = (s: string): string =>
    s.normalize('NFC').split('\r\n').join('\n').trim();
  const field = (name: string, raw: string): string => {
    const v = norm(raw);
    return `${name}:${v.length}:${v}`;
  };
  const parts = [
    field('channel', d.channel),
    field('account', d.providerAccount.toLowerCase()),
    field('recipient', normalizeRecipient(d.channel, d.recipient)),
    field('subject', d.subject ?? ''),
    field('body', d.body),
    field('thread', d.threadId ?? ''),
    field(
      'attachments',
      [...d.attachments]
        .map((a) => `${norm(a.name)}|${norm(a.mimeType)}|${a.sizeBytes}|${norm(a.ref)}`)
        .sort()
        .join(''),
    ),
  ];
  return parts.join('');
}

/**
 * Empfaengernormalisierung. E-Mail-Adressen werden kleingeschrieben und aus
 * einer "Name <adresse>"-Schreibweise herausgeloest; WhatsApp-Nummern werden
 * auf reine Ziffern mit fuehrendem Plus reduziert.
 */
export function normalizeRecipient(channel: Channel, recipient: string): string {
  const r = recipient.trim();
  if (channel === 'email') {
    const angle = /<([^>]+)>\s*$/.exec(r);
    return (angle?.[1] ?? r).toLowerCase();
  }
  const digits = r.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? digits : `+${digits}`;
}

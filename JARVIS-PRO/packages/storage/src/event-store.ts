import {
  eventDedupKey,
  materializeEvent,
  untrusted,
  unwrapForDisplay,
  type Clock,
  type EventAttachment,
  type EventId,
  type IdGenerator,
  type InboundEvent,
  type InboundEventDraft,
  type Channel,
  type Urgency,
} from '@jarvis/domain';
import type { Db } from './db.js';

interface EventRow {
  id: string;
  dedup_key: string;
  channel: string;
  provider_id: string;
  provider_account: string;
  thread_id: string | null;
  sender_display: string;
  sender_address: string;
  subject: string | null;
  preview: string;
  body: string | null;
  received_at: string;
  urgency: string;
  attachments_json: string;
  self_originated: number;
  handled: number;
  announced_at: string | null;
  created_at: string;
}

export interface IngestResult {
  readonly event: InboundEvent;
  /** false = derselbe Provider-Datensatz lag schon vor, es entsteht kein neuer Anruf. */
  readonly isNew: boolean;
}

/**
 * Eventstore.
 *
 * Die Deduplizierung sitzt hier und nicht im Connector: egal ob ein Webhook
 * doppelt zustellt, ein Delta-Abgleich dieselbe Nachricht erneut liefert oder
 * der Prozess mitten im Verarbeiten neu startet - `dedup_key` ist UNIQUE, und
 * der zweite Versuch liefert einfach den vorhandenen Datensatz zurueck.
 */
export class EventStore {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  ingest(draft: InboundEventDraft): IngestResult {
    const key = eventDedupKey(draft);
    return this.db.transaction(() => {
      const existing = this.db.get<EventRow>('SELECT * FROM events WHERE dedup_key = ?', [key]);
      if (existing !== undefined) {
        return { event: rowToEvent(existing), isNew: false };
      }
      const id = this.ids.next('evt') as EventId;
      const event = materializeEvent(id, draft);
      this.db.run(
        `INSERT INTO events (
           id, dedup_key, channel, provider_id, provider_account, thread_id,
           sender_display, sender_address, subject, preview, body, received_at,
           urgency, attachments_json, self_originated, handled, announced_at, created_at
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?)`,
        [
          id,
          key,
          draft.channel,
          draft.providerId,
          draft.providerAccount,
          draft.threadId,
          draft.senderDisplay,
          draft.senderAddress,
          draft.subject,
          draft.preview,
          draft.body,
          draft.receivedAt,
          draft.urgency,
          JSON.stringify(draft.attachments),
          draft.selfOriginated ? 1 : 0,
          this.clock.nowIso(),
        ],
      );
      return { event, isNew: true };
    });
  }

  byId(id: EventId): InboundEvent | null {
    const row = this.db.get<EventRow>('SELECT * FROM events WHERE id = ?', [id]);
    return row === undefined ? null : rowToEvent(row);
  }

  /** Noch nicht besprochene Ereignisse, aelteste zuerst. */
  openEvents(limit = 50): InboundEvent[] {
    return this.db
      .all<EventRow>(
        'SELECT * FROM events WHERE handled = 0 AND self_originated = 0 ORDER BY received_at ASC LIMIT ?',
        [limit],
      )
      .map(rowToEvent);
  }

  countOpen(): number {
    const r = this.db.get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM events WHERE handled = 0 AND self_originated = 0',
    );
    return r?.n ?? 0;
  }

  /**
   * Ereignisse, die Noah noch nicht genannt bekommen hat.
   *
   * Unterscheidet sich bewusst von `openEvents`: "offen" heisst
   * unerledigt, "nicht angekuendigt" heisst ungesagt. Am Telefon fallen
   * beide zusammen, weil im selben Gespraech angekuendigt und abgehakt
   * wird. Im Chat nicht - dort kann eine Nachricht tagelang genannt, aber
   * unerledigt sein. Wer hier `openEvents` nimmt, meldet dieselbe Mail bei
   * jeder Nachricht erneut.
   */
  unannouncedEvents(limit = 50): InboundEvent[] {
    return this.db
      .all<EventRow>(
        `SELECT * FROM events
          WHERE handled = 0 AND self_originated = 0 AND announced_at IS NULL
          ORDER BY received_at ASC LIMIT ?`,
        [limit],
      )
      .map(rowToEvent);
  }

  countUnannounced(): number {
    const r = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM events
        WHERE handled = 0 AND self_originated = 0 AND announced_at IS NULL`,
    );
    return r?.n ?? 0;
  }

  markAnnounced(id: EventId): void {
    this.db.run('UPDATE events SET announced_at = ? WHERE id = ? AND announced_at IS NULL', [
      this.clock.nowIso(),
      id,
    ]);
  }

  markHandled(id: EventId): void {
    this.db.run('UPDATE events SET handled = 1 WHERE id = ?', [id]);
  }

  /** Alle Ereignisse eines Threads - Grundlage fuer das Thread-Gedaechtnis. */
  threadHistory(channel: Channel, threadId: string, limit = 20): InboundEvent[] {
    return this.db
      .all<EventRow>(
        'SELECT * FROM events WHERE channel = ? AND thread_id = ? ORDER BY received_at ASC LIMIT ?',
        [channel, threadId, limit],
      )
      .map(rowToEvent);
  }

  /** Vollstaendiger Export - fuer das Auskunfts- und Loeschrecht. */
  exportAll(): unknown[] {
    return this.db.all<EventRow>('SELECT * FROM events ORDER BY created_at ASC');
  }

  deleteById(id: EventId): boolean {
    return this.db.run('DELETE FROM events WHERE id = ?', [id]).changes > 0;
  }
}

function rowToEvent(r: EventRow): InboundEvent {
  const origin = `${r.channel}:${r.provider_id}`;
  return {
    id: r.id as EventId,
    channel: r.channel as Channel,
    providerId: r.provider_id,
    providerAccount: r.provider_account,
    threadId: r.thread_id,
    senderDisplay: untrusted(r.sender_display, origin),
    senderAddress: r.sender_address,
    subject: r.subject === null ? null : untrusted(r.subject, origin),
    preview: untrusted(r.preview, origin),
    body: r.body === null ? null : untrusted(r.body, origin),
    receivedAt: r.received_at,
    urgency: r.urgency as Urgency,
    attachments: JSON.parse(r.attachments_json) as EventAttachment[],
    selfOriginated: r.self_originated === 1,
    handled: r.handled === 1,
  };
}

/** Kurzform fuer Logs und Diagnose - nie der volle Text. */
export function eventLogSummary(e: InboundEvent): Record<string, unknown> {
  return {
    eventId: e.id,
    channel: e.channel,
    providerId: e.providerId,
    threadId: e.threadId,
    urgency: e.urgency,
    subjectLength: e.subject === null ? 0 : unwrapForDisplay(e.subject).length,
    attachments: e.attachments.length,
  };
}

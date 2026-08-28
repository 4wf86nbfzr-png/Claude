import type {
  CalendarEvent,
  CalendarEventDraft,
  Clock,
  InboundEventDraft,
  OutboundDraft,
} from '@jarvis/domain';
import {
  ConnectorError,
  type CalendarConnector,
  type MailConnector,
  type MessagingConnector,
  type SendResult,
} from './types.js';

/**
 * Nachgebaute Provider fuer Simulation und Tests.
 *
 * Sie koennen alles, was die echten koennen - einschliesslich Fehlern:
 * Zeitueberschreitung, abgelaufenes Token, Ratenbegrenzung, Doppelzustellung
 * und eine unklare Antwort, bei der nicht feststeht, ob gesendet wurde.
 */
export type MockFailure = 'none' | 'auth' | 'rate_limit' | 'timeout' | 'server' | 'network';

export class MockFailureController {
  failure: MockFailure = 'none';
  /** Anzahl Aufrufe, die fehlschlagen, bevor es wieder klappt. */
  failuresRemaining = 0;

  shouldFail(): MockFailure {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      return this.failure === 'none' ? 'server' : this.failure;
    }
    return this.failure === 'none' ? 'none' : this.failure;
  }

  reset(): void {
    this.failure = 'none';
    this.failuresRemaining = 0;
  }

  raise(kind: MockFailure): never {
    switch (kind) {
      case 'auth':
        throw new ConnectorError('Token abgelaufen', 'auth', false, 401);
      case 'rate_limit':
        throw new ConnectorError('Zu viele Anfragen', 'rate_limit', true, 429);
      case 'timeout':
        throw new ConnectorError('Zeitueberschreitung', 'network', true);
      case 'network':
        throw new ConnectorError('Verbindung abgebrochen', 'network', true);
      case 'server':
        throw new ConnectorError('Serverfehler', 'server', true, 503);
      case 'none':
        throw new Error('unerreichbar');
    }
  }
}

/* -------------------------------------------------------------------------- */

export class MockMailConnector implements MailConnector {
  readonly name = 'mock-mail';
  readonly failures = new MockFailureController();
  readonly sent: { draft: OutboundDraft; idempotencyKey: string }[] = [];
  /** Antwortverhalten beim Senden. */
  sendBehaviour: 'ok' | 'failed' | 'unknown' = 'ok';

  private inbox: InboundEventDraft[] = [];
  private readonly bodies = new Map<string, string>();
  private readonly sentByKey = new Map<string, string>();
  private counter = 0;

  constructor(readonly account = 'noah@hermserviceteam.com') {}

  /** Legt eine neue Nachricht ins Postfach. */
  deliver(...drafts: InboundEventDraft[]): void {
    for (const d of drafts) {
      this.inbox.push(d);
      if (d.body !== null) this.bodies.set(d.providerId, d.body);
    }
  }

  /** Stellt dieselbe Nachricht ein zweites Mal zu - Test der Deduplizierung. */
  deliverDuplicate(providerId: string): void {
    const found = this.inbox.find((d) => d.providerId === providerId);
    if (found !== undefined) this.inbox.push({ ...found });
  }

  async fetchNew(): Promise<InboundEventDraft[]> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    const out = this.inbox;
    this.inbox = [];
    return out;
  }

  async fetchBody(providerId: string): Promise<string | null> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    return this.bodies.get(providerId) ?? null;
  }

  async send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);

    if (this.sendBehaviour === 'failed') {
      return { status: 'failed', providerMessageId: null, error: 'Postfach lehnte die Nachricht ab' };
    }
    if (this.sendBehaviour === 'unknown') {
      return { status: 'unknown', providerMessageId: null, error: 'Zeitueberschreitung nach dem Absenden' };
    }

    const existing = this.sentByKey.get(idempotencyKey);
    if (existing !== undefined) {
      return { status: 'sent', providerMessageId: existing, error: null };
    }
    this.counter += 1;
    const id = `mock-mail-${this.counter}`;
    this.sentByKey.set(idempotencyKey, id);
    this.sent.push({ draft, idempotencyKey });
    return { status: 'sent', providerMessageId: id, error: null };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Simuliertes Postfach' };
  }
}

/* -------------------------------------------------------------------------- */

export class MockMessagingConnector implements MessagingConnector {
  readonly name = 'mock-whatsapp';
  readonly failures = new MockFailureController();
  readonly sent: { draft: OutboundDraft; idempotencyKey: string }[] = [];
  sendBehaviour: 'ok' | 'failed' | 'unknown' = 'ok';

  private readonly sentByKey = new Map<string, string>();
  private counter = 0;

  constructor(readonly account = '4915199998888') {}

  async send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);

    if (this.sendBehaviour === 'failed') {
      return { status: 'failed', providerMessageId: null, error: 'Meta lehnte die Nachricht ab' };
    }
    if (this.sendBehaviour === 'unknown') {
      return { status: 'unknown', providerMessageId: null, error: 'Keine Antwort von Meta' };
    }

    const existing = this.sentByKey.get(idempotencyKey);
    if (existing !== undefined) return { status: 'sent', providerMessageId: existing, error: null };

    this.counter += 1;
    const id = `wamid.MOCK${this.counter}`;
    this.sentByKey.set(idempotencyKey, id);
    this.sent.push({ draft, idempotencyKey });
    return { status: 'sent', providerMessageId: id, error: null };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Simulierte WhatsApp-Anbindung' };
  }
}

/* -------------------------------------------------------------------------- */

export class MockCalendarConnector implements CalendarConnector {
  readonly name = 'mock-calendar';
  readonly failures = new MockFailureController();
  readonly created: CalendarEvent[] = [];

  private counter = 0;

  constructor(
    readonly account = 'noah@hermserviceteam.com',
    private readonly clock?: Clock,
  ) {}

  async listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    const from = Date.parse(fromIso);
    const to = Date.parse(toIso);
    return this.created.filter((e) => {
      const t = Date.parse(`${e.start}:00Z`);
      return t >= from && t <= to;
    });
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    this.counter += 1;
    const event: CalendarEvent = {
      ...draft,
      providerEventId: `mock-cal-${this.counter}`,
      providerAccount: this.account,
      createdAt: this.clock?.nowIso() ?? new Date().toISOString(),
    };
    this.created.push(event);
    return event;
  }

  async updateEvent(providerEventId: string, draft: CalendarEventDraft): Promise<CalendarEvent> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    const idx = this.created.findIndex((e) => e.providerEventId === providerEventId);
    if (idx < 0) throw new ConnectorError('Termin nicht gefunden', 'not_found', false, 404);
    const updated: CalendarEvent = {
      ...draft,
      providerEventId,
      providerAccount: this.account,
      createdAt: this.created[idx]?.createdAt ?? new Date().toISOString(),
    };
    this.created[idx] = updated;
    return updated;
  }

  async cancelEvent(providerEventId: string): Promise<void> {
    const f = this.failures.shouldFail();
    if (f !== 'none') this.failures.raise(f);
    const idx = this.created.findIndex((e) => e.providerEventId === providerEventId);
    if (idx < 0) throw new ConnectorError('Termin nicht gefunden', 'not_found', false, 404);
    this.created.splice(idx, 1);
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Simulierter Kalender' };
  }
}

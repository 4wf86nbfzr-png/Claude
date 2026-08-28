import type {
  CalendarEvent,
  CalendarEventDraft,
  InboundEventDraft,
  OutboundDraft,
} from '@jarvis/domain';

/**
 * Providerinterfaces.
 *
 * Alles, was Jarvis mit der Aussenwelt macht, laeuft durch diese drei
 * Schnittstellen. Der Rest des Systems kennt weder Microsoft Graph noch die
 * WhatsApp Cloud API - und die Approval Engine kennt nur `send`.
 */

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly kind: ConnectorErrorKind,
    readonly retryable: boolean,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export type ConnectorErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'network'
  | 'not_found'
  | 'invalid_request'
  | 'server'
  | 'unknown';

/** Ergebnis eines Sendeversuchs. `unknown` ist ausdruecklich kein Erfolg. */
export interface SendResult {
  readonly status: 'sent' | 'failed' | 'unknown';
  readonly providerMessageId: string | null;
  readonly error: string | null;
}

/* -------------------------------------------------------------------------- */

export interface MailConnector {
  readonly name: string;
  readonly account: string;

  /**
   * Holt neue Nachrichten seit dem letzten Abgleich. Der Connector merkt sich
   * seinen Stand selbst (Delta-Link bzw. History-ID) und liefert nach einem
   * Ausfall alles nach, was zwischenzeitlich angekommen ist.
   */
  fetchNew(): Promise<InboundEventDraft[]>;

  /** Vollstaendiger Text einer Nachricht, falls die Vorschau nicht reicht. */
  fetchBody(providerId: string): Promise<string | null>;

  /**
   * Sendet. Wird ausschliesslich von der Approval Engine aufgerufen.
   * `idempotencyKey` muss ein zweites Zustellen verhindern.
   */
  send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult>;

  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export interface MessagingConnector {
  readonly name: string;
  readonly account: string;

  send(draft: OutboundDraft, idempotencyKey: string): Promise<SendResult>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

export interface CalendarConnector {
  readonly name: string;
  readonly account: string;

  listEvents(fromIso: string, toIso: string): Promise<CalendarEvent[]>;
  createEvent(draft: CalendarEventDraft): Promise<CalendarEvent>;
  updateEvent(providerEventId: string, draft: CalendarEventDraft): Promise<CalendarEvent>;
  cancelEvent(providerEventId: string): Promise<void>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

/* -------------------------------------------------------------------------- */

/**
 * Ordnet einen HTTP-Status einer Fehlerart zu und entscheidet, ob ein Retry
 * ueberhaupt sinnvoll ist. Ein 401 wird nicht wiederholt, sondern fuehrt zur
 * Tokenerneuerung; ein 429 wird wiederholt.
 */
export function classifyHttpError(status: number, body: string): ConnectorError {
  if (status === 401 || status === 403) {
    return new ConnectorError(`Nicht autorisiert (${status})`, 'auth', false, status);
  }
  if (status === 404) {
    return new ConnectorError('Nicht gefunden', 'not_found', false, status);
  }
  if (status === 429) {
    return new ConnectorError('Zu viele Anfragen', 'rate_limit', true, status);
  }
  if (status >= 500) {
    return new ConnectorError(`Serverfehler (${status})`, 'server', true, status);
  }
  if (status >= 400) {
    return new ConnectorError(
      `Ungueltige Anfrage (${status}): ${body.slice(0, 200)}`,
      'invalid_request',
      false,
      status,
    );
  }
  return new ConnectorError(`Unerwarteter Status ${status}`, 'unknown', false, status);
}

/** Wartezeit fuer einen Retry, mit Beachtung von `Retry-After`. */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader !== null) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 120_000);
  }
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

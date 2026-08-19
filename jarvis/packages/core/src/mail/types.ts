import type { Result } from '../util/result.js';

export interface OutgoingAttachment {
  filename: string;
  path: string;
  contentType?: string | null;
}

export interface OutgoingMessage {
  from: { name?: string | null; address: string };
  to: Array<{ name?: string | null; address: string }>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: OutgoingAttachment[];
  inReplyTo?: string | null;
  references?: string[];
  headers?: Record<string, string>;
}

export interface SendOutcome {
  messageId: string | null;
  provider: string;
  accepted: string[];
  rejected: string[];
  response?: string;
}

/**
 * Ein Transport verschickt genau eine Nachricht. Er kennt weder Freigaben
 * noch Datenbank -- die Absicherung sitzt eine Ebene darueber im MailService.
 */
export interface MailTransport {
  readonly id: 'smtp' | 'gmail' | 'graph';
  readonly label: string;
  isConfigured(): boolean;
  /** Klartext, was noch fehlt (fuer den Einrichtungsassistenten). */
  missingConfigHint(): string | null;
  /** Prueft Verbindung und Anmeldung, ohne etwas zu senden. */
  verify(): Promise<Result<{ info: string }>>;
  send(message: OutgoingMessage): Promise<Result<SendOutcome>>;
  /** Absenderadresse, falls der Anbieter sie vorgibt. */
  defaultFrom?(): Promise<string | null>;
}

export interface IncomingMessage {
  messageId: string | null;
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  text: string;
  date: string;
  inReplyTo: string | null;
  references: string[];
}

export interface MailReader {
  readonly id: string;
  isConfigured(): boolean;
  missingConfigHint(): string | null;
  /** Holt neue Nachrichten seit einem Zeitpunkt. */
  fetchSince(since: Date, limit: number): Promise<Result<IncomingMessage[]>>;
}

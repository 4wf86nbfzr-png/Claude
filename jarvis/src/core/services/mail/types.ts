import type { EmailAttachment } from '../../../shared/types';

export interface OutgoingMessage {
  from: { name: string; address: string };
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  attachments: EmailAttachment[];
  inReplyTo?: string | null;
  references?: string[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  /** Vom Server abgelehnte Empfänger – gilt als Teilfehler, nicht als Erfolg. */
  rejected?: string[];
  error?: string;
  /** true, wenn wegen Testbetrieb nur protokolliert wurde. */
  simuliert?: boolean;
}

/**
 * Versandweg. Version 1 bringt SMTP und Gmail mit; Microsoft Graph lässt
 * sich als weitere Umsetzung ergänzen, ohne dass Agenten etwas merken.
 */
export interface MailTransport {
  readonly id: string;
  readonly label: string;
  configured(): boolean;
  missingHint(): string;
  send(message: OutgoingMessage): Promise<SendResult>;
  /** Verbindung prüfen, ohne etwas zu senden. */
  verify(): Promise<{ ok: boolean; error?: string }>;
}

export interface EingehendeNachricht {
  messageId: string | null;
  inReplyTo: string | null;
  from: string;
  to: string[];
  subject: string;
  text: string;
  date: string;
}

/** Lesezugriff auf den Posteingang, um Antworten zuzuordnen. */
export interface MailReader {
  readonly id: string;
  configured(): boolean;
  missingHint(): string;
  hole(seit: Date, maxAnzahl: number): Promise<EingehendeNachricht[]>;
}

import type { JarvisError, Result } from '../../shared/types.js';

export interface OutgoingMessage {
  from: { name: string; address: string };
  replyTo?: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain text body. Cold outreach is sent as text/plain on purpose. */
  text: string;
  attachments?: Array<{ filename: string; path: string; contentType?: string }>;
  headers?: Record<string, string>;
}

export interface SendReceipt {
  /** RFC 5322 Message-Id as reported by the transport. Proof of delivery attempt. */
  messageId: string;
  /** Addresses the server accepted, when it reports them. */
  accepted: string[];
  rejected: string[];
  /** Raw server response, for the audit log. */
  response: string;
}

/**
 * A mail transport. Implementations must never resolve successfully unless the
 * server actually accepted the message (§19) — a queued-but-rejected send is a
 * failure, not a success.
 */
export interface MailTransport {
  readonly name: string;
  send(message: OutgoingMessage): Promise<Result<SendReceipt, JarvisError>>;
  /** Connection/credential check for the setup assistant. */
  verify(): Promise<Result<string, JarvisError>>;
}

export interface IncomingMessage {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  subject: string;
  date: string;
  snippet: string;
}

export interface MailReader {
  readonly name: string;
  /** Fetches messages newer than `sinceIso`, newest first. */
  fetchRecent(sinceIso: string, limit: number): Promise<Result<IncomingMessage[], JarvisError>>;
  verify(): Promise<Result<string, JarvisError>>;
}

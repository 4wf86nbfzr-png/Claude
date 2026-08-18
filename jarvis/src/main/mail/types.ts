/**
 * Mail-Schnittstelle.
 *
 * Bewusst schmal gehalten, damit neben SMTP und Gmail später auch Microsoft
 * Graph dazukommen kann, ohne dass der MailAgent etwas davon merkt.
 */
import type { MailTransportId } from '@shared/types'

export interface OutgoingAttachment {
  filename: string
  path: string
  contentType?: string | null
}

export interface OutgoingMail {
  to: string
  toName?: string | null
  cc?: string | null
  bcc?: string | null
  subject: string
  text: string
  html?: string | null
  replyTo?: string | null
  attachments?: OutgoingAttachment[]
  /** Zusatzkopfzeilen, z. B. In-Reply-To für Antworten. */
  headers?: Record<string, string>
}

export interface SendResult {
  messageId: string
  accepted: string[]
  rejected: string[]
  transport: MailTransportId
  detail: string
}

export interface TransportCheck {
  ok: boolean
  detail: string
}

export interface MailTransport {
  readonly id: MailTransportId
  readonly fromAddress: string
  verify(): Promise<TransportCheck>
  send(mail: OutgoingMail): Promise<SendResult>
}

export interface IncomingMessage {
  messageId: string | null
  inReplyTo: string | null
  references: string[]
  fromAddress: string
  fromName: string | null
  subject: string
  date: string
  textSnippet: string
}

export interface MailReader {
  readonly id: string
  /** Liest die letzten Nachrichten des Posteingangs. */
  fetchRecent(options: { sinceDays: number; limit: number }): Promise<IncomingMessage[]>
}

export class MailConfigError extends Error {
  constructor(
    message: string,
    readonly hint: string
  ) {
    super(message)
    this.name = 'MailConfigError'
  }
}

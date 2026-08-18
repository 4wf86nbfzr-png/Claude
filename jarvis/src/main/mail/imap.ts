/**
 * Posteingang lesen (IMAP).
 *
 * Wird nur gebraucht, um Antworten den richtigen Firmen zuzuordnen. Es werden
 * Kopfzeilen und ein kurzer Ausschnitt gelesen, keine ganzen Postfächer
 * gespiegelt.
 */
import { ImapFlow } from 'imapflow'
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import { MailConfigError, type IncomingMessage, type MailReader } from './types'

export class ImapReader implements MailReader {
  readonly id = 'imap'

  constructor(
    private readonly config: {
      host: string
      port: number
      secure: boolean
      user: string
      password: string
      mailbox: string
    }
  ) {}

  async fetchRecent(options: { sinceDays: number; limit: number }): Promise<IncomingMessage[]> {
    const client = new ImapFlow({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: { user: this.config.user, pass: this.config.password },
      logger: false
    })

    const messages: IncomingMessage[] = []
    await client.connect()
    const lock = await client.getMailboxLock(this.config.mailbox)
    try {
      const since = new Date(Date.now() - options.sinceDays * 86_400_000)
      for await (const message of client.fetch(
        { since },
        { envelope: true, internalDate: true, headers: ['message-id', 'in-reply-to', 'references'] }
      )) {
        const headerText = message.headers?.toString('utf8') ?? ''
        const headerValue = (name: string): string | null => {
          const match = new RegExp(`^${name}:\\s*(.+)$`, 'im').exec(headerText)
          return match?.[1]?.trim() ?? null
        }

        const from = message.envelope?.from?.[0]
        messages.push({
          messageId: message.envelope?.messageId ?? headerValue('message-id'),
          inReplyTo: message.envelope?.inReplyTo ?? headerValue('in-reply-to'),
          references: (headerValue('references') ?? '').split(/\s+/).filter(Boolean),
          fromAddress: (from?.address ?? '').toLowerCase(),
          fromName: from?.name ?? null,
          subject: message.envelope?.subject ?? '(ohne Betreff)',
          date: new Date(message.internalDate ?? Date.now()).toISOString(),
          textSnippet: ''
        })

        if (messages.length >= options.limit) break
      }
    } finally {
      lock.release()
      await client.logout().catch(() => client.close())
    }

    return messages.reverse()
  }
}

export function createImapReader(): ImapReader {
  const { imap } = getSettings().mail
  const password = getSecret('IMAP_PASSWORD')

  const missing: string[] = []
  if (!imap.host) missing.push('Server')
  if (!imap.user) missing.push('Benutzer')
  if (!password) missing.push('Passwort (IMAP_PASSWORD)')

  if (missing.length > 0) {
    throw new MailConfigError(
      `Die IMAP-Einrichtung ist unvollständig: ${missing.join(', ')}.`,
      'Einstellungen -> E-Mail -> Posteingang. Ohne IMAP funktioniert alles außer der Zuordnung von Antworten.'
    )
  }

  return new ImapReader({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    user: imap.user,
    password: password as string,
    mailbox: imap.mailbox || 'INBOX'
  })
}

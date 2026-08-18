/**
 * Versand und Lesen über die Gmail-API.
 *
 * Zugriff per OAuth; gespeichert wird nur das Refresh-Token, und das im
 * verschlüsselten Zugangsspeicher.
 */
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import { composeMime, makeMessageId, toBase64Url } from './compose'
import { refreshGoogleAccessToken } from './oauth'
import {
  MailConfigError,
  type IncomingMessage,
  type MailReader,
  type MailTransport,
  type OutgoingMail,
  type SendResult,
  type TransportCheck
} from './types'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export class GmailTransport implements MailTransport, MailReader {
  readonly id = 'gmail' as const
  private accessToken: string | null = null
  private expiresAt = 0

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly refreshToken: string,
    readonly fromAddress: string,
    private readonly fromName: string
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) return this.accessToken
    const fresh = await refreshGoogleAccessToken({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      refreshToken: this.refreshToken
    })
    this.accessToken = fresh.accessToken
    this.expiresAt = fresh.expiresAt
    return fresh.accessToken
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.token()
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        authorization: `Bearer ${token}`
      }
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Gmail antwortete mit HTTP ${response.status}: ${detail.slice(0, 400)}`)
    }
    return (await response.json()) as T
  }

  async verify(): Promise<TransportCheck> {
    try {
      const profile = await this.call<{ emailAddress: string; messagesTotal: number }>('/profile')
      return { ok: true, detail: `Gmail erreichbar als ${profile.emailAddress}.` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, detail: `Gmail nicht erreichbar: ${message}` }
    }
  }

  async send(mail: OutgoingMail): Promise<SendResult> {
    const messageId = makeMessageId(this.fromAddress.split('@')[1] ?? 'gmail.com')
    const mime = composeMime(mail, { from: this.fromAddress, fromName: this.fromName, messageId })

    const result = await this.call<{ id: string; threadId: string; labelIds?: string[] }>('/messages/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: toBase64Url(mime) })
    })

    return {
      messageId,
      accepted: [mail.to],
      rejected: [],
      transport: 'gmail',
      detail: `Gmail hat die Nachricht angenommen (id ${result.id}, thread ${result.threadId}).`
    }
  }

  async fetchRecent(options: { sinceDays: number; limit: number }): Promise<IncomingMessage[]> {
    const after = Math.floor((Date.now() - options.sinceDays * 86_400_000) / 1000)
    const list = await this.call<{ messages?: { id: string }[] }>(
      `/messages?q=${encodeURIComponent(`in:inbox after:${after}`)}&maxResults=${Math.min(options.limit, 100)}`
    )

    const out: IncomingMessage[] = []
    for (const entry of list.messages ?? []) {
      const message = await this.call<{
        id: string
        snippet: string
        internalDate: string
        payload: { headers: { name: string; value: string }[] }
      }>(`/messages/${entry.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`)

      const header = (name: string): string | null =>
        message.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null

      const from = header('From') ?? ''
      const match = /<([^>]+)>/.exec(from)

      out.push({
        messageId: header('Message-ID'),
        inReplyTo: header('In-Reply-To'),
        references: (header('References') ?? '').split(/\s+/).filter(Boolean),
        fromAddress: (match?.[1] ?? from).trim().toLowerCase(),
        fromName: match ? from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || null : null,
        subject: header('Subject') ?? '(ohne Betreff)',
        date: new Date(Number(message.internalDate)).toISOString(),
        textSnippet: message.snippet ?? ''
      })
    }
    return out
  }
}

export function createGmailTransport(): GmailTransport {
  const settings = getSettings()
  const clientId = getSecret('GMAIL_CLIENT_ID') ?? settings.mail.gmail.clientId
  const clientSecret = getSecret('GMAIL_CLIENT_SECRET')
  const refreshToken = getSecret('GMAIL_REFRESH_TOKEN')

  const missing: string[] = []
  if (!clientId) missing.push('GMAIL_CLIENT_ID')
  if (!clientSecret) missing.push('GMAIL_CLIENT_SECRET')
  if (!refreshToken) missing.push('Anmeldung bei Google (Refresh-Token fehlt)')
  if (!settings.mail.fromAddress) missing.push('Absenderadresse')

  if (missing.length > 0) {
    throw new MailConfigError(
      `Die Gmail-Einrichtung ist unvollständig: ${missing.join(', ')}.`,
      'Einstellungen -> E-Mail: Client-ID und Secret hinterlegen, danach "Mit Google anmelden" ausführen.'
    )
  }

  return new GmailTransport(
    clientId as string,
    clientSecret as string,
    refreshToken as string,
    settings.mail.fromAddress,
    settings.mail.fromName
  )
}

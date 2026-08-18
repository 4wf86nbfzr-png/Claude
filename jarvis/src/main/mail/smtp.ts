/**
 * Versand über SMTP (nodemailer).
 *
 * Passwörter kommen aus dem verschlüsselten Zugangsspeicher, nie aus den
 * Einstellungen oder dem Quelltext.
 */
import nodemailer, { type Transporter } from 'nodemailer'
import { getSecret } from '../services/credentials'
import { getSettings } from '../services/settings'
import { MailConfigError, type MailTransport, type OutgoingMail, type SendResult, type TransportCheck } from './types'

export class SmtpTransport implements MailTransport {
  readonly id = 'smtp' as const
  private transporter: Transporter

  constructor(
    private readonly config: { host: string; port: number; secure: boolean; user: string; password: string },
    readonly fromAddress: string,
    private readonly fromName: string
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      // STARTTLS ist bei Port 587 der Normalfall; unverschlüsselt wird nicht gesendet.
      requireTLS: !config.secure,
      tls: { minVersion: 'TLSv1.2' }
    })
  }

  async verify(): Promise<TransportCheck> {
    try {
      await this.transporter.verify()
      return { ok: true, detail: `SMTP ${this.config.host}:${this.config.port} als ${this.config.user} erreichbar.` }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, detail: `SMTP nicht erreichbar: ${message}` }
    }
  }

  async send(mail: OutgoingMail): Promise<SendResult> {
    const info = await this.transporter.sendMail({
      from: this.fromName ? { name: this.fromName, address: this.fromAddress } : this.fromAddress,
      to: mail.toName ? { name: mail.toName, address: mail.to } : mail.to,
      cc: mail.cc ?? undefined,
      bcc: mail.bcc ?? undefined,
      replyTo: mail.replyTo ?? undefined,
      subject: mail.subject,
      text: mail.text,
      html: mail.html ?? undefined,
      headers: mail.headers,
      attachments: mail.attachments?.map((a) => ({
        filename: a.filename,
        path: a.path,
        contentType: a.contentType ?? undefined
      }))
    })

    type Recipient = string | { address: string }
    const asAddress = (entry: Recipient): string => (typeof entry === 'string' ? entry : entry.address)
    const accepted = ((info.accepted ?? []) as Recipient[]).map(asAddress)
    const rejected = ((info.rejected ?? []) as Recipient[]).map(asAddress)

    if (accepted.length === 0) {
      throw new Error(
        `Der Server hat die Nachricht nicht angenommen. Abgelehnt: ${rejected.join(', ') || '(keine Angabe)'} — ${info.response ?? ''}`
      )
    }

    return {
      messageId: info.messageId,
      accepted,
      rejected,
      transport: 'smtp',
      detail: info.response ?? 'ok'
    }
  }
}

export function createSmtpTransport(): SmtpTransport {
  const settings = getSettings()
  const { smtp, fromAddress, fromName } = settings.mail
  const password = getSecret('SMTP_PASSWORD')

  const missing: string[] = []
  if (!smtp.host) missing.push('Server')
  if (!smtp.user) missing.push('Benutzer')
  if (!password) missing.push('Passwort (SMTP_PASSWORD)')
  if (!fromAddress) missing.push('Absenderadresse')

  if (missing.length > 0) {
    throw new MailConfigError(
      `Die SMTP-Einrichtung ist unvollständig: ${missing.join(', ')}.`,
      'Einstellungen -> E-Mail: Server, Port, Benutzer und Absenderadresse eintragen; das Passwort unter Zugänge als SMTP_PASSWORD.'
    )
  }

  return new SmtpTransport(
    { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, password: password as string },
    fromAddress,
    fromName
  )
}

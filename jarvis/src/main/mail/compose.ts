/**
 * MIME-Aufbau.
 *
 * Gmail nimmt die Nachricht als fertige RFC-822-Datei entgegen, deshalb wird
 * sie hier selbst gebaut: Text, wahlweise HTML daneben, Anhänge außen herum.
 * Ueberschriften und Adressen werden nach RFC 2047 kodiert, sonst zerlegt es
 * Umlaute im Betreff.
 */
import { randomBytes } from 'node:crypto'
import { basename } from 'node:path'
import { readFileSync } from 'node:fs'
import type { OutgoingMail } from './types'

/** Kodiert Kopfzeilen mit Sonderzeichen als =?UTF-8?B?...?= */
export function encodeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

export function formatAddress(address: string, name?: string | null): string {
  if (!name) return address
  return `${encodeHeaderValue(name)} <${address}>`
}

function base64Lines(input: Buffer | string): string {
  const raw = Buffer.isBuffer(input) ? input.toString('base64') : Buffer.from(input, 'utf8').toString('base64')
  return raw.replace(/(.{76})/g, '$1\r\n')
}

function boundary(): string {
  return `----jarvis-${randomBytes(12).toString('hex')}`
}

export interface ComposeOptions {
  from: string
  fromName?: string | null
  messageId: string
  date?: Date
}

/** Baut die vollständige Nachricht als RFC-822-Text. */
export function composeMime(mail: OutgoingMail, options: ComposeOptions): string {
  const headers: string[] = []
  headers.push(`From: ${formatAddress(options.from, options.fromName)}`)
  headers.push(`To: ${formatAddress(mail.to, mail.toName)}`)
  if (mail.cc) headers.push(`Cc: ${mail.cc}`)
  if (mail.bcc) headers.push(`Bcc: ${mail.bcc}`)
  if (mail.replyTo) headers.push(`Reply-To: ${mail.replyTo}`)
  headers.push(`Subject: ${encodeHeaderValue(mail.subject)}`)
  headers.push(`Message-ID: ${options.messageId}`)
  headers.push(`Date: ${(options.date ?? new Date()).toUTCString()}`)
  headers.push('MIME-Version: 1.0')
  for (const [key, value] of Object.entries(mail.headers ?? {})) {
    headers.push(`${key}: ${value}`)
  }

  const textPart = ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', base64Lines(mail.text)].join('\r\n')

  let body: string
  const bodyHeaders: string[] = []

  const buildAlternative = (): { headers: string[]; body: string } => {
    if (!mail.html) {
      return {
        headers: ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'],
        body: base64Lines(mail.text)
      }
    }
    const alt = boundary()
    const htmlPart = [
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(mail.html)
    ].join('\r\n')
    return {
      headers: [`Content-Type: multipart/alternative; boundary="${alt}"`],
      body: [`--${alt}`, textPart, `--${alt}`, htmlPart, `--${alt}--`, ''].join('\r\n')
    }
  }

  const attachments = mail.attachments ?? []

  if (attachments.length === 0) {
    const alternative = buildAlternative()
    bodyHeaders.push(...alternative.headers)
    body = alternative.body
  } else {
    const mixed = boundary()
    bodyHeaders.push(`Content-Type: multipart/mixed; boundary="${mixed}"`)
    const alternative = buildAlternative()
    const parts: string[] = [
      `--${mixed}`,
      ...alternative.headers,
      '',
      alternative.body
    ]
    for (const attachment of attachments) {
      const data = readFileSync(attachment.path)
      const name = attachment.filename || basename(attachment.path)
      parts.push(
        `--${mixed}`,
        `Content-Type: ${attachment.contentType ?? 'application/octet-stream'}; name="${encodeHeaderValue(name)}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${encodeHeaderValue(name)}"`,
        '',
        base64Lines(data)
      )
    }
    parts.push(`--${mixed}--`, '')
    body = parts.join('\r\n')
  }

  return [...headers, ...bodyHeaders, '', body].join('\r\n')
}

/** Gmail erwartet die Nachricht base64url-kodiert. */
export function toBase64Url(mime: string): string {
  return Buffer.from(mime, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function makeMessageId(domain: string): string {
  const host = domain && domain.includes('.') ? domain : 'jarvis.local'
  return `<${Date.now().toString(36)}.${randomBytes(8).toString('hex')}@${host}>`
}

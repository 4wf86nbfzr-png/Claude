/**
 * Auswahl des Versandwegs.
 *
 * Ist nichts eingerichtet, gibt es bewusst keinen "stillen" Ersatzweg: dann
 * kann JARVIS Entwürfe schreiben, aber nichts versenden — und sagt das auch.
 */
import { getSettings } from '../services/settings'
import { createGmailTransport } from './gmail'
import { createImapReader } from './imap'
import { createSmtpTransport } from './smtp'
import { MailConfigError, type MailReader, type MailTransport } from './types'

export function getMailTransport(): MailTransport {
  const { transport } = getSettings().mail
  switch (transport) {
    case 'smtp':
      return createSmtpTransport()
    case 'gmail':
      return createGmailTransport()
    default:
      throw new MailConfigError(
        'Es ist kein Versandweg eingerichtet.',
        'Einstellungen -> E-Mail: entweder SMTP-Zugangsdaten eintragen oder Gmail per OAuth verbinden. Entwürfe funktionieren auch ohne.'
      )
  }
}

/** Liefert den Leser für Antworten, oder null, wenn keiner eingerichtet ist. */
export function getMailReader(): MailReader | null {
  const settings = getSettings()
  if (settings.mail.transport === 'gmail') {
    try {
      return createGmailTransport()
    } catch {
      return null
    }
  }
  if (settings.mail.imap.host) {
    try {
      return createImapReader()
    } catch {
      return null
    }
  }
  return null
}

export * from './types'

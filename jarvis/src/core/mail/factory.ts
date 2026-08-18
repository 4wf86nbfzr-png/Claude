import type { AppSettings, JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CredentialService } from '../services/CredentialService.js';
import { GmailTransport } from './GmailTransport.js';
import { ImapReader } from './ImapReader.js';
import { SmtpTransport } from './SmtpTransport.js';
import type { MailReader, MailTransport, OutgoingMessage, SendReceipt } from './types.js';

/**
 * Placeholder for Microsoft Graph / Outlook.
 *
 * The transport contract is what makes the addition a drop-in (§20), but the
 * implementation is deliberately absent in version 1 rather than faked: it
 * fails loudly with instructions instead of pretending to send.
 */
export class GraphTransportNotImplemented implements MailTransport {
  readonly name = 'Microsoft Graph';

  async send(): Promise<Result<SendReceipt, JarvisError>> {
    return err(
      makeError(
        'mail.transport_unavailable',
        'Der Microsoft-Graph-Versand ist in Version 1 nicht implementiert.',
        {
          hint: 'Bis dahin SMTP oder Gmail wählen. Die Schnittstelle MailTransport ist vorbereitet.',
        },
      ),
    );
  }

  async verify(): Promise<Result<string, JarvisError>> {
    const attempt = await this.send();
    return attempt.ok ? ok(this.name) : attempt;
  }
}

export function createMailTransport(
  settings: AppSettings,
  credentials: CredentialService,
): Result<MailTransport, JarvisError> {
  const mail = settings.mail;

  if (!mail.identity.email) {
    return err(
      makeError('mail.no_identity', 'Es ist keine Absenderadresse eingerichtet.', {
        hint: 'Einstellungen → Postfach → Absender.',
      }),
    );
  }

  switch (mail.transport) {
    case 'smtp': {
      if (!mail.smtp?.host || !mail.smtp.user) {
        return err(
          makeError('mail.not_configured', 'Die SMTP-Verbindung ist unvollständig konfiguriert.', {
            hint: 'Einstellungen → Postfach → SMTP (Host, Port, Benutzer).',
          }),
        );
      }
      const password = credentials.get('smtp.password');
      if (!password) {
        return err(
          makeError('mail.no_password', 'Für SMTP ist kein Passwort hinterlegt.', {
            hint: 'Einstellungen → Zugänge → SMTP-Passwort, oder SMTP_PASSWORD setzen.',
          }),
        );
      }
      return ok(
        new SmtpTransport({
          host: mail.smtp.host,
          port: mail.smtp.port,
          secure: mail.smtp.secure,
          user: mail.smtp.user,
          password,
        }),
      );
    }
    case 'gmail': {
      const clientSecret = credentials.get('gmail.clientSecret');
      const refreshToken = credentials.get('gmail.refreshToken');
      if (!mail.gmail?.clientId || !clientSecret || !refreshToken) {
        return err(
          makeError('mail.not_configured', 'Der Gmail-Zugang ist unvollständig.', {
            hint: 'Client-ID in den Einstellungen, Client-Secret und Refresh-Token unter „Zugänge". Token erzeugen: node scripts/gmail-auth.mjs',
          }),
        );
      }
      return ok(
        new GmailTransport({
          clientId: mail.gmail.clientId,
          clientSecret,
          refreshToken,
        }),
      );
    }
    case 'graph':
      return ok(new GraphTransportNotImplemented());
    case 'none':
    default:
      return err(
        makeError('mail.no_transport', 'Es ist kein Postausgang eingerichtet.', {
          hint: 'Einstellungen → Postfach → Versandweg wählen (SMTP oder Gmail).',
        }),
      );
  }
}

export function createMailReader(
  settings: AppSettings,
  credentials: CredentialService,
): Result<MailReader, JarvisError> {
  const imap = settings.mail.imap;
  if (!imap?.host || !imap.user) {
    return err(
      makeError('mail.no_reader', 'Es ist kein IMAP-Posteingang eingerichtet.', {
        hint: 'Einstellungen → Postfach → IMAP. Ohne IMAP können Antworten nicht zugeordnet werden.',
      }),
    );
  }
  const password = credentials.get('imap.password');
  if (!password) {
    return err(
      makeError('mail.no_password', 'Für IMAP ist kein Passwort hinterlegt.', {
        hint: 'Einstellungen → Zugänge → IMAP-Passwort, oder IMAP_PASSWORD setzen.',
      }),
    );
  }
  return ok(
    new ImapReader({
      host: imap.host,
      port: imap.port,
      secure: imap.secure,
      user: imap.user,
      password,
      mailbox: imap.mailbox || 'INBOX',
    }),
  );
}

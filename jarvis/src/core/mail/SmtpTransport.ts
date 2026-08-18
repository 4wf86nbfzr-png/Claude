import nodemailer, { type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { MailTransport, OutgoingMessage, SendReceipt } from './types.js';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}

/**
 * Classic SMTP submission. Works with any provider that offers an app password
 * or a dedicated submission account.
 */
export class SmtpTransport implements MailTransport {
  readonly name = 'SMTP';
  private transporter: Transporter | null = null;

  constructor(private readonly config: SmtpConfig) {}

  private get client(): Transporter {
    if (!this.transporter) {
      const options: SMTPTransport.Options = {
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
        // STARTTLS on 587 must not silently fall back to an unencrypted session.
        requireTLS: !this.config.secure,
        tls: { minVersion: 'TLSv1.2' },
      };
      this.transporter = nodemailer.createTransport(options);
    }
    return this.transporter;
  }

  async send(message: OutgoingMessage): Promise<Result<SendReceipt, JarvisError>> {
    try {
      const info = await this.client.sendMail({
        from: { name: message.from.name, address: message.from.address },
        replyTo: message.replyTo,
        to: message.to,
        cc: message.cc?.length ? message.cc : undefined,
        bcc: message.bcc?.length ? message.bcc : undefined,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments,
        headers: message.headers,
      });

      const accepted = (info.accepted ?? []).map(String);
      const rejected = (info.rejected ?? []).map(String);

      // A server can accept the session but reject the recipient. That is a
      // failed send and must be reported as one.
      if (rejected.length > 0 || accepted.length === 0) {
        return err(
          makeError('mail.rejected', `Der Server hat ${message.to} abgelehnt.`, {
            detail: `${info.response ?? ''} abgelehnt: ${rejected.join(', ') || '(keine Annahme gemeldet)'}`,
          }),
        );
      }

      return ok({
        messageId: String(info.messageId ?? ''),
        accepted,
        rejected,
        response: String(info.response ?? ''),
      });
    } catch (error) {
      return err(translateSmtp(error));
    }
  }

  async verify(): Promise<Result<string, JarvisError>> {
    try {
      await this.client.verify();
      return ok(`SMTP-Verbindung zu ${this.config.host}:${this.config.port} steht.`);
    } catch (error) {
      return err(translateSmtp(error));
    }
  }
}

function translateSmtp(error: unknown): JarvisError {
  const raw = error as { code?: string; responseCode?: number; message?: string };
  const detail = raw?.message?.slice(0, 400);

  switch (raw?.code) {
    case 'EAUTH':
      return makeError('mail.auth', 'Der SMTP-Server hat die Zugangsdaten abgelehnt.', {
        hint: 'Benutzername und Passwort prüfen. Viele Anbieter verlangen ein App-Passwort.',
        detail,
      });
    case 'ECONNECTION':
    case 'ESOCKET':
      return makeError('mail.connection', 'Der SMTP-Server ist nicht erreichbar.', {
        hint: 'Host, Port und Verschlüsselung prüfen (465 = SSL, 587 = STARTTLS).',
        detail,
        retryable: true,
      });
    case 'ETIMEDOUT':
      return makeError('mail.timeout', 'Zeitüberschreitung beim SMTP-Server.', {
        detail,
        retryable: true,
      });
    case 'EENVELOPE':
      return makeError('mail.envelope', 'Der Server hat Absender oder Empfänger abgelehnt.', { detail });
    default:
      if (raw?.responseCode && raw.responseCode >= 500) {
        return makeError('mail.smtp_rejected', `Der SMTP-Server antwortete mit ${raw.responseCode}.`, {
          detail,
        });
      }
      return makeError('mail.unknown', 'Der Versand ist fehlgeschlagen.', { detail, retryable: true });
  }
}

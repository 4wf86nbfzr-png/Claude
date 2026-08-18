import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { MailTransport, OutgoingMessage, SendReceipt } from './types.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Gmail API transport using an OAuth refresh token.
 *
 * No password is ever stored: the setup assistant walks the user through
 * Google's consent screen once (`scripts/gmail-auth.mjs`), and only the
 * resulting refresh token goes into the encrypted credential store. Access
 * tokens are short-lived and kept in memory.
 */
export class GmailTransport implements MailTransport {
  readonly name = 'Gmail API';
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private readonly config: GmailConfig) {}

  private async token(): Promise<Result<string, JarvisError>> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) {
      return ok(this.accessToken);
    }
    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const json = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !json.access_token) {
        return err(
          makeError('mail.oauth', 'Google hat den Refresh-Token abgelehnt.', {
            hint: 'Zugang über „npm run setup" bzw. scripts/gmail-auth.mjs neu erteilen.',
            detail: json.error_description ?? json.error ?? `HTTP ${response.status}`,
          }),
        );
      }
      this.accessToken = json.access_token;
      this.expiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
      return ok(this.accessToken);
    } catch (error) {
      return err(
        makeError('mail.connection', 'Der Google-Token-Endpunkt ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }

  private async buildRaw(message: OutgoingMessage): Promise<Buffer> {
    const composer = new MailComposer({
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
    return await composer.compile().build();
  }

  async send(message: OutgoingMessage): Promise<Result<SendReceipt, JarvisError>> {
    const token = await this.token();
    if (!token.ok) return token;

    let raw: string;
    try {
      const mime = await this.buildRaw(message);
      raw = mime.toString('base64url');
    } catch (error) {
      return err(
        makeError('mail.compose', 'Die Nachricht konnte nicht zusammengesetzt werden.', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    try {
      const response = await fetch(SEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token.value}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      const json = (await response.json()) as {
        id?: string;
        threadId?: string;
        error?: { message?: string; status?: string };
      };
      if (!response.ok) {
        return err(
          makeError('mail.api_error', `Gmail meldete HTTP ${response.status}.`, {
            detail: json.error?.message ?? '',
            retryable: response.status >= 500 || response.status === 429,
          }),
        );
      }
      // Gmail returns its own message id; the RFC Message-Id header is derived
      // from it and is what replies will reference.
      return ok({
        messageId: json.id ? `<${json.id}@mail.gmail.com>` : '',
        accepted: [message.to],
        rejected: [],
        response: `Gmail id ${json.id ?? '?'} thread ${json.threadId ?? '?'}`,
      });
    } catch (error) {
      return err(
        makeError('mail.connection', 'Die Gmail-API ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }

  async verify(): Promise<Result<string, JarvisError>> {
    const token = await this.token();
    if (!token.ok) return token;
    try {
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { authorization: `Bearer ${token.value}` },
      });
      if (!response.ok) {
        return err(
          makeError('mail.api_error', `Gmail-Profil nicht abrufbar (HTTP ${response.status}).`, {
            hint: 'Fehlt der Scope gmail.send bzw. gmail.readonly?',
          }),
        );
      }
      const json = (await response.json()) as { emailAddress?: string };
      return ok(`Gmail-Zugang aktiv für ${json.emailAddress ?? 'unbekanntes Konto'}.`);
    } catch (error) {
      return err(
        makeError('mail.connection', 'Die Gmail-API ist nicht erreichbar.', {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    }
  }
}

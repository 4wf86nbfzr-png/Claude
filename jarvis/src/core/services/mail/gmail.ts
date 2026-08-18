import MailComposer from 'nodemailer/lib/mail-composer';
import type { CredentialService } from '../credentials';
import { GoogleOAuthClient } from './googleOAuth';
import type { MailTransport, OutgoingMessage, SendResult } from './types';

const SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/**
 * Versand über die Gmail-API mit OAuth.
 *
 * Gegenüber SMTP mit App-Passwort ist das der sauberere Weg: JARVIS bekommt
 * nur die Berechtigung "Mail senden/lesen" und nie das Kontopasswort.
 */
export class GmailTransport implements MailTransport {
  readonly id = 'gmail';
  readonly label = 'Gmail (OAuth)';
  private accessToken: string | null = null;
  private accessTokenExpiry = 0;

  constructor(
    private readonly credentials: CredentialService,
    private readonly oauth = new GoogleOAuthClient(
      credentials.get('GOOGLE_CLIENT_ID'),
      credentials.get('GOOGLE_CLIENT_SECRET')
    )
  ) {}

  configured(): boolean {
    return this.oauth.configured() && Boolean(this.credentials.get('GOOGLE_REFRESH_TOKEN'));
  }

  missingHint(): string {
    if (!this.oauth.configured()) return this.oauth.missingHint();
    return 'Noch nicht mit Google verbunden – bitte in den Einstellungen "Mit Google verbinden" ausführen.';
  }

  /** Führt die Anmeldung durch und legt das Refresh-Token im Tresor ab. */
  async verbinden(browserOeffnen: (url: string) => Promise<void> | void, scopes: string[]): Promise<void> {
    const tokens = await this.oauth.anmelden(scopes, browserOeffnen);
    if (!tokens.refreshToken) {
      throw new Error('Google hat kein Refresh-Token geliefert. Bitte den Zugriff in den Google-Kontoeinstellungen entfernen und erneut verbinden.');
    }
    this.credentials.set('GOOGLE_REFRESH_TOKEN', tokens.refreshToken);
    this.accessToken = tokens.accessToken;
    this.accessTokenExpiry = tokens.expiresAt;
  }

  private async zugriffstoken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiry - 60_000) return this.accessToken;
    const refreshToken = this.credentials.get('GOOGLE_REFRESH_TOKEN');
    if (!refreshToken) throw new Error(this.missingHint());
    const tokens = await this.oauth.erneuern(refreshToken);
    this.accessToken = tokens.accessToken;
    this.accessTokenExpiry = tokens.expiresAt;
    return tokens.accessToken;
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    if (!this.configured()) return { ok: false, error: this.missingHint() };
    try {
      const token = await this.zugriffstoken();
      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) return { ok: false, error: `Gmail antwortete mit HTTP ${response.status}.` };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }

  async send(message: OutgoingMessage): Promise<SendResult> {
    if (!this.configured()) return { ok: false, error: `Gmail ist nicht eingerichtet. ${this.missingHint()}` };
    try {
      const token = await this.zugriffstoken();
      const raw = await baueRohnachricht(message);
      const response = await fetch(SEND_ENDPOINT, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw })
      });
      const data = (await response.json().catch(() => ({}))) as {
        id?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        return { ok: false, error: `Gmail lehnte den Versand ab (HTTP ${response.status}): ${data.error?.message ?? ''}`.trim() };
      }
      return { ok: true, messageId: data.id };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
  }
}

/** Baut die vollständige MIME-Nachricht und kodiert sie base64url für Gmail. */
export async function baueRohnachricht(message: OutgoingMessage): Promise<string> {
  const composer = new MailComposer({
    from: { name: message.from.name, address: message.from.address },
    to: message.to,
    cc: message.cc.length ? message.cc : undefined,
    bcc: message.bcc.length ? message.bcc : undefined,
    replyTo: message.replyTo ?? undefined,
    subject: message.subject,
    text: message.text,
    html: message.html ?? undefined,
    inReplyTo: message.inReplyTo ?? undefined,
    references: message.references?.length ? message.references : undefined,
    attachments: message.attachments.map((anhang) => ({
      filename: anhang.filename,
      path: anhang.path,
      contentType: anhang.contentType
    }))
  });
  const buffer = await composer.compile().build();
  return buffer.toString('base64url');
}

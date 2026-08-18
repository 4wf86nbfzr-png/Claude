import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { buildMime, toBase64Url } from './mime.js';
import { OAuthClient } from './oauth.js';
import type { MailTransport, OutgoingMessage, SendOutcome } from './types.js';

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

/**
 * Versand ueber die Gmail-API mit OAuth.
 *
 * Gegenueber SMTP der bessere Weg fuer Google-Konten: kein App-Passwort
 * noetig, die gesendete Mail landet im Ordner "Gesendet" und Antworten
 * lassen sich ueber die Thread-ID zuordnen.
 */
export class GmailTransport implements MailTransport {
  readonly id = 'gmail' as const;
  readonly label = 'Gmail (OAuth)';
  readonly oauth: OAuthClient;

  constructor(
    private readonly env: JarvisEnv,
    private readonly credentials: CredentialService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.oauth = new OAuthClient(
      {
        namespace: 'GOOGLE',
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        clientId: this.credentials.get('GOOGLE_CLIENT_ID') ?? env.GOOGLE_CLIENT_ID ?? '',
        clientSecret: this.credentials.get('GOOGLE_CLIENT_SECRET') ?? env.GOOGLE_CLIENT_SECRET ?? null,
        redirectUri: env.GOOGLE_REDIRECT_URI,
        scopes: GMAIL_SCOPES,
        // Ohne diese beiden Parameter liefert Google kein refresh_token.
        extraAuthParams: { access_type: 'offline', prompt: 'consent' },
      },
      credentials,
      fetchImpl,
    );
  }

  private get clientId(): string {
    return this.credentials.get('GOOGLE_CLIENT_ID') ?? this.env.GOOGLE_CLIENT_ID ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId) && this.oauth.hasTokens();
  }

  missingConfigHint(): string | null {
    if (!this.clientId) {
      return 'GOOGLE_CLIENT_ID fehlt. In der Google Cloud Console ein OAuth-Client-ID vom Typ "Desktop" anlegen.';
    }
    if (!this.oauth.hasTokens()) return 'Google-Konto ist noch nicht verbunden (Einstellungen → Postfach verbinden).';
    return null;
  }

  async verify(): Promise<Result<{ info: string }>> {
    const token = await this.oauth.accessToken();
    if (!token.ok) return token;
    try {
      const res = await this.fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { authorization: `Bearer ${token.data}` },
      });
      const text = await res.text();
      if (!res.ok) return err('PROVIDER_ERROR', `Gmail antwortete mit HTTP ${res.status}: ${text.slice(0, 300)}`);
      const profile = JSON.parse(text) as { emailAddress?: string };
      if (profile.emailAddress) this.oauth.saveAccount(profile.emailAddress);
      return ok({ info: `Verbunden als ${profile.emailAddress ?? 'unbekannt'}.` });
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  async defaultFrom(): Promise<string | null> {
    const stored = this.oauth.storedAccount();
    if (stored) return stored;
    const v = await this.verify();
    return v.ok ? this.oauth.storedAccount() : null;
  }

  async send(message: OutgoingMessage): Promise<Result<SendOutcome>> {
    const token = await this.oauth.accessToken();
    if (!token.ok) return token;

    try {
      const raw = toBase64Url(await buildMime(message));
      const res = await this.fetchImpl('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.data}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      const text = await res.text();
      if (!res.ok) {
        return err('SEND_FAILED', `Gmail hat den Versand abgelehnt (HTTP ${res.status}): ${text.slice(0, 400)}`, {
          hint: res.status === 403 ? 'Fehlt der Bereich gmail.send in der Zustimmung? Konto neu verbinden.' : undefined,
          detail: { status: res.status },
        });
      }
      const json = JSON.parse(text) as { id?: string; threadId?: string };
      return ok({
        messageId: json.id ?? null,
        provider: 'gmail',
        accepted: message.to.map((t) => t.address),
        rejected: [],
        response: json.threadId ? `threadId=${json.threadId}` : undefined,
      });
    } catch (e) {
      return fromException(e, 'SEND_FAILED');
    }
  }
}

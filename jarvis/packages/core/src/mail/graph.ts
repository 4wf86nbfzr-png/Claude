import type { JarvisEnv } from '../config/env.js';
import type { CredentialService } from '../services/credentials.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { buildMime } from './mime.js';
import { OAuthClient } from './oauth.js';
import type { MailTransport, OutgoingMessage, SendOutcome } from './types.js';

const GRAPH_SCOPES = ['offline_access', 'openid', 'email', 'Mail.Send', 'Mail.Read', 'User.Read'];

/**
 * Microsoft 365 / Outlook ueber Microsoft Graph.
 *
 * Graph nimmt bei `sendMail` eine fertige MIME-Nachricht entgegen, wenn man
 * `text/plain` als Content-Type schickt -- damit teilen sich alle drei
 * Transporte denselben MIME-Aufbau.
 */
export class GraphTransport implements MailTransport {
  readonly id = 'graph' as const;
  readonly label = 'Microsoft 365 / Outlook';
  readonly oauth: OAuthClient;

  constructor(
    private readonly env: JarvisEnv,
    private readonly credentials: CredentialService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const tenant = this.credentials.get('MS_TENANT_ID') ?? env.MS_TENANT_ID;
    this.oauth = new OAuthClient(
      {
        namespace: 'MS',
        authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        clientId: this.credentials.get('MS_CLIENT_ID') ?? env.MS_CLIENT_ID ?? '',
        clientSecret: this.credentials.get('MS_CLIENT_SECRET') ?? env.MS_CLIENT_SECRET ?? null,
        redirectUri: env.MS_REDIRECT_URI,
        scopes: GRAPH_SCOPES,
      },
      credentials,
      fetchImpl,
    );
  }

  private get clientId(): string {
    return this.credentials.get('MS_CLIENT_ID') ?? this.env.MS_CLIENT_ID ?? '';
  }

  isConfigured(): boolean {
    return Boolean(this.clientId) && this.oauth.hasTokens();
  }

  missingConfigHint(): string | null {
    if (!this.clientId) {
      return 'MS_CLIENT_ID fehlt. Im Entra-Portal eine App-Registrierung anlegen (Plattform: mobile/desktop, Umleitung auf 127.0.0.1).';
    }
    if (!this.oauth.hasTokens()) return 'Microsoft-Konto ist noch nicht verbunden (Einstellungen → Postfach verbinden).';
    return null;
  }

  async verify(): Promise<Result<{ info: string }>> {
    const token = await this.oauth.accessToken();
    if (!token.ok) return token;
    try {
      const res = await this.fetchImpl('https://graph.microsoft.com/v1.0/me', {
        headers: { authorization: `Bearer ${token.data}` },
      });
      const text = await res.text();
      if (!res.ok) return err('PROVIDER_ERROR', `Microsoft Graph antwortete mit HTTP ${res.status}: ${text.slice(0, 300)}`);
      const me = JSON.parse(text) as { mail?: string; userPrincipalName?: string; displayName?: string };
      const address = me.mail ?? me.userPrincipalName ?? null;
      if (address) this.oauth.saveAccount(address);
      return ok({ info: `Verbunden als ${me.displayName ?? address ?? 'unbekannt'}.` });
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
      const mime = await buildMime(message);
      const res = await this.fetchImpl('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { authorization: `Bearer ${token.data}`, 'content-type': 'text/plain' },
        body: mime.toString('base64'),
      });
      if (res.status !== 202) {
        const text = await res.text();
        return err('SEND_FAILED', `Microsoft Graph hat den Versand abgelehnt (HTTP ${res.status}): ${text.slice(0, 400)}`, {
          hint: res.status === 403 ? 'Fehlt die Berechtigung Mail.Send? Konto neu verbinden.' : undefined,
        });
      }
      return ok({
        // Graph liefert bei sendMail keine Message-ID zurueck.
        messageId: null,
        provider: 'graph',
        accepted: message.to.map((t) => t.address),
        rejected: [],
        response: 'HTTP 202 Accepted',
      });
    } catch (e) {
      return fromException(e, 'SEND_FAILED');
    }
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { CredentialService } from '../services/credentials.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { safeEqual } from '../services/credentials.js';

/**
 * OAuth-2.0-Anmeldung mit Authorization Code + PKCE ueber einen kurzlebigen
 * lokalen Webserver.
 *
 * Bewusst kein Client-Secret im Code und kein Fremdserver: der Browser des
 * Nutzers leitet auf 127.0.0.1 zurueck, der Code wird sofort gegen Tokens
 * getauscht und die Tokens landen im CredentialService.
 */

export interface OAuthConfig {
  /** Praefix fuer die Schluesselnamen im Credential-Speicher, z.B. 'GOOGLE'. */
  namespace: string;
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  scopes: string[];
  /** Zusaetzliche Parameter fuer den Autorisierungsaufruf. */
  extraAuthParams?: Record<string, string>;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // ms seit Epoche
  scope?: string;
  tokenType?: string;
}

export interface PendingAuthorization {
  /** Diese URL muss im Browser geoeffnet werden. */
  url: string;
  /** Wartet auf die Rueckleitung; loest mit dem Token-Satz auf. */
  completion: Promise<Result<TokenSet>>;
  cancel(): void;
}

export class OAuthClient {
  constructor(
    private readonly config: OAuthConfig,
    private readonly credentials: CredentialService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private key(suffix: string): string {
    return `${this.config.namespace}_${suffix}`;
  }

  hasTokens(): boolean {
    return Boolean(this.credentials.get(this.key('REFRESH_TOKEN')));
  }

  storedAccount(): string | null {
    return this.credentials.get(this.key('ACCOUNT'));
  }

  saveAccount(email: string): void {
    this.credentials.set(this.key('ACCOUNT'), email);
  }

  /**
   * Startet den Anmeldevorgang. Der Aufrufer oeffnet `url` im Browser
   * (im Desktop macht das `shell.openExternal`).
   */
  beginAuthorization(): PendingAuthorization {
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');

    const redirect = new URL(this.config.redirectUri);
    const port = Number(redirect.port || 80);

    let resolveFn: (r: Result<TokenSet>) => void = () => {};
    const completion = new Promise<Result<TokenSet>>((resolve) => (resolveFn = resolve));

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end('Nicht gefunden');
        return;
      }
      const returnedState = url.searchParams.get('state') ?? '';
      const code = url.searchParams.get('code');
      const oauthError = url.searchParams.get('error');

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (oauthError) {
        res.end(page('Anmeldung abgebrochen', `Der Anbieter meldet: ${escapeText(oauthError)}`));
        finish(err('PERMISSION_DENIED', `Anmeldung abgebrochen: ${oauthError}`));
        return;
      }
      if (!code || !safeEqual(returnedState, state)) {
        res.end(page('Anmeldung fehlgeschlagen', 'Der Rückgabewert passte nicht zur Anfrage.'));
        finish(err('PERMISSION_DENIED', 'Der state-Parameter passte nicht — Anmeldung abgebrochen.'));
        return;
      }
      res.end(page('Fertig', 'Sie können dieses Fenster schließen und zu JARVIS zurückkehren.'));

      void this.exchangeCode(code, verifier).then(finish);
    });

    const finish = (r: Result<TokenSet>) => {
      server.close();
      if (r.ok) this.storeTokens(r.data);
      resolveFn(r);
    };

    server.on('error', (e) => finish(fromException(e, 'NETWORK_ERROR')));
    server.listen(port, '127.0.0.1');

    // Sicherheitsnetz: nach 5 Minuten aufgeben.
    const timer = setTimeout(() => finish(err('TIMEOUT', 'Die Anmeldung wurde nicht innerhalb von 5 Minuten abgeschlossen.')), 300_000);
    void completion.finally(() => clearTimeout(timer));

    const authUrl = new URL(this.config.authorizeUrl);
    authUrl.searchParams.set('client_id', this.config.clientId);
    authUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', this.config.scopes.join(' '));
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    for (const [k, v] of Object.entries(this.config.extraAuthParams ?? {})) {
      authUrl.searchParams.set(k, v);
    }

    return {
      url: authUrl.toString(),
      completion,
      cancel: () => finish(err('PERMISSION_DENIED', 'Anmeldung durch den Benutzer abgebrochen.')),
    };
  }

  private async exchangeCode(code: string, verifier: string): Promise<Result<TokenSet>> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: verifier,
    });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);
    return this.tokenRequest(body);
  }

  /** Liefert ein gueltiges Zugriffstoken, erneuert es bei Bedarf. */
  async accessToken(): Promise<Result<string>> {
    const stored = this.credentials.get(this.key('ACCESS_TOKEN'));
    const expiry = Number(this.credentials.get(this.key('EXPIRES_AT')) ?? '0');
    if (stored && expiry > Date.now() + 60_000) return ok(stored);

    const refresh = this.credentials.get(this.key('REFRESH_TOKEN'));
    if (!refresh) {
      return err('NOT_CONFIGURED', `Für ${this.config.namespace} liegt keine Anmeldung vor.`, {
        hint: 'Bitte in den Einstellungen unter "Postfach verbinden" anmelden.',
      });
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: this.config.clientId,
    });
    if (this.config.clientSecret) body.set('client_secret', this.config.clientSecret);

    const refreshed = await this.tokenRequest(body);
    if (!refreshed.ok) return refreshed;
    this.storeTokens({ ...refreshed.data, refreshToken: refreshed.data.refreshToken ?? refresh });
    return ok(refreshed.data.accessToken);
  }

  private async tokenRequest(body: URLSearchParams): Promise<Result<TokenSet>> {
    try {
      const res = await this.fetchImpl(this.config.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const text = await res.text();
      if (!res.ok) {
        return err('PROVIDER_ERROR', `Token-Abruf fehlgeschlagen (HTTP ${res.status}): ${text.slice(0, 300)}`, {
          hint: 'Client-ID, Client-Secret und Redirect-URI in der Anbieter-Konsole prüfen.',
        });
      }
      const json = JSON.parse(text) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
      };
      return ok({
        accessToken: json.access_token,
        refreshToken: json.refresh_token ?? null,
        expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
        scope: json.scope,
        tokenType: json.token_type,
      });
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    }
  }

  private storeTokens(tokens: TokenSet): void {
    this.credentials.set(this.key('ACCESS_TOKEN'), tokens.accessToken);
    this.credentials.set(this.key('EXPIRES_AT'), String(tokens.expiresAt));
    if (tokens.refreshToken) this.credentials.set(this.key('REFRESH_TOKEN'), tokens.refreshToken);
  }

  signOut(): void {
    for (const s of ['ACCESS_TOKEN', 'REFRESH_TOKEN', 'EXPIRES_AT', 'ACCOUNT']) {
      this.credentials.delete(this.key(s));
    }
  }
}

function escapeText(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="de"><meta charset="utf-8">
<title>JARVIS – ${escapeText(title)}</title>
<style>
  body{background:#08080A;color:#F6F6F8;font:16px/1.6 system-ui,sans-serif;
       display:grid;place-items:center;height:100vh;margin:0}
  div{max-width:34rem;padding:2rem;text-align:center}
  h1{font-size:1.5rem;letter-spacing:.08em;text-transform:uppercase;margin:0 0 .75rem}
  p{color:#C7C7CD;margin:0}
</style>
<div><h1>${escapeText(title)}</h1><p>${body}</p></div>`;
}

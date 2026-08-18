import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly'
];
export const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

/**
 * OAuth-Ablauf für Google-Desktop-Clients (Loopback + PKCE).
 *
 * Bewusst kein Passwort im Programm: JARVIS öffnet den Browser, der Benutzer
 * meldet sich bei Google an, und zurück kommt nur ein Token. Das Refresh-Token
 * landet im verschlüsselten Tresor, nie in der Datenbank.
 */
export class GoogleOAuthClient {
  constructor(
    private readonly clientId: string | null,
    private readonly clientSecret: string | null
  ) {}

  configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  missingHint(): string {
    return 'GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET aus der Google Cloud Console (OAuth-Client vom Typ "Desktop") hinterlegen.';
  }

  /**
   * Führt die Anmeldung durch: startet einen lokalen Empfänger auf 127.0.0.1,
   * öffnet die Google-Seite und wartet auf die Rückleitung.
   */
  async anmelden(
    scopes: string[],
    browserOeffnen: (url: string) => Promise<void> | void,
    timeoutMs = 300_000
  ): Promise<GoogleTokens> {
    if (!this.configured()) throw new Error(this.missingHint());
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(16).toString('hex');

    return new Promise<GoogleTokens>((resolve, reject) => {
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/oauth') {
          response.writeHead(404).end();
          return;
        }
        const code = url.searchParams.get('code');
        const zurueck = url.searchParams.get('state');
        const fehler = url.searchParams.get('error');
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(
          `<!doctype html><meta charset="utf-8"><title>JARVIS</title>` +
            `<body style="font-family:system-ui;background:#08080A;color:#F6F6F8;display:grid;place-items:center;height:100vh;margin:0">` +
            `<p>${fehler ? 'Anmeldung abgebrochen.' : 'Anmeldung abgeschlossen. Sie können dieses Fenster schließen.'}</p></body>`
        );
        server.close();
        globalThis.clearTimeout(timer);
        if (fehler) return reject(new Error(`Google meldete: ${fehler}`));
        if (!code || zurueck !== state) return reject(new Error('Ungültige Antwort von Google (Status stimmt nicht).'));
        this.tauscheCode(code, verifier, redirectUri()).then(resolve, reject);
      });

      const timer = globalThis.setTimeout(() => {
        server.close();
        reject(new Error('Zeitüberschreitung: Die Anmeldung wurde nicht innerhalb von fünf Minuten abgeschlossen.'));
      }, timeoutMs);

      let port = 0;
      const redirectUri = () => `http://127.0.0.1:${port}/oauth`;

      server.on('error', (error) => {
        globalThis.clearTimeout(timer);
        reject(error);
      });

      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        const url = new URL(AUTH_ENDPOINT);
        url.searchParams.set('client_id', this.clientId ?? '');
        url.searchParams.set('redirect_uri', redirectUri());
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', scopes.join(' '));
        url.searchParams.set('access_type', 'offline');
        url.searchParams.set('prompt', 'consent');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        void browserOeffnen(url.toString());
      });
    });
  }

  private async tauscheCode(code: string, verifier: string, redirectUri: string): Promise<GoogleTokens> {
    return this.tokenAnfrage({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri
    });
  }

  async erneuern(refreshToken: string): Promise<GoogleTokens> {
    const tokens = await this.tokenAnfrage({ grant_type: 'refresh_token', refresh_token: refreshToken });
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
  }

  private async tokenAnfrage(felder: Record<string, string>): Promise<GoogleTokens> {
    const body = new URLSearchParams({
      client_id: this.clientId ?? '',
      client_secret: this.clientSecret ?? '',
      ...felder
    });
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error_description?: string;
      error?: string;
    };
    if (!response.ok || !data.access_token) {
      throw new Error(`Google-Token-Anfrage fehlgeschlagen: ${data.error_description ?? data.error ?? response.status}`);
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      scope: data.scope ?? felder.scope ?? ''
    };
  }
}

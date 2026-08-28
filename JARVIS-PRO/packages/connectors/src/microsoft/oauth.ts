import { createServer } from 'node:http';
import type { Clock } from '@jarvis/domain';
import { createPkcePair, randomToken, constantTimeEquals, type SecretStore } from '@jarvis/security';
import type { Logger } from '@jarvis/observability';
import { metrics } from '@jarvis/observability';
import { ConnectorError } from '../types.js';

/**
 * OAuth 2.0 fuer Microsoft Graph, Authorization Code mit PKCE.
 *
 * Warum dieser Flow: Jarvis laeuft als lokale Einzelplatzanwendung ohne
 * Serverkomponente. Ein Client Secret waere dort nicht geheim zu halten -
 * es laege auf der Platte des Rechners. Der Microsoft-Identity-Platform-Doku
 * zufolge duerfen oeffentliche Clients (Desktop, Mobil, SPA) genau deshalb
 * kein Secret verwenden und sollen PKCE einsetzen. Der Code-Verifier bleibt
 * im Prozess, nur die Challenge geht ueber den Browser.
 *
 * Der Refresh Token landet im Schluesselbund des Betriebssystems, nie in
 * einer Datei und nie im Log.
 *
 * STATUS: unverified. Die Endpunkte und Berechtigungsnamen unten sind gegen
 * die offizielle Dokumentation angelegt, aber in dieser Umgebung ist der
 * Zugriff auf login.microsoftonline.com und graph.microsoft.com durch den
 * Netzwerk-Proxy gesperrt - ein echter Anmeldevorgang konnte nicht laufen.
 * Vor dem ersten Einsatz: `docs/api-annahmen.md` durchgehen.
 */

/** Alle veraenderlichen Angaben an einer Stelle - nicht ueber den Code verteilt. */
export const MS_ENDPOINTS = {
  authorizeTemplate: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
  tokenTemplate: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
  graphBase: 'https://graph.microsoft.com/v1.0',
} as const;

/**
 * Minimal noetige delegierte Berechtigungen.
 * Bewusst KEIN Mail.ReadWrite und kein Mail.Send.Shared: Jarvis liest und
 * sendet, mehr braucht er nicht. Loeschen kann er dadurch nicht, auch nicht
 * versehentlich und auch nicht, wenn eine E-Mail ihn dazu auffordert.
 */
export const MS_SCOPES = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.Read',
  'Mail.Send',
  'Calendars.ReadWrite',
] as const;

export interface MsOAuthConfig {
  readonly tenantId: string;
  readonly clientId: string;
  /** Muss in der App-Registrierung als Redirect-URI eingetragen sein. */
  readonly redirectUri: string;
  readonly scopes?: readonly string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface MsOAuthDeps {
  readonly secrets: SecretStore;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly fetchImpl?: typeof fetch;
}

const REFRESH_TOKEN_KEY = 'ms-refresh-token';
/** Puffer, damit ein Token nicht mitten im Gespraech ablaeuft. */
const EXPIRY_SKEW_SECONDS = 120;

export class MicrosoftOAuth {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;
  private inFlight: Promise<string> | null = null;

  constructor(
    private readonly config: MsOAuthConfig,
    private readonly deps: MsOAuthDeps,
  ) {}

  private url(template: string): string {
    return template.replace('{tenant}', encodeURIComponent(this.config.tenantId));
  }

  private get scopeString(): string {
    return (this.config.scopes ?? MS_SCOPES).join(' ');
  }

  /**
   * Fuehrt die einmalige interaktive Anmeldung durch.
   *
   * Ablauf: lokaler Einmal-Listener auf dem Redirect-Port, Browser-URL wird
   * ausgegeben, Noah meldet sich an, der Code kommt zurueck, wird sofort
   * gegen Tokens getauscht. Der `state` schuetzt gegen untergeschobene
   * Antworten und wird in konstanter Zeit verglichen.
   */
  async runInteractiveLogin(openUrl: (url: string) => void): Promise<{ account: string }> {
    const { verifier, challenge, method } = createPkcePair();
    const state = randomToken(24);
    const redirect = new URL(this.config.redirectUri);

    const authorizeUrl = new URL(this.url(MS_ENDPOINTS.authorizeTemplate));
    authorizeUrl.searchParams.set('client_id', this.config.clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('redirect_uri', this.config.redirectUri);
    authorizeUrl.searchParams.set('response_mode', 'query');
    authorizeUrl.searchParams.set('scope', this.scopeString);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', method);

    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        server.close();
        reject(new ConnectorError('Anmeldung abgebrochen: Zeitueberschreitung', 'auth', false));
      }, 5 * 60 * 1000);

      const server = createServer((req, res) => {
        const requestUrl = new URL(req.url ?? '/', `http://${redirect.host}`);
        if (requestUrl.pathname !== redirect.pathname) {
          res.writeHead(404).end();
          return;
        }
        const returnedState = requestUrl.searchParams.get('state') ?? '';
        const returnedCode = requestUrl.searchParams.get('code');
        const error = requestUrl.searchParams.get('error');

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        if (error !== null) {
          res.end('<h1>Anmeldung fehlgeschlagen</h1><p>Du kannst dieses Fenster schliessen.</p>');
          clearTimeout(timer);
          server.close();
          reject(new ConnectorError(`Anmeldung abgelehnt: ${error}`, 'auth', false));
          return;
        }
        if (!constantTimeEquals(returnedState, state) || returnedCode === null) {
          res.end('<h1>Ungueltige Antwort</h1><p>Du kannst dieses Fenster schliessen.</p>');
          clearTimeout(timer);
          server.close();
          reject(new ConnectorError('Anmeldung abgelehnt: state passt nicht', 'auth', false));
          return;
        }
        res.end('<h1>Geschafft</h1><p>Jarvis ist verbunden. Du kannst dieses Fenster schliessen.</p>');
        clearTimeout(timer);
        server.close();
        resolve(returnedCode);
      });

      server.on('error', reject);
      server.listen(Number(redirect.port), redirect.hostname, () => {
        openUrl(authorizeUrl.toString());
      });
    });

    const tokens = await this.exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: verifier,
    });

    if (tokens.refresh_token === undefined) {
      throw new ConnectorError(
        'Kein Refresh Token erhalten. Ist "offline_access" in den Berechtigungen enthalten?',
        'auth',
        false,
      );
    }
    await this.deps.secrets.set(REFRESH_TOKEN_KEY, tokens.refresh_token);
    this.setAccessToken(tokens);

    return { account: await this.fetchAccountName(tokens.access_token) };
  }

  /**
   * Liefert einen gueltigen Access Token. Erneuert automatisch und stellt
   * sicher, dass parallele Aufrufe nur EINE Erneuerung ausloesen - sonst
   * invalidieren sich rotierende Refresh Tokens gegenseitig.
   */
  async getAccessToken(forceRefresh = false): Promise<string> {
    const now = this.deps.clock.now().getTime();
    if (!forceRefresh && this.accessToken !== null && now < this.accessTokenExpiresAt) {
      return this.accessToken;
    }
    if (this.inFlight !== null) return this.inFlight;

    this.inFlight = this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async refresh(): Promise<string> {
    const refreshToken = await this.deps.secrets.get(REFRESH_TOKEN_KEY);
    if (refreshToken === null) {
      throw new ConnectorError(
        'Kein Refresh Token hinterlegt. Bitte einmal "pnpm connect:microsoft" ausfuehren.',
        'auth',
        false,
      );
    }
    try {
      const tokens = await this.exchange({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: this.scopeString,
      });
      // Microsoft rotiert Refresh Tokens: der neue muss sofort gespeichert
      // werden, sonst ist der alte beim naechsten Mal wertlos.
      if (tokens.refresh_token !== undefined) {
        await this.deps.secrets.set(REFRESH_TOKEN_KEY, tokens.refresh_token);
      }
      this.setAccessToken(tokens);
      return tokens.access_token;
    } catch (err) {
      metrics.oauthRenewFailures.inc({ provider: 'microsoft' });
      this.deps.logger.error('oauth_erneuerung_fehlgeschlagen', {
        provider: 'microsoft',
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private setAccessToken(tokens: TokenResponse): void {
    this.accessToken = tokens.access_token;
    this.accessTokenExpiresAt =
      this.deps.clock.now().getTime() + Math.max(0, tokens.expires_in - EXPIRY_SKEW_SECONDS) * 1000;
  }

  private async exchange(params: Record<string, string>): Promise<TokenResponse> {
    const doFetch = this.deps.fetchImpl ?? fetch;
    const body = new URLSearchParams({ client_id: this.config.clientId, ...params });

    const res = await doFetch(this.url(MS_ENDPOINTS.tokenTemplate), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // Die Fehlermeldung geht ins Log - deshalb nur der Fehlercode, nie der Body,
      // in dem der Token stehen koennte.
      let code = 'unbekannt';
      try {
        code = (JSON.parse(text) as { error?: string }).error ?? 'unbekannt';
      } catch {
        /* Text war kein JSON */
      }
      throw new ConnectorError(`Tokenabruf fehlgeschlagen (${res.status}): ${code}`, 'auth', res.status >= 500);
    }
    return (await res.json()) as TokenResponse;
  }

  private async fetchAccountName(accessToken: string): Promise<string> {
    const doFetch = this.deps.fetchImpl ?? fetch;
    const res = await doFetch(`${MS_ENDPOINTS.graphBase}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return 'unbekannt';
    const me = (await res.json()) as { userPrincipalName?: string; mail?: string };
    return me.mail ?? me.userPrincipalName ?? 'unbekannt';
  }

  async isConnected(): Promise<boolean> {
    return (await this.deps.secrets.get(REFRESH_TOKEN_KEY)) !== null;
  }

  /** Loescht die Anbindung. Fuer den Fall eines verlorenen Geraets. */
  async disconnect(): Promise<void> {
    await this.deps.secrets.delete(REFRESH_TOKEN_KEY);
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }
}

import type { Logger } from '@jarvis/observability';
import { ConnectorError, classifyHttpError, retryDelayMs } from './types.js';

/**
 * HTTP-Schicht der Connectors.
 *
 * Eine Stelle, an der Wiederholung, Fehlerklassifikation, Zeitueberschreitung
 * und Tokenerneuerung geregelt sind - damit nicht jeder Adapter das noch
 * einmal auf seine Weise loest und dabei etwas vergisst.
 *
 * Wichtig fuer den Versand: hier wird NICHT blind wiederholt. Ein Fehler nach
 * dem Absenden kann bedeuten, dass die Nachricht trotzdem raus ist. Deshalb
 * ist `retryOnServerError` fuer schreibende Aufrufe standardmaessig aus; die
 * Idempotenz liegt eine Ebene hoeher in der Approval Engine.
 */
export interface HttpOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
  readonly maxRetries?: number;
  /** Bei 5xx wiederholen. Fuer schreibende Aufrufe bewusst false. */
  readonly retryOnServerError?: boolean;
  readonly signal?: AbortSignal;
}

export interface HttpDeps {
  readonly logger: Logger;
  /** Liefert einen gueltigen Access Token. Wird bei 401 einmal erneuert aufgerufen. */
  readonly accessToken?: (forceRefresh: boolean) => Promise<string>;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface HttpResponse<T> {
  readonly status: number;
  readonly data: T;
  readonly headers: Headers;
}

const DEFAULT_TIMEOUT_MS = 20_000;

export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly deps: HttpDeps,
  ) {}

  async request<T>(path: string, opts: HttpOptions = {}): Promise<HttpResponse<T>> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const method = opts.method ?? 'GET';
    const maxRetries = opts.maxRetries ?? (method === 'GET' ? 3 : 0);
    const retryOnServer = opts.retryOnServerError ?? method === 'GET';
    const doFetch = this.deps.fetchImpl ?? fetch;
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

    let refreshed = false;
    let attempt = 0;

    for (;;) {
      attempt += 1;
      const headers: Record<string, string> = {
        Accept: 'application/json',
        ...opts.headers,
      };
      if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
      if (this.deps.accessToken !== undefined) {
        headers['Authorization'] = `Bearer ${await this.deps.accessToken(refreshed)}`;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const onOuterAbort = (): void => controller.abort();
      opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers,
          signal: controller.signal,
          ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
        });
      } catch (err) {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
        const network = new ConnectorError(
          err instanceof Error ? err.message : 'Netzwerkfehler',
          'network',
          true,
        );
        if (attempt > maxRetries) throw network;
        await sleep(retryDelayMs(attempt, null));
        continue;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }

      if (res.ok) {
        const text = await res.text();
        const data = (text.length > 0 ? JSON.parse(text) : {}) as T;
        return { status: res.status, data, headers: res.headers };
      }

      const bodyText = await res.text().catch(() => '');
      const error = classifyHttpError(res.status, bodyText);

      // Bei 401 genau EINMAL das Token erneuern und den Aufruf wiederholen.
      // Ein zweiter 401 ist ein echtes Berechtigungsproblem, kein abgelaufenes Token.
      if (error.kind === 'auth' && !refreshed && this.deps.accessToken !== undefined) {
        refreshed = true;
        this.deps.logger.info('token_wird_erneuert', { url: redactUrl(url) });
        continue;
      }

      const retryable = error.kind === 'rate_limit' || (retryOnServer && error.kind === 'server');
      if (retryable && attempt <= maxRetries) {
        const wait = retryDelayMs(attempt, res.headers.get('retry-after'));
        this.deps.logger.warn('provider_wiederholung', {
          url: redactUrl(url),
          status: res.status,
          attempt,
          waitMs: wait,
        });
        await sleep(wait);
        continue;
      }

      throw error;
    }
  }

  get<T>(path: string, opts: Omit<HttpOptions, 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...opts, method: 'GET' });
  }

  post<T>(path: string, body: unknown, opts: Omit<HttpOptions, 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  }

  patch<T>(path: string, body: unknown, opts: Omit<HttpOptions, 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...opts, method: 'PATCH', body });
  }

  delete<T>(path: string, opts: Omit<HttpOptions, 'method' | 'body'> = {}): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  }
}

/** Entfernt Tokens aus einer URL, bevor sie ins Log geht. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      // Ohne Klammern: die wuerden beim Serialisieren prozentkodiert und
      // waeren im Log schlechter lesbar als der Hinweis selbst.
      if (/token|key|secret|code|sig/i.test(key)) u.searchParams.set(key, 'redigiert');
    }
    return u.toString();
  } catch {
    return '[unlesbare URL]';
  }
}

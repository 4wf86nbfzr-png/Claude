import { err, fromException, ok, type Result } from '../../util/result.js';
import { decodeEntities, htmlToText, truncate } from '../../util/text.js';
import type { SearchHit, SearchOptions, SearchProvider } from './types.js';

type FetchLike = typeof fetch;

const DEFAULT_TIMEOUT = 20_000;

async function getJson(fetchImpl: FetchLike, url: string, init: RequestInit, signal?: AbortSignal): Promise<Result<unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Zeitüberschreitung')), DEFAULT_TIMEOUT);
  const relay = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', relay, { once: true });
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      return err('PROVIDER_ERROR', `Suchdienst antwortete mit HTTP ${res.status}: ${truncate(text, 200)}`);
    }
    return ok(JSON.parse(text) as unknown);
  } catch (e) {
    return fromException(e, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', relay);
  }
}

// ---------------------------------------------------------------------------
// Tavily -- auf Recherche zugeschnitten, liefert brauchbare Textausschnitte
// ---------------------------------------------------------------------------

export class TavilySearch implements SearchProvider {
  readonly id = 'tavily';
  readonly label = 'Tavily';
  constructor(
    private readonly apiKey: string | null,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }
  missingConfigHint(): string | null {
    return this.isConfigured() ? null : 'TAVILY_API_KEY fehlt (tavily.com → API Keys).';
  }

  async search(options: SearchOptions): Promise<Result<SearchHit[]>> {
    if (!this.apiKey) return err('NOT_CONFIGURED', this.missingConfigHint()!);
    const res = await getJson(
      this.fetchImpl,
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: options.query,
          max_results: options.limit ?? 10,
          search_depth: 'advanced',
        }),
      },
      options.signal,
    );
    if (!res.ok) return res;
    const data = res.data as { results?: Array<{ title?: string; url?: string; content?: string }> };
    return ok(
      (data.results ?? []).map((r, i) => ({
        title: r.title ?? r.url ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
        rank: i + 1,
      })).filter((h) => h.url),
    );
  }
}

// ---------------------------------------------------------------------------
// Brave Search
// ---------------------------------------------------------------------------

export class BraveSearch implements SearchProvider {
  readonly id = 'brave';
  readonly label = 'Brave Search';
  constructor(
    private readonly apiKey: string | null,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }
  missingConfigHint(): string | null {
    return this.isConfigured() ? null : 'BRAVE_API_KEY fehlt (brave.com/search/api).';
  }

  async search(options: SearchOptions): Promise<Result<SearchHit[]>> {
    if (!this.apiKey) return err('NOT_CONFIGURED', this.missingConfigHint()!);
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', options.query);
    url.searchParams.set('count', String(Math.min(options.limit ?? 10, 20)));
    if (options.market) url.searchParams.set('search_lang', options.market.split('-')[0] ?? 'de');

    const res = await getJson(
      this.fetchImpl,
      url.toString(),
      { headers: { accept: 'application/json', 'x-subscription-token': this.apiKey } },
      options.signal,
    );
    if (!res.ok) return res;
    const data = res.data as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
    return ok(
      (data.web?.results ?? []).map((r, i) => ({
        title: decodeEntities(stripTags(r.title ?? '')),
        url: r.url ?? '',
        snippet: decodeEntities(stripTags(r.description ?? '')),
        rank: i + 1,
      })).filter((h) => h.url),
    );
  }
}

// ---------------------------------------------------------------------------
// SerpAPI (Google-Ergebnisse)
// ---------------------------------------------------------------------------

export class SerpApiSearch implements SearchProvider {
  readonly id = 'serpapi';
  readonly label = 'SerpAPI (Google)';
  constructor(
    private readonly apiKey: string | null,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }
  missingConfigHint(): string | null {
    return this.isConfigured() ? null : 'SERPAPI_API_KEY fehlt (serpapi.com).';
  }

  async search(options: SearchOptions): Promise<Result<SearchHit[]>> {
    if (!this.apiKey) return err('NOT_CONFIGURED', this.missingConfigHint()!);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('q', options.query);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('num', String(options.limit ?? 10));
    url.searchParams.set('hl', 'de');
    url.searchParams.set('gl', 'de');

    const res = await getJson(this.fetchImpl, url.toString(), {}, options.signal);
    if (!res.ok) return res;
    const data = res.data as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
    return ok(
      (data.organic_results ?? []).map((r, i) => ({
        title: r.title ?? '',
        url: r.link ?? '',
        snippet: r.snippet ?? '',
        rank: i + 1,
      })).filter((h) => h.url),
    );
  }
}

// ---------------------------------------------------------------------------
// DuckDuckGo (ohne Schluessel)
// ---------------------------------------------------------------------------

/**
 * Notloesung ohne API-Schluessel: die HTML-Fassung von DuckDuckGo.
 * Funktioniert, ist aber empfindlich gegenueber Layoutaenderungen und
 * liefert weniger Treffer. Fuer ernsthafte Recherche einen der
 * Anbieter oben eintragen -- der Hinweis steht auch im README.
 */
export class DuckDuckGoSearch implements SearchProvider {
  readonly id = 'duckduckgo';
  readonly label = 'DuckDuckGo (ohne Schlüssel)';
  constructor(
    private readonly userAgent: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured(): boolean {
    return true;
  }
  missingConfigHint(): string | null {
    return null;
  }

  async search(options: SearchOptions): Promise<Result<SearchHit[]>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('Zeitüberschreitung')), DEFAULT_TIMEOUT);
    try {
      const res = await this.fetchImpl('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': this.userAgent,
          'accept-language': 'de-DE,de;q=0.9',
        },
        body: new URLSearchParams({ q: options.query, kl: 'de-de' }).toString(),
        signal: controller.signal,
      });
      if (!res.ok) return err('PROVIDER_ERROR', `DuckDuckGo antwortete mit HTTP ${res.status}.`);
      return ok(parseDuckDuckGoHtml(await res.text(), options.limit ?? 10));
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Getrennt gehalten, damit die Auswertung ohne Netz testbar ist. */
export function parseDuckDuckGoHtml(html: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const blockRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) && hits.length < limit) {
    const href = m[1];
    const titleHtml = m[2];
    if (!href || !titleHtml) continue;
    const url = unwrapDuckDuckGoLink(decodeEntities(href));
    if (!url) continue;
    hits.push({
      title: htmlToText(titleHtml),
      url,
      snippet: '',
      rank: hits.length + 1,
    });
  }

  // Beschreibungen liegen in eigenen Knoten und werden der Reihe nach zugeordnet.
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let i = 0;
  let s: RegExpExecArray | null;
  while ((s = snippetRe.exec(html)) && i < hits.length) {
    const hit = hits[i];
    if (hit && s[1]) hit.snippet = htmlToText(s[1]);
    i += 1;
  }
  return hits;
}

function unwrapDuckDuckGoLink(href: string): string | null {
  try {
    // DuckDuckGo verpackt Ziele in /l/?uddg=<urlencoded>
    if (href.startsWith('//duckduckgo.com/l/') || href.includes('/l/?uddg=')) {
      const u = new URL(href.startsWith('//') ? `https:${href}` : href, 'https://duckduckgo.com');
      const target = u.searchParams.get('uddg');
      return target ? new URL(target).toString() : null;
    }
    return new URL(href, 'https://duckduckgo.com').toString();
  } catch {
    return null;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

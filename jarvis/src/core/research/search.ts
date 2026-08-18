import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { ResearchSettings } from '../../shared/types.js';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, limit: number): Promise<Result<SearchHit[], JarvisError>>;
}

/* ------------------------------------------------------------------ */
/* Brave Search                                                        */
/* ------------------------------------------------------------------ */

export class BraveSearch implements SearchProvider {
  readonly name = 'Brave Search';
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit: number): Promise<Result<SearchHit[], JarvisError>> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(limit, 20)));
    url.searchParams.set('country', 'de');
    url.searchParams.set('search_lang', 'de');
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'x-subscription-token': this.apiKey },
      });
      if (!response.ok) return err(await searchHttpError(response, this.name));
      const json = (await response.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      return ok(
        (json.web?.results ?? [])
          .filter((hit): hit is { title: string; url: string; description?: string } => Boolean(hit.url))
          .map((hit) => ({
            title: hit.title ?? hit.url,
            url: hit.url,
            snippet: stripTags(hit.description ?? ''),
          })),
      );
    } catch (error) {
      return err(networkError(this.name, error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tavily                                                              */
/* ------------------------------------------------------------------ */

export class TavilySearch implements SearchProvider {
  readonly name = 'Tavily';
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit: number): Promise<Result<SearchHit[], JarvisError>> {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          max_results: Math.min(limit, 20),
          search_depth: 'basic',
        }),
      });
      if (!response.ok) return err(await searchHttpError(response, this.name));
      const json = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      return ok(
        (json.results ?? [])
          .filter((hit): hit is { title: string; url: string; content?: string } => Boolean(hit.url))
          .map((hit) => ({
            title: hit.title ?? hit.url,
            url: hit.url,
            snippet: stripTags(hit.content ?? '').slice(0, 400),
          })),
      );
    } catch (error) {
      return err(networkError(this.name, error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* SerpAPI                                                             */
/* ------------------------------------------------------------------ */

export class SerpApiSearch implements SearchProvider {
  readonly name = 'SerpAPI';
  constructor(private readonly apiKey: string) {}

  async search(query: string, limit: number): Promise<Result<SearchHit[], JarvisError>> {
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('q', query);
    url.searchParams.set('engine', 'google');
    url.searchParams.set('hl', 'de');
    url.searchParams.set('gl', 'de');
    url.searchParams.set('num', String(Math.min(limit, 20)));
    url.searchParams.set('api_key', this.apiKey);
    try {
      const response = await fetch(url);
      if (!response.ok) return err(await searchHttpError(response, this.name));
      const json = (await response.json()) as {
        organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
        error?: string;
      };
      if (json.error) {
        return err(makeError('research.search_error', `SerpAPI: ${json.error}`));
      }
      return ok(
        (json.organic_results ?? [])
          .filter((hit): hit is { title: string; link: string; snippet?: string } => Boolean(hit.link))
          .map((hit) => ({ title: hit.title ?? hit.link, url: hit.link, snippet: hit.snippet ?? '' })),
      );
    } catch (error) {
      return err(networkError(this.name, error));
    }
  }
}

/* ------------------------------------------------------------------ */
/* DuckDuckGo (no API key)                                             */
/* ------------------------------------------------------------------ */

/**
 * Keyless fallback so the app is usable before any search key is configured.
 * It reads the public HTML endpoint; results are thinner than the paid APIs,
 * which is stated in the setup assistant rather than hidden.
 */
export class DuckDuckGoSearch implements SearchProvider {
  readonly name = 'DuckDuckGo';
  constructor(private readonly userAgent: string) {}

  async search(query: string, limit: number): Promise<Result<SearchHit[], JarvisError>> {
    try {
      const response = await fetch('https://html.duckduckgo.com/html/', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': this.userAgent,
          'accept-language': 'de-DE,de;q=0.9',
        },
        body: new URLSearchParams({ q: query, kl: 'de-de' }),
      });
      if (!response.ok) return err(await searchHttpError(response, this.name));
      const html = await response.text();
      return ok(parseDuckDuckGo(html).slice(0, limit));
    } catch (error) {
      return err(networkError(this.name, error));
    }
  }
}

/** Exported for tests: extracts result triples from the HTML endpoint. */
export function parseDuckDuckGo(html: string): SearchHit[] {
  const hits: SearchHit[] = [];
  const anchor = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippet = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

  const snippets: string[] = [];
  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippet.exec(html)) !== null) {
    snippets.push(stripTags(snippetMatch[1] ?? ''));
  }

  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = anchor.exec(html)) !== null) {
    const href = decodeDuckDuckGoHref(match[1] ?? '');
    if (!href) {
      index += 1;
      continue;
    }
    hits.push({
      url: href,
      title: stripTags(match[2] ?? ''),
      snippet: snippets[index] ?? '',
    });
    index += 1;
  }
  return hits;
}

/** DuckDuckGo wraps targets in /l/?uddg=<encoded>. */
function decodeDuckDuckGoHref(href: string): string | null {
  const decoded = href.replaceAll('&amp;', '&');
  if (decoded.startsWith('http')) return decoded;
  const match = /[?&]uddg=([^&]+)/.exec(decoded);
  if (!match?.[1]) return null;
  try {
    const target = decodeURIComponent(match[1]);
    return target.startsWith('http') ? target : null;
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&nbsp;', ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function searchHttpError(response: Response, provider: string): Promise<JarvisError> {
  const text = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) {
    return makeError('research.search_auth', `${provider} hat den API-Schlüssel abgelehnt.`, {
      hint: 'Einstellungen → Zugänge.',
      detail: text.slice(0, 200),
    });
  }
  if (response.status === 429) {
    return makeError('research.search_rate_limit', `${provider} meldet zu viele Anfragen.`, {
      retryable: true,
    });
  }
  return makeError('research.search_error', `${provider} meldete HTTP ${response.status}.`, {
    detail: text.slice(0, 200),
    retryable: response.status >= 500,
  });
}

function networkError(provider: string, error: unknown): JarvisError {
  return makeError('research.search_offline', `${provider} ist nicht erreichbar.`, {
    detail: error instanceof Error ? error.message : String(error),
    retryable: true,
  });
}

export function createSearchProvider(
  settings: ResearchSettings,
  credentials: CredentialService,
): Result<SearchProvider, JarvisError> {
  switch (settings.searchProvider) {
    case 'brave': {
      const key = credentials.get('brave.apiKey');
      if (!key) {
        return err(
          makeError('research.no_key', 'Für Brave Search ist kein API-Schlüssel hinterlegt.', {
            hint: 'Einstellungen → Zugänge → Brave, oder BRAVE_SEARCH_API_KEY setzen.',
          }),
        );
      }
      return ok(new BraveSearch(key));
    }
    case 'tavily': {
      const key = credentials.get('tavily.apiKey');
      if (!key) {
        return err(
          makeError('research.no_key', 'Für Tavily ist kein API-Schlüssel hinterlegt.', {
            hint: 'Einstellungen → Zugänge → Tavily, oder TAVILY_API_KEY setzen.',
          }),
        );
      }
      return ok(new TavilySearch(key));
    }
    case 'serpapi': {
      const key = credentials.get('serpapi.apiKey');
      if (!key) {
        return err(
          makeError('research.no_key', 'Für SerpAPI ist kein API-Schlüssel hinterlegt.', {
            hint: 'Einstellungen → Zugänge → SerpAPI, oder SERPAPI_API_KEY setzen.',
          }),
        );
      }
      return ok(new SerpApiSearch(key));
    }
    case 'duckduckgo':
    default:
      return ok(new DuckDuckGoSearch(settings.userAgent));
  }
}

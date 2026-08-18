export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchOptions {
  maxResults?: number;
  /** Ländercode für regionale Treffer, z. B. "de". */
  country?: string;
}

export interface SearchProvider {
  readonly id: string;
  readonly label: string;
  configured(): boolean;
  missingHint(): string;
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;
}

export class SearchError extends Error {
  constructor(
    message: string,
    readonly provider: string
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

/** Kein Suchdienst eingerichtet – sagt es deutlich, statt Treffer zu erfinden. */
export class KeineSucheProvider implements SearchProvider {
  readonly id = 'keiner';
  readonly label = 'Keine Websuche eingerichtet';
  configured(): boolean {
    return false;
  }
  missingHint(): string {
    return 'JARVIS_SEARCH_PROVIDER auf brave, tavily oder serpapi setzen und den zugehörigen Schlüssel hinterlegen.';
  }
  async search(): Promise<SearchHit[]> {
    throw new SearchError(
      'Es ist kein Suchdienst eingerichtet. Ohne Suche kann ich keine Unternehmen recherchieren – ' +
        'bitte in den Einstellungen einen Anbieter hinterlegen.',
      this.id
    );
  }
}

export class BraveSearchProvider implements SearchProvider {
  readonly id = 'brave';
  readonly label = 'Brave Search';

  constructor(private readonly apiKey: string | null) {}

  configured(): boolean {
    return Boolean(this.apiKey);
  }
  missingHint(): string {
    return 'BRAVE_API_KEY hinterlegen (api.search.brave.com).';
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    if (!this.apiKey) throw new SearchError('Kein Brave-Schlüssel hinterlegt.', this.id);
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(options.maxResults ?? 10, 20)));
    url.searchParams.set('country', options.country ?? 'de');
    url.searchParams.set('search_lang', 'de');
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'x-subscription-token': this.apiKey }
    });
    if (!response.ok) throw new SearchError(`Brave antwortete mit HTTP ${response.status}.`, this.id);
    const data = (await response.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    return (data.web?.results ?? [])
      .filter((hit): hit is { title: string; url: string; description?: string } => Boolean(hit.url && hit.title))
      .map((hit) => ({ title: hit.title, url: hit.url, snippet: stripTags(hit.description ?? '') }));
  }
}

export class TavilySearchProvider implements SearchProvider {
  readonly id = 'tavily';
  readonly label = 'Tavily';

  constructor(private readonly apiKey: string | null) {}

  configured(): boolean {
    return Boolean(this.apiKey);
  }
  missingHint(): string {
    return 'TAVILY_API_KEY hinterlegen (tavily.com).';
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    if (!this.apiKey) throw new SearchError('Kein Tavily-Schlüssel hinterlegt.', this.id);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: options.maxResults ?? 10,
        search_depth: 'basic'
      })
    });
    if (!response.ok) throw new SearchError(`Tavily antwortete mit HTTP ${response.status}.`, this.id);
    const data = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((hit): hit is { title: string; url: string; content?: string } => Boolean(hit.url && hit.title))
      .map((hit) => ({ title: hit.title, url: hit.url, snippet: stripTags(hit.content ?? '') }));
  }
}

export class SerpApiSearchProvider implements SearchProvider {
  readonly id = 'serpapi';
  readonly label = 'SerpAPI (Google)';

  constructor(private readonly apiKey: string | null) {}

  configured(): boolean {
    return Boolean(this.apiKey);
  }
  missingHint(): string {
    return 'SERPAPI_API_KEY hinterlegen (serpapi.com).';
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    if (!this.apiKey) throw new SearchError('Kein SerpAPI-Schlüssel hinterlegt.', this.id);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('hl', 'de');
    url.searchParams.set('gl', options.country ?? 'de');
    url.searchParams.set('num', String(options.maxResults ?? 10));
    url.searchParams.set('api_key', this.apiKey);
    const response = await fetch(url);
    if (!response.ok) throw new SearchError(`SerpAPI antwortete mit HTTP ${response.status}.`, this.id);
    const data = (await response.json()) as {
      organic_results?: { title?: string; link?: string; snippet?: string }[];
      error?: string;
    };
    if (data.error) throw new SearchError(`SerpAPI: ${data.error}`, this.id);
    return (data.organic_results ?? [])
      .filter((hit): hit is { title: string; link: string; snippet?: string } => Boolean(hit.link && hit.title))
      .map((hit) => ({ title: hit.title, url: hit.link, snippet: stripTags(hit.snippet ?? '') }));
  }
}

const stripTags = (value: string): string => value.replace(/<[^>]*>/g, '').trim();

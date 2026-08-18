import type { JarvisError, Result } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  retrievedAt: string;
}

export interface FetcherOptions {
  userAgent: string;
  /** Minimum delay between two requests to the same host, in ms. */
  crawlDelayMs: number;
  respectRobotsTxt: boolean;
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Polite HTTP client for public company pages.
 *
 * Behaviour that matters for §17 (no aggressive scraping):
 *  - one request per host at a time, with a configurable delay between them
 *  - robots.txt is fetched once per host and honoured for our user agent
 *  - responses are capped in size and non-HTML content is discarded
 *  - a page is never fetched twice within a session
 */
export class HttpFetcher {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly hostQueue = new Map<string, Promise<unknown>>();
  private readonly robots = new Map<string, RobotsRules>();
  private readonly cache = new Map<string, FetchedPage>();

  constructor(private readonly options: FetcherOptions) {}

  get requestsMade(): number {
    return this.cache.size;
  }

  async fetchPage(rawUrl: string): Promise<Result<FetchedPage, JarvisError>> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return err(makeError('research.bad_url', `„${rawUrl}" ist keine gültige Adresse.`));
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return err(makeError('research.bad_scheme', `Nur http/https werden abgerufen, nicht ${url.protocol}`));
    }

    const key = url.toString();
    const cached = this.cache.get(key);
    if (cached) return ok(cached);

    if (this.options.respectRobotsTxt) {
      const allowed = await this.isAllowed(url);
      if (!allowed) {
        return err(
          makeError('research.robots_disallow', `robots.txt von ${url.host} verbietet den Abruf von ${url.pathname}.`, {
            hint: 'Die Seite wird übersprungen. Angaben von dort werden nicht verwendet.',
          }),
        );
      }
    }

    return this.serialized(url.host, async () => {
      await this.respectDelay(url.host);
      const result = await this.rawFetch(key);
      if (result.ok) this.cache.set(key, result.value);
      return result;
    });
  }

  /** Serialises requests per host so we never open parallel connections. */
  private async serialized<T>(host: string, task: () => Promise<T>): Promise<T> {
    const previous = this.hostQueue.get(host) ?? Promise.resolve();
    const next = previous.then(task, task);
    this.hostQueue.set(
      host,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private async respectDelay(host: string): Promise<void> {
    const last = this.lastRequestAt.get(host);
    const delay = this.robots.get(host)?.crawlDelayMs ?? this.options.crawlDelayMs;
    if (last !== undefined) {
      const wait = delay - (Date.now() - last);
      if (wait > 0) await sleep(wait);
    }
    this.lastRequestAt.set(host, Date.now());
  }

  private async rawFetch(url: string): Promise<Result<FetchedPage, JarvisError>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': this.options.userAgent,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.6',
        },
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!response.ok) {
        return err(
          makeError('research.http_error', `${url} antwortete mit HTTP ${response.status}.`, {
            retryable: response.status >= 500,
          }),
        );
      }
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        return err(
          makeError('research.not_html', `${url} liefert ${contentType || 'unbekannten Inhalt'}, kein HTML.`),
        );
      }

      const buffer = await readCapped(response, this.options.maxBytes ?? 2_000_000);
      return ok({
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType,
        html: buffer,
        retrievedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return err(makeError('research.timeout', `Zeitüberschreitung beim Abruf von ${url}.`, { retryable: true }));
      }
      return err(
        makeError('research.network', `${url} ist nicht erreichbar.`, {
          detail: error instanceof Error ? error.message : String(error),
          retryable: true,
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async isAllowed(url: URL): Promise<boolean> {
    const host = url.host;
    let rules = this.robots.get(host);
    if (!rules) {
      rules = await this.loadRobots(url);
      this.robots.set(host, rules);
    }
    return rules.allows(url.pathname + url.search);
  }

  private async loadRobots(url: URL): Promise<RobotsRules> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(`${url.protocol}//${url.host}/robots.txt`, {
        headers: { 'user-agent': this.options.userAgent },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return RobotsRules.permissive();
      const text = (await response.text()).slice(0, 200_000);
      return RobotsRules.parse(text, this.options.userAgent);
    } catch {
      // No robots.txt reachable — treat as permissive, which is what the
      // standard prescribes for a 4xx/unreachable robots file.
      return RobotsRules.permissive();
    }
  }
}

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return await response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
    }
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder('utf-8', { fatal: false }).decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > total) {
      out.set(chunk.subarray(0, total - offset), offset);
      break;
    }
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Minimal robots.txt evaluation: longest-match Allow/Disallow, plus Crawl-delay. */
export class RobotsRules {
  private constructor(
    private readonly allow: string[],
    private readonly disallow: string[],
    readonly crawlDelayMs: number | undefined,
  ) {}

  static permissive(): RobotsRules {
    return new RobotsRules([], [], undefined);
  }

  static parse(text: string, userAgent: string): RobotsRules {
    const token = userAgent.split('/')[0]?.toLowerCase() ?? '';
    const groups = new Map<string, { allow: string[]; disallow: string[]; delay?: number }>();
    let current: string[] = [];

    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split('#')[0]?.trim() ?? '';
      if (!line) continue;
      const separator = line.indexOf(':');
      if (separator === -1) continue;
      const field = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();

      if (field === 'user-agent') {
        const agent = value.toLowerCase();
        if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [] });
        current = [agent];
        continue;
      }
      for (const agent of current) {
        const group = groups.get(agent);
        if (!group) continue;
        if (field === 'allow' && value) group.allow.push(value);
        else if (field === 'disallow') group.disallow.push(value);
        else if (field === 'crawl-delay') {
          const seconds = Number.parseFloat(value);
          if (Number.isFinite(seconds)) group.delay = seconds * 1000;
        }
      }
    }

    const chosen =
      [...groups.entries()].find(([agent]) => token && agent.includes(token))?.[1] ?? groups.get('*');
    if (!chosen) return RobotsRules.permissive();
    return new RobotsRules(chosen.allow, chosen.disallow, chosen.delay);
  }

  allows(path: string): boolean {
    const match = (patterns: string[]): number => {
      let best = -1;
      for (const pattern of patterns) {
        if (pattern === '') continue;
        if (matchesRobotsPattern(path, pattern)) best = Math.max(best, pattern.length);
      }
      return best;
    };
    // An empty Disallow means "allow everything".
    if (this.disallow.length === 1 && this.disallow[0] === '') return true;
    const allowLength = match(this.allow);
    const disallowLength = match(this.disallow);
    if (disallowLength === -1) return true;
    return allowLength >= disallowLength;
  }
}

function matchesRobotsPattern(path: string, pattern: string): boolean {
  // Supports the two wildcards the standard defines: * and end-anchor $.
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  const regex = new RegExp(`^${escaped}${anchored ? '$' : ''}`);
  return regex.test(path);
}

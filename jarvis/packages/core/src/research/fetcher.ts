import { createHash } from 'node:crypto';
import type { JarvisEnv } from '../config/env.js';
import { err, fromException, ok, type Result } from '../util/result.js';
import { htmlToText, truncate } from '../util/text.js';

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string;
  html: string;
  text: string;
  title: string | null;
  fetchedAt: string;
  contentHash: string;
  truncated: boolean;
}

/**
 * Holt Webseiten fuer die Recherche.
 *
 * Drei Dinge sind hier bewusst so gebaut:
 *  - robots.txt wird gelesen und befolgt (abschaltbar, aber standardmaessig an),
 *  - es gibt ein Groessen- und Zeitlimit, damit eine grosse Seite den Lauf nicht blockiert,
 *  - nur http/https, keine file:- oder data:-URLs.
 */
export class PageFetcher {
  private readonly robotsCache = new Map<string, RobotsRules | null>();
  private readonly pageCache = new Map<string, FetchedPage>();

  constructor(
    private readonly env: JarvisEnv,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetch(rawUrl: string, options: { signal?: AbortSignal; useCache?: boolean } = {}): Promise<Result<FetchedPage>> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return err('INVALID_INPUT', `"${rawUrl}" ist keine gültige Adresse.`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return err('PERMISSION_DENIED', `Nur http und https sind erlaubt, nicht ${url.protocol}`);
    }

    const cacheKey = url.toString();
    if (options.useCache !== false) {
      const cached = this.pageCache.get(cacheKey);
      if (cached) return ok(cached, { ausZwischenspeicher: true });
    }

    if (this.env.JARVIS_RESPECT_ROBOTS) {
      const allowed = await this.isAllowed(url, options.signal);
      if (!allowed) {
        return err('ROBOTS_DISALLOWED', `${url.host} verbietet das Abrufen von ${url.pathname} laut robots.txt.`, {
          hint: 'Die Seite wird deshalb nicht ausgewertet. Angaben ggf. manuell eintragen.',
        });
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Zeitüberschreitung nach ${this.env.JARVIS_FETCH_TIMEOUT_MS} ms`)),
      this.env.JARVIS_FETCH_TIMEOUT_MS,
    );
    const relay = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', relay, { once: true });

    try {
      const res = await this.fetchImpl(url.toString(), {
        headers: {
          'user-agent': this.env.JARVIS_HTTP_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'de-DE,de;q=0.9,en;q=0.6',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok) {
        return err('NETWORK_ERROR', `${url.host} antwortete mit HTTP ${res.status}.`, {
          detail: { status: res.status, url: url.toString() },
        });
      }
      if (contentType && !/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
        return err('INVALID_INPUT', `${url.toString()} liefert ${contentType} und keinen lesbaren Text.`);
      }

      const raw = await res.text();
      const limit = this.env.JARVIS_MAX_PAGE_BYTES;
      const truncated = raw.length > limit;
      const html = truncated ? raw.slice(0, limit) : raw;

      const page: FetchedPage = {
        url: url.toString(),
        finalUrl: res.url || url.toString(),
        status: res.status,
        contentType,
        html,
        text: htmlToText(html),
        title: extractTitle(html),
        fetchedAt: new Date().toISOString(),
        contentHash: createHash('sha256').update(html).digest('hex').slice(0, 32),
        truncated,
      };
      this.pageCache.set(cacheKey, page);
      return ok(page);
    } catch (e) {
      return fromException(e, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', relay);
    }
  }

  clearCache(): void {
    this.pageCache.clear();
    this.robotsCache.clear();
  }

  private async isAllowed(url: URL, signal?: AbortSignal): Promise<boolean> {
    const origin = url.origin;
    if (!this.robotsCache.has(origin)) {
      this.robotsCache.set(origin, await this.loadRobots(origin, signal));
    }
    const rules = this.robotsCache.get(origin) ?? null;
    // Keine robots.txt oder nicht lesbar -> erlaubt (so sieht es der Standard vor).
    if (!rules) return true;
    return isPathAllowed(rules, url.pathname + url.search);
  }

  private async loadRobots(origin: string, signal?: AbortSignal): Promise<RobotsRules | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const relay = () => controller.abort();
      signal?.addEventListener('abort', relay, { once: true });
      try {
        const res = await this.fetchImpl(`${origin}/robots.txt`, {
          headers: { 'user-agent': this.env.JARVIS_HTTP_USER_AGENT },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        return parseRobots(await res.text(), this.env.JARVIS_HTTP_USER_AGENT);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', relay);
      }
    } catch {
      return null;
    }
  }
}

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/**
 * Auswertung von robots.txt fuer den eigenen User-Agent, mit Rueckfall auf `*`.
 * Bewusst schlank: Allow/Disallow mit laengster passender Regel gewinnt.
 */
export function parseRobots(content: string, userAgent: string): RobotsRules {
  const uaToken = userAgent.split('/')[0]?.toLowerCase() ?? 'jarvis';
  const groups: Array<{ agents: string[]; allow: string[]; disallow: string[] }> = [];
  let current: { agents: string[]; allow: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;

  for (const line of content.split(/\r?\n/)) {
    const clean = line.split('#')[0]?.trim() ?? '';
    if (!clean) continue;
    const idx = clean.indexOf(':');
    if (idx < 0) continue;
    const field = clean.slice(0, idx).trim().toLowerCase();
    const value = clean.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow') current.allow.push(value);
    else if (field === 'disallow') current.disallow.push(value);
  }

  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && uaToken.includes(a)));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const chosen = specific ?? wildcard;
  return { allow: chosen?.allow ?? [], disallow: chosen?.disallow ?? [] };
}

export function isPathAllowed(rules: RobotsRules, path: string): boolean {
  const match = (patterns: string[]): number => {
    let best = -1;
    for (const p of patterns) {
      if (p === '') continue;
      if (matchesRobotsPattern(p, path)) best = Math.max(best, p.length);
    }
    return best;
  };
  const allowLen = match(rules.allow);
  const disallowLen = match(rules.disallow);
  if (disallowLen < 0) return true;
  // Bei gleicher Laenge gewinnt Allow -- so steht es in der Google-Auslegung.
  return allowLen >= disallowLen;
}

function matchesRobotsPattern(pattern: string, path: string): boolean {
  const mustEnd = pattern.endsWith('$');
  const p = mustEnd ? pattern.slice(0, -1) : pattern;
  const parts = p.split('*');

  let position = 0;
  for (const [i, part] of parts.entries()) {
    if (part === '') continue;
    const found = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, position);
    if (found < 0) return false;
    position = found + part.length;
  }
  if (mustEnd) return position === path.length;
  return true;
}

export function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m?.[1] ? truncate(htmlToText(m[1]), 200) : null;
}

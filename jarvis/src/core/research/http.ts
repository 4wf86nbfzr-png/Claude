import { setTimeout as delay } from 'node:timers/promises';

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  body: string;
  error?: string;
  /** Wurde die Seite wegen robots.txt gar nicht erst geholt? */
  blockedByRobots?: boolean;
}

interface RobotsRegeln {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number;
}

const MAX_BYTES = 2_000_000;

/**
 * Höflicher HTTP-Abruf für die Recherche.
 *
 * - hält je Host eine Mindestpause ein,
 * - beachtet robots.txt (abschaltbar, aber standardmäßig an),
 * - bricht bei zu großen Antworten ab,
 * - liefert Fehler als Ergebnis zurück statt zu werfen.
 */
export class PoliteFetcher {
  private readonly letzterAbruf = new Map<string, number>();
  private readonly robotsCache = new Map<string, RobotsRegeln | null>();

  constructor(
    private readonly options: {
      userAgent: string;
      timeoutMs: number;
      respectRobotsTxt: boolean;
      minDelayMs?: number;
      fetchImpl?: typeof fetch;
    }
  ) {}

  private get fetchImpl(): typeof fetch {
    return this.options.fetchImpl ?? fetch;
  }

  async get(url: string): Promise<FetchResult> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, url, finalUrl: url, status: null, contentType: null, body: '', error: 'Ungültige Adresse.' };
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        ok: false,
        url,
        finalUrl: url,
        status: null,
        contentType: null,
        body: '',
        error: `Protokoll ${parsed.protocol} wird nicht abgerufen.`
      };
    }

    if (this.options.respectRobotsTxt) {
      const regeln = await this.robots(parsed.origin);
      if (regeln && !erlaubt(regeln, parsed.pathname)) {
        return {
          ok: false,
          url,
          finalUrl: url,
          status: null,
          contentType: null,
          body: '',
          error: 'Abruf laut robots.txt der Seite nicht erwünscht.',
          blockedByRobots: true
        };
      }
    }

    await this.warten(parsed.host);
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await this.fetchImpl(parsed.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': this.options.userAgent,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'accept-language': 'de-DE,de;q=0.9'
        }
      });
      const contentType = response.headers.get('content-type');
      if (contentType && !/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
        return {
          ok: false,
          url,
          finalUrl: response.url || url,
          status: response.status,
          contentType,
          body: '',
          error: `Inhaltstyp ${contentType} wird nicht ausgewertet.`
        };
      }
      const text = await leseBegrenzt(response);
      return {
        ok: response.ok,
        url,
        finalUrl: response.url || url,
        status: response.status,
        contentType,
        body: text,
        ...(response.ok ? {} : { error: `HTTP ${response.status}` })
      };
    } catch (error) {
      const message = (error as Error).name === 'AbortError' ? 'Zeitüberschreitung' : (error as Error).message;
      return { ok: false, url, finalUrl: url, status: null, contentType: null, body: '', error: message };
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  private async warten(host: string): Promise<void> {
    const min = this.options.minDelayMs ?? 1000;
    const letzter = this.letzterAbruf.get(host);
    if (letzter) {
      const rest = min - (Date.now() - letzter);
      if (rest > 0) await delay(rest);
    }
    this.letzterAbruf.set(host, Date.now());
  }

  private async robots(origin: string): Promise<RobotsRegeln | null> {
    if (this.robotsCache.has(origin)) return this.robotsCache.get(origin) ?? null;
    let regeln: RobotsRegeln | null = null;
    try {
      const response = await this.fetchImpl(`${origin}/robots.txt`, {
        headers: { 'user-agent': this.options.userAgent }
      });
      if (response.ok) regeln = parseRobots(await response.text());
    } catch {
      regeln = null; // Keine robots.txt erreichbar → normal weiter.
    }
    this.robotsCache.set(origin, regeln);
    return regeln;
  }
}

async function leseBegrenzt(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return out + decoder.decode();
}

/** Minimaler robots.txt-Parser: der Block für "*" reicht für unseren Zweck. */
export function parseRobots(text: string): RobotsRegeln {
  const regeln: RobotsRegeln = { disallow: [], allow: [], crawlDelayMs: 0 };
  let imBlock = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = (rawKey ?? '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      imBlock = value === '*';
      continue;
    }
    if (!imBlock) continue;
    if (key === 'disallow' && value) regeln.disallow.push(value);
    if (key === 'allow' && value) regeln.allow.push(value);
    if (key === 'crawl-delay') {
      const sekunden = Number(value);
      if (Number.isFinite(sekunden)) regeln.crawlDelayMs = sekunden * 1000;
    }
  }
  return regeln;
}

export function erlaubt(regeln: RobotsRegeln, pfad: string): boolean {
  const treffer = (muster: string[]): number =>
    muster.filter((m) => pfad.startsWith(m)).reduce((max, m) => Math.max(max, m.length), -1);
  const verboten = treffer(regeln.disallow);
  if (verboten < 0) return true;
  // Die längere, genauere Regel gewinnt – so schreibt es der Standard vor.
  return treffer(regeln.allow) >= verboten;
}

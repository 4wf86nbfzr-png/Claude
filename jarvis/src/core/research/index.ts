import type { JarvisConfig } from '../services/config';
import { normalizeDomain, truncate } from '../util/text';
import { PoliteFetcher, type FetchResult } from './http';
import {
  extractPageInfo,
  findeKontaktseiten,
  htmlToText,
  seitenArt,
  type GefundenerKontakt,
  type SeitenInfo
} from './extractor';
import type { SearchHit, SearchProvider } from './search';
import { bewerteAdresse, pruefeMx, type Fundart, type Pruefergebnis } from './verification';

export * from './extractor';
export * from './http';
export * from './search';
export * from './verification';

export interface BewerteteAdresse extends Pruefergebnis {
  address: string;
  evidenceUrl: string;
  evidenceSnippet: string;
}

export interface QuellenNachweis {
  url: string;
  kind: 'website' | 'kontakt' | 'impressum' | 'suche' | 'verzeichnis' | 'sonstige';
  title: string | null;
  httpStatus: number | null;
  excerpt: string | null;
}

export interface FirmenRecherche {
  ok: boolean;
  startUrl: string;
  domain: string | null;
  name: string | null;
  beschreibung: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string[];
  emails: BewerteteAdresse[];
  kontakte: GefundenerKontakt[];
  quellen: QuellenNachweis[];
  /** Seiten, die nicht gelesen werden konnten – gehört zur Ehrlichkeit dazu. */
  nichtGelesen: { url: string; grund: string }[];
  fehler?: string;
}

/**
 * Rechercheschicht.
 *
 * Liefert ausschließlich, was tatsächlich auf einer abgerufenen Seite stand.
 * Es gibt hier bewusst keine Funktion, die eine Adresse aus einem Namen
 * konstruiert – die einzige Stelle, an der so etwas entstehen könnte, ist die
 * Bewertung, und die stuft Vermutungen auf NICHT_VERIFIZIERT herab.
 */
export class ResearchService {
  private readonly mxCache = new Map<string, boolean>();

  constructor(
    private readonly fetcher: PoliteFetcher,
    readonly search: SearchProvider,
    private readonly config: JarvisConfig,
    /** Prüft, ob eine Domain überhaupt Mail annimmt. In Tests austauschbar. */
    private readonly mxPruefer: (adresse: string) => Promise<boolean> = async (adresse) =>
      (await pruefeMx(adresse)).ok
  ) {}

  static create(
    config: JarvisConfig,
    search: SearchProvider,
    options: { fetchImpl?: typeof fetch; mxPruefer?: (adresse: string) => Promise<boolean> } = {}
  ): ResearchService {
    return new ResearchService(
      new PoliteFetcher({
        userAgent: config.research.userAgent,
        timeoutMs: config.research.requestTimeoutMs,
        respectRobotsTxt: config.research.respectRobotsTxt,
        minDelayMs: config.research.minDelayMs,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
      }),
      search,
      config,
      ...(options.mxPruefer ? [options.mxPruefer] : [])
    );
  }

  suchen(query: string, maxResults?: number): Promise<SearchHit[]> {
    return this.search.search(query, { maxResults: maxResults ?? this.config.search.maxResults, country: 'de' });
  }

  /** Eine Seite abrufen und lesbar machen. */
  async seiteLesen(url: string): Promise<{ ok: boolean; info?: SeitenInfo; roh: FetchResult }> {
    const roh = await this.fetcher.get(url);
    if (!roh.ok || !roh.body) return { ok: false, roh };
    return { ok: true, info: extractPageInfo(roh.body, roh.finalUrl), roh };
  }

  /** Nur der Text einer Seite – für "lies mir die Seite vor" und Zusammenfassungen. */
  async seitentext(url: string, maxZeichen = 8000): Promise<{ ok: boolean; text: string; titel: string | null; fehler?: string }> {
    const roh = await this.fetcher.get(url);
    if (!roh.ok || !roh.body) {
      return { ok: false, text: '', titel: null, fehler: roh.error ?? `HTTP ${roh.status ?? '?'}` };
    }
    const info = extractPageInfo(roh.body, roh.finalUrl);
    return { ok: true, text: truncate(htmlToText(roh.body), maxZeichen), titel: info.title };
  }

  /**
   * Vollständige Firmenrecherche ab einer Startadresse: Startseite lesen,
   * Kontakt-/Impressumsseiten nachladen, Angaben zusammenführen und jede
   * gefundene Adresse bewerten.
   */
  async firmenprofil(startUrl: string): Promise<FirmenRecherche> {
    const ergebnis: FirmenRecherche = {
      ok: false,
      startUrl,
      domain: normalizeDomain(startUrl),
      name: null,
      beschreibung: null,
      plz: null,
      ort: null,
      telefon: [],
      emails: [],
      kontakte: [],
      quellen: [],
      nichtGelesen: []
    };

    const start = await this.seiteLesen(startUrl);
    if (!start.ok || !start.info) {
      ergebnis.fehler = start.roh.error ?? `Seite nicht lesbar (HTTP ${start.roh.status ?? '?'})`;
      ergebnis.nichtGelesen.push({ url: startUrl, grund: ergebnis.fehler });
      return ergebnis;
    }

    const seiten: SeitenInfo[] = [start.info];
    ergebnis.domain = normalizeDomain(start.info.url) ?? ergebnis.domain;
    ergebnis.quellen.push(quelle(start.info, start.roh));

    const weitere = findeKontaktseiten(start.info.links, start.info.url).slice(
      0,
      Math.max(0, this.config.research.maxPagesPerCompany - 1)
    );
    for (const url of weitere) {
      const seite = await this.seiteLesen(url);
      if (!seite.ok || !seite.info) {
        ergebnis.nichtGelesen.push({ url, grund: seite.roh.error ?? `HTTP ${seite.roh.status ?? '?'}` });
        continue;
      }
      seiten.push(seite.info);
      ergebnis.quellen.push(quelle(seite.info, seite.roh));
    }

    ergebnis.name = firmenname(seiten);
    ergebnis.beschreibung = seiten.map((s) => s.description).find(Boolean) ?? null;
    for (const seite of seiten) {
      if (!ergebnis.plz && seite.postleitzahl) {
        ergebnis.plz = seite.postleitzahl;
        ergebnis.ort = seite.ort;
      }
      for (const nummer of seite.phones) if (!ergebnis.telefon.includes(nummer)) ergebnis.telefon.push(nummer);
      for (const kontakt of seite.kontakte) {
        if (!ergebnis.kontakte.some((k) => k.name === kontakt.name)) ergebnis.kontakte.push(kontakt);
      }
    }

    const gesehen = new Set<string>();
    for (const seite of seiten) {
      for (const fund of seite.emails) {
        if (gesehen.has(fund.address)) continue;
        gesehen.add(fund.address);
        const mxOk = await this.mx(fund.address);
        const bewertung = bewerteAdresse({
          address: fund.address,
          evidenceUrl: seite.url,
          companyDomain: ergebnis.domain,
          fundart: fund.method as Fundart,
          seitenart: seitenArt(seite.url),
          mxVorhanden: mxOk
        });
        ergebnis.emails.push({
          ...bewertung,
          address: fund.address,
          evidenceUrl: seite.url,
          evidenceSnippet: fund.context
        });
      }
    }
    ergebnis.emails.sort((a, b) => rang(a.status) - rang(b.status));
    ergebnis.ok = true;
    return ergebnis;
  }

  private async mx(address: string): Promise<boolean> {
    const domain = address.split('@')[1] ?? '';
    if (!domain) return false;
    const bekannt = this.mxCache.get(domain);
    if (bekannt !== undefined) return bekannt;
    const ok = await this.mxPruefer(domain);
    this.mxCache.set(domain, ok);
    return ok;
  }
}

const rang = (status: string): number =>
  status === 'VERIFIZIERT' ? 0 : status === 'WAHRSCHEINLICH' ? 1 : 2;

function quelle(info: SeitenInfo, roh: FetchResult): QuellenNachweis {
  const art = seitenArt(info.url);
  return {
    url: info.url,
    kind: art,
    title: info.title,
    httpStatus: roh.status,
    excerpt: truncate(info.text, 300)
  };
}

/**
 * Firmenname aus Seitentitel oder Impressum.
 * Titelzusätze wie "| Startseite" oder "– Bauunternehmen Hamburg" fallen weg.
 */
function firmenname(seiten: SeitenInfo[]): string | null {
  const impressum = seiten.find((s) => seitenArt(s.url) === 'impressum');
  if (impressum) {
    const ausImpressum = firmennameAusImpressum(impressum.text);
    if (ausImpressum) return ausImpressum;
  }
  const titel = seiten[0]?.title;
  if (!titel) return null;
  const teil = titel.split(/[|–—]/)[0]?.trim();
  return (teil && teil.length >= 2 ? teil : titel.trim()) || null;
}

const RECHTSFORM_MUSTER =
  '(?:GmbH(?:\\s*&\\s*Co\\.?\\s*KG)?|AG(?:\\s*&\\s*Co\\.?\\s*KG)?|KG|OHG|GbR|UG\\s*\\(haftungsbeschränkt\\)|UG|e\\.\\s?K\\.|SE|KGaA)';

/** Überschriften und Formelzeilen, die vor dem Firmennamen stehen können. */
const VORSPANN =
  /^(?:impressum|kontakt|anbieter|anbieterkennzeichnung|angaben gem[aä]ß\s*§?\s*5\s*(?:tmg|dgg)?|verantwortlich(?:er)?(?:\s+i\.\s*s\.\s*d\.\s*§?\s*\d*\s*\w*)?|herausgeber|firma|legal notice|imprint)\b[\s:–-]*/i;

/**
 * Der Firmenname steht im Impressum üblicherweise als eigene Zeile mit
 * Rechtsform. Zeilenweise zu suchen ist zuverlässiger, als über den ganzen
 * Text zu greifen – sonst wandert die Überschrift in den Namen.
 */
export function firmennameAusImpressum(text: string): string | null {
  const mitForm = new RegExp(`^(.{2,80}?\\s${RECHTSFORM_MUSTER})(?:\\b|$)`);
  for (const rohzeile of text.split('\n')) {
    const zeile = rohzeile.replace(VORSPANN, '').replace(/\s+/g, ' ').trim();
    if (zeile.length < 3 || zeile.length > 90) continue;
    const treffer = mitForm.exec(zeile);
    if (treffer?.[1]) {
      const name = treffer[1].trim();
      // Reine Rechtsform ohne Namen ist kein Firmenname.
      if (/^[A-ZÄÖÜ]/.test(name) && name.split(' ').length >= 2) return name;
    }
  }
  return null;
}

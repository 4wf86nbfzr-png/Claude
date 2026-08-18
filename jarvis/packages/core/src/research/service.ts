import type { JarvisEnv } from '../config/env.js';
import type { Repositories } from '../db/repos/index.js';
import type { CompanyRow, SourceKind } from '../db/schema.js';
import type { AuditLogService } from '../services/audit.js';
import type { EventBus } from '../services/events.js';
import { err, ok, type Result } from '../util/result.js';
import { domainOfUrl, registrableDomain, truncate } from '../util/text.js';
import { PageFetcher, type FetchedPage } from './fetcher.js';
import { extractFromPage, type PageExtract } from './extract.js';
import type { SearchHit, SearchProvider } from './search/types.js';
import { addressKind, checkMx, classifyAddress } from './verify.js';

export interface ResearchServiceOptions {
  env: JarvisEnv;
  repos: Repositories;
  audit: AuditLogService;
  search: SearchProvider;
  fetcher: PageFetcher;
  bus?: EventBus;
  /**
   * Prueft, ob die Domain einer Adresse Mail annehmen kann.
   * Ersetzbar, damit Tests kein echtes DNS anfassen.
   */
  mxCheck?: (address: string) => Promise<boolean | null>;
}

export interface CompanyProfile {
  company: CompanyRow;
  /** Adressen mit Status und Beleg. */
  emails: Array<{
    address: string;
    verification: string;
    note: string;
    sourceUrl: string | null;
    kind: 'funktion' | 'person';
  }>;
  /** Verschleierte Funde -- absichtlich nicht automatisch uebernommen. */
  verschleierteAdressen: Array<{ raw: string; fundstelle: string }>;
  contacts: Array<{ name: string; role: string | null; sourceUrl: string | null }>;
  phone: string | null;
  /** Belegte Angaben mit Quelle. */
  fakten: Array<{ label: string; value: string; sourceUrl: string | null }>;
  besuchteSeiten: string[];
  hinweise: string[];
}

/**
 * Motor des CompanyResearchAgent.
 *
 * Der Ablauf entspricht der geforderten Prioritaet:
 *   1. offizielle Unternehmenswebsite
 *   2. Kontaktseite
 *   3. Impressum
 *   4. oeffentlich genannte Ansprechpartner
 *   5. sonstige seriöse oeffentliche Quellen
 *
 * Alles, was gespeichert wird, traegt eine Quelle mit Abrufzeitpunkt.
 */
export class ResearchService {
  private readonly env: JarvisEnv;
  private readonly repos: Repositories;
  private readonly audit: AuditLogService;
  private readonly searchProvider: SearchProvider;
  private readonly fetcher: PageFetcher;
  private readonly bus: EventBus | undefined;
  private readonly mxCheck: (address: string) => Promise<boolean | null>;

  constructor(options: ResearchServiceOptions) {
    this.env = options.env;
    this.repos = options.repos;
    this.audit = options.audit;
    this.searchProvider = options.search;
    this.fetcher = options.fetcher;
    this.bus = options.bus;
    this.mxCheck = options.mxCheck ?? checkMx;
  }

  get providerLabel(): string {
    return this.searchProvider.label;
  }

  providerHint(): string | null {
    return this.searchProvider.missingConfigHint();
  }

  // --- Suche --------------------------------------------------------------

  async search(query: string, limit = 10, signal?: AbortSignal): Promise<Result<SearchHit[]>> {
    this.audit.log({
      actor: 'CompanyResearchAgent',
      action: 'recherche.suche',
      summary: `Recherche gestartet: "${truncate(query, 90)}"`,
      detail: { anbieter: this.searchProvider.id, limit },
    });
    const result = await this.searchProvider.search({ query, limit, market: 'de-DE', signal });
    if (!result.ok) {
      this.audit.failure('CompanyResearchAgent', 'recherche.suche_fehler', `Suche fehlgeschlagen: ${result.error.message}`, result.error);
    }
    return result;
  }

  async fetchPage(url: string, kind: SourceKind = 'website', signal?: AbortSignal): Promise<Result<FetchedPage>> {
    const page = await this.fetcher.fetch(url, { signal });
    if (page.ok) {
      this.repos.companies.addSource({
        url: page.data.finalUrl,
        kind,
        title: page.data.title,
        httpStatus: page.data.status,
        snippet: truncate(page.data.text, 500),
        contentHash: page.data.contentHash,
        fetchedAt: page.data.fetchedAt,
      });
    }
    return page;
  }

  // --- Firmen finden ------------------------------------------------------

  /**
   * Sucht Firmen zu einem Suchauftrag und liefert Kandidaten mit Website.
   * Es wird noch nichts gespeichert -- das passiert erst beim Vertiefen.
   */
  async findCompanyCandidates(
    input: { branche: string; ort?: string; zusatz?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<Result<Array<{ name: string; website: string; snippet: string }>>> {
    const teile = [input.branche, input.ort, input.zusatz].filter(Boolean).join(' ');
    const limit = input.limit ?? 15;

    // Mehrere Formulierungen, damit nicht nur Verzeichnisse zurueckkommen.
    const queries = [
      teile,
      `${teile} Impressum`,
      `${teile} Kontakt Unternehmen`,
    ];

    const kandidaten = new Map<string, { name: string; website: string; snippet: string }>();
    const fehler: string[] = [];

    for (const q of queries) {
      if (kandidaten.size >= limit * 2) break;
      const res = await this.search(q, Math.max(10, limit), signal);
      if (!res.ok) {
        fehler.push(res.error.message);
        continue;
      }
      for (const hit of res.data) {
        const domain = domainOfUrl(hit.url);
        if (!domain || isPortalDomain(domain)) continue;
        if (kandidaten.has(domain)) continue;
        kandidaten.set(domain, {
          name: cleanCompanyName(hit.title, domain),
          website: `https://${domain}`,
          snippet: hit.snippet,
        });
      }
    }

    if (kandidaten.size === 0) {
      return err('NOT_FOUND', `Zu "${teile}" wurden keine Unternehmenswebsites gefunden.`, {
        hint: fehler.length
          ? `Der Suchdienst meldete: ${fehler[0]}`
          : 'Suchbegriff anders formulieren oder einen Suchdienst mit API-Schlüssel eintragen (Tavily, Brave, SerpAPI).',
        detail: { verwendeteAnfragen: queries },
      });
    }

    return ok([...kandidaten.values()].slice(0, limit), { anbieter: this.searchProvider.id });
  }

  // --- Firma vertiefen ----------------------------------------------------

  /**
   * Laedt Website, Kontakt- und Impressumsseite einer Firma und legt alles
   * Belegte in der Datenbank ab. Was nicht gefunden wird, bleibt leer --
   * es wird nichts ergaenzt.
   */
  async profileCompany(
    input: { name: string; website: string; ort?: string | null; branche?: string | null; snippet?: string | null },
    signal?: AbortSignal,
  ): Promise<Result<CompanyProfile>> {
    const hinweise: string[] = [];
    const besuchte: string[] = [];

    const start = await this.fetchPage(input.website, 'website', signal);
    if (!start.ok) {
      return err(start.error.code, `Die Website von ${input.name} war nicht auswertbar: ${start.error.message}`, {
        hint: start.error.hint ?? 'Adresse prüfen oder Firma manuell anlegen.',
      });
    }
    besuchte.push(start.data.finalUrl);

    const extracts: Array<{ page: FetchedPage; kind: SourceKind; extract: PageExtract }> = [
      { page: start.data, kind: 'website', extract: extractFromPage(start.data) },
    ];

    // Impressum und Kontakt sind die belastbaren Seiten -- die holen wir immer.
    const links = extracts[0]!.extract.legalLinks
      .filter((l): l is { url: string; kind: 'impressum' | 'kontakt' } => l.kind !== 'ueber-uns')
      .slice(0, 3);
    for (const link of links) {
      const sub = await this.fetchPage(link.url, link.kind, signal);
      if (!sub.ok) {
        hinweise.push(`${link.url} konnte nicht geladen werden: ${sub.error.message}`);
        continue;
      }
      besuchte.push(sub.data.finalUrl);
      extracts.push({ page: sub.data, kind: link.kind, extract: extractFromPage(sub.data) });
    }

    const website = start.data.finalUrl;
    const siteDomain = registrableDomain(new URL(website).hostname);

    // Postanschrift: die genaueste gefundene gewinnt.
    const adresse =
      extracts.map((e) => e.extract.postalAddress).find((a) => a.street && a.postalCode) ??
      extracts.map((e) => e.extract.postalAddress).find((a) => a.city) ?? { street: null, postalCode: null, city: null };

    const { company } = this.repos.companies.upsert({
      name: input.name,
      website,
      city: adresse.city ?? input.ort ?? null,
      street: adresse.street,
      postalCode: adresse.postalCode,
      industry: input.branche ?? null,
      description: input.snippet ? truncate(input.snippet, 400) : truncate(start.data.text, 400),
    });

    // --- Adressen -------------------------------------------------------
    const emails: CompanyProfile['emails'] = [];
    const gesehen = new Set<string>();

    for (const { page, kind, extract } of extracts) {
      for (const found of extract.emails) {
        if (gesehen.has(found.address)) continue;
        gesehen.add(found.address);

        const mxOk = await this.mxCheck(found.address);
        const klassifikation = classifyAddress({
          address: found.address,
          foundOnUrl: page.finalUrl,
          companyWebsite: website,
          sourceKind: kind,
          mxOk,
        });

        const source = this.repos.companies.addSource({
          url: page.finalUrl,
          kind,
          title: page.title,
          httpStatus: page.status,
          snippet: found.context,
          contentHash: page.contentHash,
          fetchedAt: page.fetchedAt,
        });

        this.repos.companies.addEmailAddress({
          address: found.address,
          companyId: company.id,
          kind: addressKind(found.address),
          verification: klassifikation.status,
          verifyNote: klassifikation.note,
          mxOk,
          sourceId: source.id,
          foundOnUrl: page.finalUrl,
        });

        emails.push({
          address: found.address,
          verification: klassifikation.status,
          note: klassifikation.note,
          sourceUrl: page.finalUrl,
          kind: addressKind(found.address),
        });
      }
    }

    // Verschleierte Adressen nur melden, nicht verwenden.
    const verschleiert = extracts.flatMap(({ page, extract }) =>
      extract.obfuscatedEmails.map((o) => ({ raw: o.raw, fundstelle: page.finalUrl })),
    );
    if (verschleiert.length > 0) {
      hinweise.push(
        `${verschleiert.length} Adresse(n) stehen dort bewusst verschleiert (z. B. "info (at) firma . de"). ` +
          'Das wird als Wunsch gewertet, sie nicht maschinell zu erfassen — bitte bei Bedarf selbst eintragen.',
      );
    }

    // --- Ansprechpartner -------------------------------------------------
    const contacts: CompanyProfile['contacts'] = [];
    for (const { page, kind, extract } of extracts) {
      for (const person of extract.people.slice(0, 5)) {
        const source = this.repos.companies.addSource({
          url: page.finalUrl,
          kind,
          title: page.title,
          snippet: person.context,
          httpStatus: page.status,
          fetchedAt: page.fetchedAt,
        });
        this.repos.companies.addContact({
          companyId: company.id,
          fullName: person.name,
          role: person.role,
          sourceId: source.id,
        });
        contacts.push({ name: person.name, role: person.role, sourceUrl: page.finalUrl });
      }
    }

    // --- Telefon ---------------------------------------------------------
    const phone = extracts.flatMap((e) => e.extract.phones)[0]?.number ?? null;
    if (phone && !company.phone) {
      this.repos.db.prepare('UPDATE companies SET phone = ?, updated_at = ? WHERE id = ?').run(phone, new Date().toISOString(), company.id);
    }

    // --- Fakten mit Quelle ----------------------------------------------
    const fakten: CompanyProfile['fakten'] = [];
    const beschreibung = truncate(extracts[0]!.page.text, 600);
    if (beschreibung) {
      const src = this.repos.companies.addSource({
        url: website,
        kind: 'website',
        title: start.data.title,
        snippet: beschreibung,
        httpStatus: start.data.status,
        fetchedAt: start.data.fetchedAt,
      });
      this.repos.companies.addFact({
        companyId: company.id,
        kind: 'FAKT',
        label: 'Selbstdarstellung (Auszug der Startseite)',
        value: beschreibung,
        sourceId: src.id,
      });
      fakten.push({ label: 'Selbstdarstellung (Auszug der Startseite)', value: beschreibung, sourceUrl: website });
    }

    const verifizierte = emails.filter((e) => e.verification === 'VERIFIZIERT');
    if (verifizierte.length === 0) {
      hinweise.push('Keine verifizierte E-Mail-Adresse gefunden.');
    }

    this.repos.companies.updateStatus(company.id, verifizierte.length > 0 ? 'kontakt_gefunden' : 'recherchiert');
    this.audit.log({
      actor: 'CompanyResearchAgent',
      action: 'recherche.firma',
      summary:
        verifizierte.length > 0
          ? `E-Mail-Adresse auf ${verifizierte[0]!.sourceUrl?.includes('impressum') ? 'der Impressumsseite' : 'der Website'} gefunden: ${verifizierte[0]!.address} (${company.name})`
          : `Firma ${company.name} recherchiert — keine verifizierte E-Mail-Adresse gefunden.`,
      entityType: 'company',
      entityId: company.id,
      detail: { besuchte, gefundeneAdressen: emails.length, domain: siteDomain },
    });
    this.bus?.emit('invalidate', { scope: 'companies' });

    const aktualisiert = this.repos.companies.get(company.id) ?? company;
    return ok({
      company: aktualisiert,
      emails,
      verschleierteAdressen: verschleiert,
      contacts,
      phone,
      fakten,
      besuchteSeiten: besuchte,
      hinweise,
    });
  }
}

/** Portale und Verzeichnisse sind keine Unternehmenswebsites. */
const PORTAL_DOMAINS = new Set([
  'wikipedia.org', 'facebook.com', 'linkedin.com', 'xing.com', 'instagram.com', 'youtube.com',
  'x.com', 'twitter.com', 'gelbeseiten.de', 'dasoertliche.de', '11880.com', 'werkenntdenbesten.de',
  'yelp.de', 'yelp.com', 'google.com', 'goo.gl', 'kununu.com', 'indeed.com', 'stepstone.de',
  'northdata.de', 'firmenwissen.de', 'unternehmensregister.de', 'bundesanzeiger.de',
  'wlw.de', 'europages.de', 'cylex.de', 'meinestadt.de', 'branchenbuch.de', 'handelsregister.de',
  'amazon.de', 'ebay.de', 'immobilienscout24.de', 'pinterest.com', 'tiktok.com', 'reddit.com',
]);

export function isPortalDomain(domain: string): boolean {
  return PORTAL_DOMAINS.has(domain);
}

/**
 * Aus dem Seitentitel einen brauchbaren Firmennamen machen.
 * Titel sind haeufig "Startseite | Muster Bau GmbH – Hochbau in Hamburg".
 */
export function cleanCompanyName(title: string, domain: string): string {
  const parts = title
    .split(/\s[|–—·-]\s/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !/^(startseite|home|willkommen|herzlich willkommen|impressum|kontakt)$/i.test(p));

  const mitRechtsform = parts.find((p) => /\b(GmbH|AG|KG|OHG|GbR|e\.K\.|UG|SE|mbH)\b/i.test(p));
  const kandidat = mitRechtsform ?? parts[0] ?? '';
  const bereinigt = truncate(kandidat.replace(/\s+/g, ' ').trim(), 120);
  return bereinigt || domain;
}

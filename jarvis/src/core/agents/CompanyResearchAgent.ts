import { z } from 'zod/v4';
import type { JarvisError, ResearchSettings, Result, SourceRef } from '../../shared/types.js';
import { err, makeError, ok } from '../../shared/types.js';
import type { CompanyRepository } from '../db/repositories/companies.js';
import type { AuditLogService } from '../services/AuditLogService.js';
import type { CredentialService } from '../services/CredentialService.js';
import type { SettingsService } from '../services/SettingsService.js';
import { HttpFetcher } from '../research/HttpFetcher.js';
import { extractPage, type ExtractedPage } from '../research/PageExtractor.js';
import { createSearchProvider, type SearchHit } from '../research/search.js';
import { registrableDomain, verifyAddress } from '../research/EmailVerifier.js';
import type { LlmProvider } from '../llm/types.js';
import { nowIso } from '../util/id.js';

/**
 * Portals, directories and social networks. A hit on one of these is a lead to
 * a company, never the company itself — its addresses belong to the portal.
 */
const DIRECTORY_DOMAINS = new Set([
  'gelbeseiten.de',
  'dasoertliche.de',
  '11880.com',
  'wlw.de',
  'werliefertwas.de',
  'firmenwissen.de',
  'northdata.de',
  'unternehmensregister.de',
  'handelsregister.de',
  'bundesanzeiger.de',
  'yelp.de',
  'yelp.com',
  'linkedin.com',
  'xing.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'x.com',
  'twitter.com',
  'wikipedia.org',
  'google.com',
  'google.de',
  'maps.google.com',
  'kununu.com',
  'indeed.com',
  'stepstone.de',
  'bing.com',
  'duckduckgo.com',
  'meinestadt.de',
  'branchenbuch.de',
  'cylex.de',
  'trustpilot.com',
  'bauunternehmen.de',
]);

export interface ResearchInput {
  /** Natural-language description of the target group. */
  query: string;
  region?: string;
  limit: number;
  campaignId?: number | null;
}

export interface ResearchOutcome {
  found: number;
  created: number;
  updated: number;
  withVerifiedEmail: number;
  skipped: Array<{ domain: string; reason: string }>;
}

export interface ResearchProgress {
  (message: string): void;
}

export interface CompanyResearchDeps {
  companies: CompanyRepository;
  settings: SettingsService;
  credentials: CredentialService;
  audit: AuditLogService;
  /** Supplies the current LLM; the agent uses it only to read pages, never to invent data. */
  llm: () => Result<LlmProvider, JarvisError>;
}

const ProfileSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  /** Factual summary, drawn only from the supplied page text. */
  description: z.string().nullable().optional(),
  contacts: z
    .array(
      z.object({
        fullName: z.string().min(2),
        role: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        sourceUrl: z.string(),
      }),
    )
    .default([]),
  /** Which of the supplied addresses is the right business contact. */
  preferredEmail: z.string().nullable().optional(),
  /** Explicitly marked as an assessment, kept apart from the facts (§15). */
  assessment: z.string().nullable().optional(),
});

type Profile = z.infer<typeof ProfileSchema>;

/**
 * Finds companies and their published business contact details (§4).
 *
 * Division of labour that keeps the data honest:
 *  - the fetcher and extractor produce facts (page text, mailto addresses)
 *  - the verifier grades every address against where it was found
 *  - the language model only *reads* the supplied text; it may pick among the
 *    addresses that were found but can never introduce one
 */
export class CompanyResearchAgent {
  readonly name = 'CompanyResearchAgent';

  constructor(private readonly deps: CompanyResearchDeps) {}

  async research(
    input: ResearchInput,
    onProgress: ResearchProgress = () => undefined,
  ): Promise<Result<ResearchOutcome, JarvisError>> {
    const settings = this.deps.settings.get();
    const research = settings.research;

    const searchProvider = createSearchProvider(research, this.deps.credentials);
    if (!searchProvider.ok) return searchProvider;

    const fetcher = new HttpFetcher({
      userAgent: research.userAgent,
      crawlDelayMs: research.crawlDelayMs,
      respectRobotsTxt: research.respectRobotsTxt,
    });

    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'recherche.gestartet',
      outcome: 'info',
      detail: `„${input.query}"${input.region ? ` — Region ${input.region}` : ''}, Ziel ${input.limit}`,
    });

    onProgress(`Suche nach „${input.query}"${input.region ? ` in ${input.region}` : ''} …`);

    const queries = buildQueries(input);
    const hits: SearchHit[] = [];
    for (const query of queries) {
      const result = await searchProvider.value.search(query, Math.max(10, input.limit));
      if (!result.ok) {
        // A failing search engine is fatal only if nothing was found at all.
        if (hits.length === 0) return result;
        onProgress(`Suchanfrage „${query}" fehlgeschlagen: ${result.error.message}`);
        continue;
      }
      hits.push(...result.value);
      if (uniqueDomains(hits).size >= input.limit * 2) break;
    }

    if (hits.length === 0) {
      return err(
        makeError('research.no_results', 'Die Suche lieferte keine Treffer.', {
          hint: 'Suchbegriff konkreter fassen oder einen anderen Suchanbieter in den Einstellungen wählen.',
        }),
      );
    }

    const candidates = rankCandidates(hits);
    const outcome: ResearchOutcome = {
      found: 0,
      created: 0,
      updated: 0,
      withVerifiedEmail: 0,
      skipped: [],
    };

    for (const candidate of candidates) {
      if (outcome.found >= input.limit) break;

      onProgress(`Prüfe ${candidate.domain} …`);
      const dossier = await this.investigate(candidate, fetcher, research);
      if (!dossier.ok) {
        outcome.skipped.push({ domain: candidate.domain, reason: dossier.error.message });
        continue;
      }

      const stored = await this.persist(dossier.value, input.campaignId ?? null);
      outcome.found += 1;
      if (stored.created) outcome.created += 1;
      else outcome.updated += 1;
      if (stored.hasVerifiedEmail) outcome.withVerifiedEmail += 1;

      onProgress(
        `${stored.name}: ${
          stored.hasVerifiedEmail ? 'verifizierte Adresse gefunden' : 'keine verifizierte E-Mail-Adresse gefunden'
        }`,
      );
    }

    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: 'recherche.beendet',
      outcome: 'ok',
      detail: `${outcome.found} Unternehmen, davon ${outcome.withVerifiedEmail} mit verifizierter Adresse; ${outcome.skipped.length} übersprungen.`,
    });

    return ok(outcome);
  }

  /* ---------------------------------------------------------------- */

  private async investigate(
    candidate: Candidate,
    fetcher: HttpFetcher,
    research: ResearchSettings,
  ): Promise<Result<Dossier, JarvisError>> {
    const pages: ExtractedPage[] = [];
    const sources: SourceRef[] = [];

    const home = await fetcher.fetchPage(candidate.homepage);
    if (!home.ok) return home;

    const homePage = extractPage(home.value.html, home.value.finalUrl);
    pages.push(homePage);
    sources.push({
      url: home.value.finalUrl,
      kind: 'website',
      title: homePage.title,
      retrievedAt: home.value.retrievedAt,
    });

    const followUps: Array<{ url: string; kind: 'impressum' | 'kontakt' }> = [
      ...homePage.imprintLinks.slice(0, 2).map((url) => ({ url, kind: 'impressum' as const })),
      ...homePage.contactLinks.slice(0, 3).map((url) => ({ url, kind: 'kontakt' as const })),
    ];
    // Common German conventions, tried when the homepage links nothing usable.
    if (followUps.length === 0) {
      for (const path of ['/impressum', '/kontakt']) {
        followUps.push({
          url: new URL(path, home.value.finalUrl).toString(),
          kind: path.includes('impressum') ? 'impressum' : 'kontakt',
        });
      }
    }

    const budget = Math.max(1, research.maxPagesPerCompany - 1);
    for (const followUp of followUps.slice(0, budget)) {
      const page = await fetcher.fetchPage(followUp.url);
      if (!page.ok) continue;
      const extracted = extractPage(page.value.html, page.value.finalUrl);
      pages.push(extracted);
      sources.push({
        url: page.value.finalUrl,
        kind: followUp.kind,
        title: extracted.title,
        retrievedAt: page.value.retrievedAt,
      });
    }

    return ok({ candidate, pages, sources });
  }

  /**
   * Turns the fetched pages into a stored company record.
   * Facts and addresses come from the pages; the model only labels them.
   */
  private async persist(
    dossier: Dossier,
    campaignId: number | null,
  ): Promise<{ name: string; created: boolean; hasVerifiedEmail: boolean }> {
    const { candidate, pages, sources } = dossier;
    const kindByUrl = new Map(sources.map((source) => [source.url, source.kind]));

    const profile = await this.readProfile(dossier);

    const homepage = pages[0]!;
    const imprintSource = sources.find((source) => source.kind === 'impressum');
    const contactSource = sources.find((source) => source.kind === 'kontakt');

    const { company, created } = this.deps.companies.upsert({
      name: profile.companyName || candidate.title || candidate.domain,
      website: homepage.url,
      domain: candidate.domain,
      city: profile.city ?? null,
      region: profile.region ?? null,
      country: 'DE',
      industry: profile.industry ?? null,
      description: profile.description ?? null,
      phone: homepage.phones[0] ?? null,
      contactPageUrl: contactSource?.url ?? null,
      imprintUrl: imprintSource?.url ?? null,
    });

    for (const source of sources) {
      this.deps.companies.addSource(company.id, source, '');
    }

    // Contacts — only people actually named on the pages.
    const contactIdByEmail = new Map<string, number>();
    for (const contact of profile.contacts) {
      if (!pageTextIncludes(pages, contact.fullName)) continue;
      const stored = this.deps.companies.addContact({
        companyId: company.id,
        fullName: contact.fullName,
        role: contact.role ?? null,
        phone: contact.phone ?? null,
        sourceUrl: contact.sourceUrl,
      });
      if (contact.email) contactIdByEmail.set(contact.email.toLowerCase(), stored.id);
    }

    // Addresses — mechanically extracted, then graded.
    let hasVerified = false;
    for (const page of pages) {
      const kind = (kindByUrl.get(page.url) ?? 'sonstige') as
        | 'website'
        | 'kontakt'
        | 'impressum'
        | 'sonstige';
      for (const email of page.emails) {
        const verdict = await verifyAddress({
          address: email.address,
          sourceUrl: page.url,
          sourceKind: kind,
          origin: email.origin,
          companyDomain: candidate.domain,
        });
        if (verdict.status === 'NICHT_VERIFIZIERT' && verdict.mxOk === false) {
          // Keep the record so the UI can explain why nothing is usable.
        }
        this.deps.companies.addEmailAddress({
          companyId: company.id,
          contactId: contactIdByEmail.get(email.address.toLowerCase()) ?? null,
          address: email.address,
          kind: verdict.role ? 'general' : contactIdByEmail.has(email.address.toLowerCase()) ? 'person' : 'department',
          status: verdict.status,
          reason: verdict.reason,
          sourceUrl: page.url,
          mxChecked: verdict.mxChecked,
          mxOk: verdict.mxOk,
        });
        this.deps.companies.addSource(
          company.id,
          {
            url: page.url,
            kind,
            title: page.title,
            excerpt: email.context.slice(0, 400),
            retrievedAt: nowIso(),
          },
          `email:${email.address}`,
        );
        if (verdict.status === 'VERIFIZIERT') hasVerified = true;
      }
    }

    if (profile.assessment) {
      this.deps.companies.setRationale(company.id, `KI-EINSCHÄTZUNG: ${profile.assessment}`);
    }
    this.deps.companies.markResearched(company.id);
    this.deps.companies.setStatus(company.id, hasVerified ? 'Kontakt gefunden' : 'Recherche läuft');

    this.deps.audit.log({
      actor: 'jarvis',
      agent: this.name,
      action: created ? 'unternehmen.angelegt' : 'unternehmen.aktualisiert',
      subject: `company:${company.id}`,
      outcome: 'ok',
      detail: `${company.name} — ${hasVerified ? 'verifizierte' : 'keine verifizierte'} E-Mail-Adresse; Quellen: ${sources
        .map((source) => source.url)
        .join(', ')}`,
    });

    if (campaignId !== null) {
      // The campaign link is established through the drafts the OutreachAgent
      // creates; nothing to store on the company itself.
    }

    return { name: company.name, created, hasVerifiedEmail: hasVerified };
  }

  /**
   * Asks the model to read the fetched pages. The prompt hands it the page text
   * and the list of addresses that were actually found; it may not add any.
   * If the model is unavailable the research still completes with mechanical
   * data only — degraded, and reported as such, rather than fabricated.
   */
  private async readProfile(dossier: Dossier): Promise<Profile> {
    const fallback: Profile = {
      companyName: dossier.candidate.title || dossier.candidate.domain,
      contacts: [],
    };

    const llm = this.deps.llm();
    if (!llm.ok) return fallback;

    const addresses = dossier.pages.flatMap((page) => page.emails.map((email) => email.address));
    const corpus = dossier.pages
      .map(
        (page) =>
          `### Quelle: ${page.url}\nTitel: ${page.title}\n${page.description ? `Beschreibung: ${page.description}\n` : ''}${page.text.slice(0, 6000)}`,
      )
      .join('\n\n');

    const response = await llm.value.complete({
      system: PROFILE_SYSTEM_PROMPT,
      maxTokens: 2000,
      effort: 'low',
      tools: [],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                `Domain: ${dossier.candidate.domain}`,
                `Tatsächlich auf den Seiten gefundene E-Mail-Adressen: ${
                  addresses.length ? addresses.join(', ') : '(keine)'
                }`,
                '',
                corpus,
              ].join('\n'),
            },
          ],
        },
      ],
    });

    if (!response.ok) return fallback;
    const text = response.value.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');

    const parsed = parseJsonObject(text);
    if (!parsed) return fallback;
    const validated = ProfileSchema.safeParse(parsed);
    if (!validated.success) return fallback;

    // Hard guard: the model may only name addresses that were really found.
    const allowed = new Set(addresses.map((address) => address.toLowerCase()));
    const profile = validated.data;
    if (profile.preferredEmail && !allowed.has(profile.preferredEmail.toLowerCase())) {
      profile.preferredEmail = null;
    }
    profile.contacts = profile.contacts.filter(
      (contact) => !contact.email || allowed.has(contact.email.toLowerCase()),
    );
    return profile;
  }
}

const PROFILE_SYSTEM_PROMPT = `Du liest den Text öffentlicher Unternehmensseiten und fasst zusammen, was dort tatsächlich steht.

Absolute Regeln:
- Erfinde nichts. Jede Angabe muss wörtlich oder sinngemäß im gelieferten Text stehen.
- Erfinde NIEMALS eine E-Mail-Adresse. Du darfst ausschließlich Adressen nennen, die dir in der Liste der gefundenen Adressen übergeben wurden. Muster wie vorname.nachname@firma.de sind verboten.
- Wenn eine Angabe fehlt, setze null. Rate nicht.
- Trenne Fakten von Einschätzungen: "description" enthält nur Belegtes, "assessment" enthält deine Einschätzung und darf spekulativ sein.

Antworte ausschließlich mit einem JSON-Objekt in dieser Form, ohne Markdown und ohne Erklärung:
{
  "companyName": string,
  "industry": string|null,
  "city": string|null,
  "region": string|null,
  "description": string|null,
  "contacts": [{"fullName": string, "role": string|null, "email": string|null, "phone": string|null, "sourceUrl": string}],
  "preferredEmail": string|null,
  "assessment": string|null
}`;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface Candidate {
  domain: string;
  homepage: string;
  title: string;
  snippet: string;
  score: number;
}

interface Dossier {
  candidate: Candidate;
  pages: ExtractedPage[];
  sources: SourceRef[];
}

export function buildQueries(input: ResearchInput): string[] {
  const base = input.region ? `${input.query} ${input.region}` : input.query;
  return [base, `${base} Impressum`, `${base} Kontakt`];
}

function uniqueDomains(hits: SearchHit[]): Set<string> {
  const domains = new Set<string>();
  for (const hit of hits) {
    const domain = registrableDomain(hit.url);
    if (domain && !DIRECTORY_DOMAINS.has(domain)) domains.add(domain);
  }
  return domains;
}

/** Groups search hits by company domain and drops portals. */
export function rankCandidates(hits: SearchHit[]): Candidate[] {
  const byDomain = new Map<string, Candidate>();
  for (const hit of hits) {
    const domain = registrableDomain(hit.url);
    if (!domain || DIRECTORY_DOMAINS.has(domain)) continue;
    const existing = byDomain.get(domain);
    if (existing) {
      existing.score += 1;
      continue;
    }
    let homepage: string;
    try {
      const url = new URL(hit.url);
      homepage = `${url.protocol}//${url.host}/`;
    } catch {
      continue;
    }
    byDomain.set(domain, {
      domain,
      homepage,
      title: cleanTitle(hit.title),
      snippet: hit.snippet,
      score: 1,
    });
  }
  return [...byDomain.values()].sort((a, b) => b.score - a.score);
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[|–—-]\s*(Startseite|Home|Willkommen).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pageTextIncludes(pages: ExtractedPage[], needle: string): boolean {
  const value = needle.trim().toLowerCase();
  if (value.length < 3) return false;
  return pages.some((page) => page.text.toLowerCase().includes(value));
}

/** Extracts the first JSON object from a model response, tolerating fences. */
export function parseJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

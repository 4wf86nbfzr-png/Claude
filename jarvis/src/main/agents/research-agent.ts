/**
 * CompanyResearchAgent.
 *
 * Sucht Unternehmen und liest deren öffentliche Seiten aus. Zurück kommt
 * nur, was dort wörtlich steht — mit Quelle und Zeitpunkt. Es wird nichts
 * ergänzt, geraten oder "sinnvoll angenommen".
 *
 * Ablauf je Firma:
 *   Startseite -> Impressum -> Kontaktseite
 * Danach werden gefundene Adressen eingestuft (siehe research/verify.ts).
 */
import {
  insertSource,
  markResearched,
  normalizeDomain,
  updateCompanyFields,
  updateCompanyStatus,
  upsertCompany,
  upsertContact,
  upsertEmailAddress
} from '../db/repos/companies'
import { extractPage, type ExtractedPage } from '../research/extract'
import { fetchPage, FetchBlockedError } from '../research/fetcher'
import { searchWeb, SearchUnavailableError, type SearchHit } from '../research/search'
import { classifyEmail, type FindingOrigin } from '../research/verify'
import { auditInfo, auditWarn } from '../services/audit'
import { dataChanged, status } from '../services/events'
import { getSettings } from '../services/settings'
import type { Company, ToolResult } from '@shared/types'

const AGENT = 'CompanyResearchAgent'

/**
 * Portale und Verzeichnisse. Deren Einträge sind Hinweise, aber nie die
 * Unternehmensseite — Adressen von dort gelten als Fremdquelle.
 */
const DIRECTORY_DOMAINS = new Set([
  'gelbeseiten.de',
  'dasoertliche.de',
  'dastelefonbuch.de',
  '11880.com',
  'wlw.de',
  'europages.de',
  'yelp.de',
  'yelp.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'xing.com',
  'wikipedia.org',
  'indeed.com',
  'stepstone.de',
  'kununu.com',
  'northdata.de',
  'firmenwissen.de',
  'unternehmensregister.de',
  'handelsregister.de',
  'bing.com',
  'google.com',
  'youtube.com',
  'meinestadt.de',
  'branchenbuch.de',
  'cylex.de',
  'hotfrog.de',
  'werliefertwas.de'
])

export interface ResearchOptions {
  /** Wie viele Firmen angestrebt werden. */
  limit?: number
  signal?: AbortSignal
  /** Zwischenmeldung an die Oberfläche. */
  onProgress?: (message: string) => void
}

export interface ResearchedCompany {
  company: Company
  created: boolean
  emails: { address: string; status: string; reason: string; sourceUrl: string }[]
  contacts: { name: string; position: string | null }[]
  sources: { url: string; kind: string }[]
  problems: string[]
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

function isDirectory(host: string): boolean {
  return [...DIRECTORY_DOMAINS].some((d) => host === d || host.endsWith(`.${d}`))
}

/** Fasst Suchtreffer zu Kandidaten zusammen: eine Firma je Domain. */
export function candidatesFromHits(hits: SearchHit[]): { domain: string; url: string; title: string; snippet: string }[] {
  const out = new Map<string, { domain: string; url: string; title: string; snippet: string }>()
  for (const hit of hits) {
    const host = hostOf(hit.url)
    if (!host || isDirectory(host)) continue
    if (out.has(host)) continue
    out.set(host, { domain: host, url: `https://${host}/`, title: hit.title, snippet: hit.snippet })
  }
  return [...out.values()]
}

/** Seitentitel-Bausteine, die nichts über die Firma sagen. */
const TITLE_NOISE =
  /^(startseite|home|willkommen|herzlich willkommen|impressum|kontakt|datenschutz|über uns|über uns|leistungen|aktuelles)$/i

/**
 * Nimmt den Firmennamen aus dem Seitentitel.
 *
 * Titel sind meist mehrteilig ("Startseite – Hoch Sued AG" oder
 * "Bau Nord GmbH | Hochbau in Hamburg"). Gesucht ist das erste Stück, das
 * kein Allgemeinplatz ist.
 */
export function companyNameFromTitle(title: string | null, fallbackDomain: string): string {
  if (!title) return fallbackDomain

  const segments = title
    .split(/[|–—•·]|(?: - )/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean)

  const meaningful = segments.find((segment) => !TITLE_NOISE.test(segment))
  const cleaned = meaningful ?? segments[0] ?? ''

  return cleaned.length >= 3 && cleaned.length <= 120 ? cleaned : fallbackDomain
}

interface PageVisit {
  url: string
  kind: FindingOrigin
  page: ExtractedPage
  sourceId: number
}

/**
 * Liest eine Unternehmenswebsite: Startseite, Impressum, Kontakt.
 * Jede gelesene Seite wird als Quelle gespeichert.
 */
async function visitCompanySite(
  startUrl: string,
  options: ResearchOptions
): Promise<{ visits: PageVisit[]; problems: string[] }> {
  const maxPages = getSettings().research.maxPagesPerCompany
  const visits: PageVisit[] = []
  const problems: string[] = []
  const seen = new Set<string>()

  const visit = async (url: string, kind: FindingOrigin): Promise<ExtractedPage | null> => {
    const key = url.replace(/#.*$/, '')
    if (seen.has(key) || visits.length >= maxPages) return null
    seen.add(key)
    try {
      const fetched = await fetchPage(url, options.signal)
      const page = extractPage(fetched.html, fetched.finalUrl)
      const source = insertSource({
        url: fetched.finalUrl,
        kind,
        title: page.title,
        contentHash: fetched.contentHash,
        excerpt: page.text.slice(0, 600)
      })
      visits.push({ url: fetched.finalUrl, kind, page, sourceId: source.id })
      return page
    } catch (err) {
      const message =
        err instanceof FetchBlockedError ? err.message : err instanceof Error ? err.message : String(err)
      problems.push(`${url}: ${message}`)
      return null
    }
  }

  const home = await visit(startUrl, 'unternehmenswebsite')
  if (home) {
    if (home.imprintUrl) await visit(home.imprintUrl, 'impressum')
    if (home.contactUrl) await visit(home.contactUrl, 'kontaktseite')
  }

  return { visits, problems }
}

/** Verarbeitet eine Website zu einem Datenbankeintrag. */
export async function researchCompanyByUrl(
  url: string,
  options: ResearchOptions = {},
  hint: { name?: string; snippet?: string } = {}
): Promise<ToolResult<ResearchedCompany>> {
  const domain = normalizeDomain(url)
  if (!domain) return { ok: false, error: `"${url}" ist keine brauchbare Adresse.` }

  options.onProgress?.(`Lese ${domain} ...`)
  const { visits, problems } = await visitCompanySite(url, options)

  if (visits.length === 0) {
    return {
      ok: false,
      error: `Von ${domain} ließ sich keine Seite lesen.`,
      hint: problems.join(' | ') || 'Die Seite war nicht erreichbar.'
    }
  }

  const home = visits.find((v) => v.kind === 'unternehmenswebsite')?.page ?? visits[0].page
  const imprint = visits.find((v) => v.kind === 'impressum')
  const contactPage = visits.find((v) => v.kind === 'kontaktseite')

  const name = hint.name?.trim() || companyNameFromTitle(home.title, domain)
  const description =
    home.metaDescription ??
    hint.snippet ??
    home.text.split(/\n+/).find((line) => line.length > 60 && line.length < 400) ??
    null

  const address = imprint?.page.postalCode ? imprint.page : home.postalCode ? home : (contactPage?.page ?? home)

  const { company, created } = upsertCompany({
    name,
    website: `https://${domain}/`,
    description: description ? description.slice(0, 900) : null,
    postalCode: address.postalCode,
    city: address.city,
    street: address.street,
    phone: imprint?.page.phones[0] ?? home.phones[0] ?? null,
    imprintUrl: imprint?.url ?? null,
    contactPageUrl: contactPage?.url ?? null
  })

  // Impressum/Kontakt können später dazukommen — dann nachtragen.
  updateCompanyFields(company.id, {
    imprintUrl: imprint?.url ?? company.imprintUrl,
    contactPageUrl: contactPage?.url ?? company.contactPageUrl
  })

  // ---- Ansprechpartner -----------------------------------------------------
  const contacts: { name: string; position: string | null }[] = []
  for (const visit of visits) {
    for (const person of visit.page.persons) {
      const stored = upsertContact({
        companyId: company.id,
        fullName: person.name,
        position: person.position,
        sourceId: visit.sourceId
      })
      if (!contacts.some((c) => c.name === stored.fullName)) {
        contacts.push({ name: stored.fullName, position: stored.position })
      }
    }
  }

  // ---- Adressen ------------------------------------------------------------
  // Reihenfolge nach Priorität: Impressum, Kontaktseite, Startseite.
  const ordered = [
    ...visits.filter((v) => v.kind === 'impressum'),
    ...visits.filter((v) => v.kind === 'kontaktseite'),
    ...visits.filter((v) => v.kind === 'unternehmenswebsite')
  ]

  const emails: ResearchedCompany['emails'] = []
  const seenAddresses = new Set<string>()

  for (const visit of ordered) {
    for (const address of visit.page.emails) {
      if (seenAddresses.has(address)) continue
      seenAddresses.add(address)

      const outcome = await classifyEmail({
        address,
        origin: visit.kind,
        companyDomain: domain,
        sourceUrl: visit.url
      })

      upsertEmailAddress({
        companyId: company.id,
        address: outcome.address,
        status: outcome.status,
        statusReason: outcome.reason,
        sourceId: visit.sourceId,
        isPrimary: emails.length === 0 && outcome.status === 'VERIFIZIERT',
        mxChecked: outcome.mxChecked,
        mxOk: outcome.mxOk
      })

      emails.push({
        address: outcome.address,
        status: outcome.status,
        reason: outcome.reason,
        sourceUrl: visit.url
      })
    }
  }

  markResearched(company.id)
  const verified = emails.filter((e) => e.status === 'VERIFIZIERT')
  updateCompanyStatus(company.id, verified.length > 0 ? 'kontakt_gefunden' : 'recherche_laeuft')

  if (verified.length === 0) {
    problems.push('Keine verifizierte E-Mail-Adresse gefunden.')
  }

  auditInfo(
    AGENT,
    'Firma recherchiert',
    `${company.name} (${domain}): ${visits.length} Seiten gelesen, ${emails.length} Adressen, davon ${verified.length} verifiziert.`,
    { type: 'company', id: company.id }
  )
  dataChanged('companies')

  return {
    ok: true,
    data: {
      company: { ...company, imprintUrl: imprint?.url ?? company.imprintUrl },
      created,
      emails,
      contacts,
      sources: visits.map((v) => ({ url: v.url, kind: v.kind })),
      problems
    }
  }
}

/**
 * Sucht Firmen zu einer Beschreibung und recherchiert sie der Reihe nach.
 *
 * Die Suchanfrage wird wörtlich übernommen — JARVIS formuliert sie im
 * Agentenschritt davor, damit der Nutzer sieht, wonach gesucht wurde.
 */
export async function researchCompanies(
  query: string,
  options: ResearchOptions = {}
): Promise<ToolResult<{ query: string; provider: string; results: ResearchedCompany[]; skipped: string[] }>> {
  const limit = Math.min(options.limit ?? 10, 50)

  let search
  try {
    // Mehr Treffer holen als Firmen gebraucht werden — Verzeichnisse fallen raus.
    search = await searchWeb(query, { maxResults: Math.min(limit * 3, 40), signal: options.signal })
  } catch (err) {
    if (err instanceof SearchUnavailableError) return { ok: false, error: err.message, hint: err.hint }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Die Websuche ist fehlgeschlagen: ${message}` }
  }

  const candidates = candidatesFromHits(search.hits)
  if (candidates.length === 0) {
    return {
      ok: false,
      error: `Zu "${query}" wurden keine Unternehmensseiten gefunden — nur Verzeichnisse und Portale.`,
      hint: 'Suchbegriff präziser fassen, z. B. Branche plus Ort plus "Impressum".'
    }
  }

  auditInfo(AGENT, 'Recherche gestartet', `"${query}" über ${search.provider}: ${candidates.length} Kandidaten.`)
  status(`${candidates.length} Kandidaten gefunden, ich sehe sie mir an.`)

  const results: ResearchedCompany[] = []
  const skipped: string[] = []

  for (const candidate of candidates) {
    if (results.length >= limit) break
    if (options.signal?.aborted) break

    options.onProgress?.(`(${results.length + 1}/${limit}) ${candidate.domain}`)
    const result = await researchCompanyByUrl(candidate.url, options, {
      name: candidate.title,
      snippet: candidate.snippet
    })

    if (result.ok) results.push(result.data)
    else skipped.push(`${candidate.domain}: ${result.error}`)
  }

  const withVerified = results.filter((r) => r.emails.some((e) => e.status === 'VERIFIZIERT')).length
  auditInfo(
    AGENT,
    'Recherche abgeschlossen',
    `${results.length} Firmen erfasst, ${withVerified} mit verifizierter Adresse, ${skipped.length} übersprungen.`
  )
  if (skipped.length > 0) auditWarn(AGENT, 'Uebersprungen', skipped.slice(0, 10).join(' | '))

  return {
    ok: true,
    data: { query, provider: search.provider, results, skipped },
    note: `${results.length} Firmen erfasst, davon ${withVerified} mit verifizierter Adresse.`
  }
}

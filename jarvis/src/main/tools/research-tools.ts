/**
 * Werkzeuge für Recherche.
 *
 * Alles hier ist lesend. Es wird nichts nach außen gesendet und nichts
 * veröffentlicht — deshalb braucht keines dieser Werkzeuge eine Freigabe.
 */
import { z } from 'zod'
import { researchCompanies, researchCompanyByUrl } from '../agents/research-agent'
import { getCompany, insertSource, listEmailAddresses, normalizeDomain, upsertEmailAddress } from '../db/repos/companies'
import { extractPage } from '../research/extract'
import { fetchPage } from '../research/fetcher'
import { searchWeb, SearchUnavailableError } from '../research/search'
import { classifyEmail } from '../research/verify'
import { defineTool, fail, ok, type JarvisTool } from './types'

const AGENT = 'CompanyResearchAgent'

const searchWebTool = defineTool({
  name: 'search_web',
  agent: AGENT,
  readOnly: true,
  description:
    'Durchsucht das Web und liefert Titel, URL und Textausschnitt der Treffer. ' +
    'Für die Firmensuche besser research_companies verwenden — das liest die Seiten auch gleich aus.',
  schema: z.object({
    query: z.string().min(2).describe('Suchanfrage, so wie sie an die Suchmaschine geht.'),
    max_results: z.number().int().min(1).max(25).optional().describe('Wie viele Treffer höchstens.')
  }),
  async run(input, ctx) {
    ctx.say(`Suche: ${input.query}`)
    try {
      const result = await searchWeb(input.query, { maxResults: input.max_results, signal: ctx.signal })
      return ok(
        { provider: result.provider, hits: result.hits },
        `${result.hits.length} Treffer über ${result.provider}.`
      )
    } catch (err) {
      if (err instanceof SearchUnavailableError) return fail(err.message, err.hint)
      return fail(`Die Suche ist fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
})

const openWebsiteTool = defineTool({
  name: 'open_website',
  agent: AGENT,
  readOnly: true,
  description:
    'Ruft eine Webseite ab und gibt den lesbaren Text sowie gefundene Links, Adressen und Telefonnummern zurück. ' +
    'Die Seite wird als Quelle gespeichert, damit Angaben später belegbar sind.',
  schema: z.object({
    url: z.string().url().describe('Vollständige Adresse inklusive https://'),
    kind: z
      .enum(['impressum', 'kontaktseite', 'unternehmenswebsite', 'fremdquelle'])
      .optional()
      .describe('Art der Seite — steuert, wie belastbar dort gefundene Adressen eingestuft werden.')
  }),
  async run(input, ctx) {
    ctx.say(`Oeffne ${input.url}`)
    try {
      const fetched = await fetchPage(input.url, ctx.signal)
      const page = extractPage(fetched.html, fetched.finalUrl)
      const source = insertSource({
        url: fetched.finalUrl,
        kind: input.kind ?? 'fremdquelle',
        title: page.title,
        contentHash: fetched.contentHash,
        excerpt: page.text.slice(0, 600)
      })
      return ok(
        {
          sourceId: source.id,
          url: fetched.finalUrl,
          title: page.title,
          description: page.metaDescription,
          text: page.text.slice(0, 12_000),
          emails: page.emails,
          phones: page.phones,
          imprintUrl: page.imprintUrl,
          contactUrl: page.contactUrl,
          address: { street: page.street, postalCode: page.postalCode, city: page.city },
          persons: page.persons,
          fetchedAt: fetched.fetchedAt
        },
        `${fetched.finalUrl} gelesen (${page.emails.length} Adressen gefunden).`
      )
    } catch (err) {
      return fail(`${input.url} ließ sich nicht lesen: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
})

const extractCompanyInformationTool = defineTool({
  name: 'extract_company_information',
  agent: AGENT,
  readOnly: true,
  description:
    'Liest eine Unternehmenswebsite vollständig aus (Startseite, Impressum, Kontaktseite), legt die Firma an ' +
    'oder ergänzt sie, speichert Ansprechpartner und stuft gefundene E-Mail-Adressen ein.',
  schema: z.object({
    url: z.string().url().describe('Adresse der Unternehmenswebsite.'),
    name_hint: z.string().optional().describe('Firmenname, falls schon bekannt.')
  }),
  async run(input, ctx) {
    const result = await researchCompanyByUrl(
      input.url,
      { signal: ctx.signal, onProgress: (m) => ctx.say(m) },
      { name: input.name_hint }
    )
    if (!result.ok) return result

    const verified = result.data.emails.filter((e) => e.status === 'VERIFIZIERT')
    return ok(
      {
        companyId: result.data.company.id,
        name: result.data.company.name,
        website: result.data.company.website,
        city: result.data.company.city,
        description: result.data.company.description,
        phone: result.data.company.phone,
        imprintUrl: result.data.company.imprintUrl,
        contactPageUrl: result.data.company.contactPageUrl,
        contacts: result.data.contacts,
        emails: result.data.emails,
        sources: result.data.sources,
        problems: result.data.problems
      },
      verified.length > 0
        ? `${result.data.company.name}: ${verified.length} verifizierte Adresse(n).`
        : `${result.data.company.name}: keine verifizierte E-Mail-Adresse gefunden.`
    )
  }
})

const researchCompaniesTool = defineTool({
  name: 'research_companies',
  agent: AGENT,
  readOnly: true,
  description:
    'Sucht Unternehmen zu einer Beschreibung (z. B. "Bauunternehmen Hamburg Impressum") und liest jede gefundene ' +
    'Firmenseite aus. Legt die Firmen an, speichert Quellen und stuft die Adressen ein. Verzeichnisportale werden ' +
    'übersprungen. Das ist das Standardwerkzeug für "Such mir N Firmen ...".',
  schema: z.object({
    query: z.string().min(3).describe('Suchanfrage, möglichst mit Branche und Ort.'),
    limit: z.number().int().min(1).max(50).optional().describe('Wie viele Firmen angestrebt werden (Vorgabe 10).')
  }),
  async run(input, ctx) {
    const result = await researchCompanies(input.query, {
      limit: input.limit,
      signal: ctx.signal,
      onProgress: (m) => ctx.say(m)
    })
    if (!result.ok) return result

    const compact = result.data.results.map((entry) => ({
      companyId: entry.company.id,
      name: entry.company.name,
      website: entry.company.website,
      city: entry.company.city,
      description: entry.company.description?.slice(0, 300) ?? null,
      contacts: entry.contacts,
      emails: entry.emails.map((e) => ({ address: e.address, status: e.status, source: e.sourceUrl })),
      verifiedEmail: entry.emails.find((e) => e.status === 'VERIFIZIERT')?.address ?? null,
      problems: entry.problems
    }))

    return ok(
      { query: result.data.query, provider: result.data.provider, companies: compact, skipped: result.data.skipped },
      result.note
    )
  }
})

const verifyEmailTool = defineTool({
  name: 'verify_email',
  agent: AGENT,
  readOnly: true,
  description:
    'Prüft eine E-Mail-Adresse: Syntax, MX-Eintrag der Domain und ob sie zur Unternehmensdomain passt. ' +
    'Gibt VERIFIZIERT, WAHRSCHEINLICH oder NICHT_VERIFIZIERT mit Begründung zurück. ' +
    'Erfindet niemals Adressen — es wird nur geprüft, was bereits gefunden wurde.',
  schema: z.object({
    address: z.string().describe('Die zu prüfende Adresse.'),
    company_id: z.number().int().optional().describe('Firma, zu der die Adresse gehören soll.'),
    source_url: z.string().optional().describe('Wo die Adresse gefunden wurde.'),
    origin: z
      .enum(['impressum', 'kontaktseite', 'unternehmenswebsite', 'fremdquelle', 'nutzereingabe'])
      .optional()
      .describe('Art der Fundstelle.')
  }),
  async run(input, ctx) {
    const company = input.company_id ? getCompany(input.company_id) : null
    const domain = company?.domain ?? normalizeDomain(input.source_url ?? null)

    ctx.say(`Prüfe ${input.address}`)
    const outcome = await classifyEmail({
      address: input.address,
      origin: input.origin ?? (input.source_url ? 'fremdquelle' : 'nutzereingabe'),
      companyDomain: domain,
      sourceUrl: input.source_url ?? '(keine Quelle angegeben)'
    })

    if (input.company_id && outcome.status !== 'NICHT_VERIFIZIERT') {
      upsertEmailAddress({
        companyId: input.company_id,
        address: outcome.address,
        status: outcome.status,
        statusReason: outcome.reason,
        mxChecked: outcome.mxChecked,
        mxOk: outcome.mxOk
      })
    }

    return ok(outcome, `${outcome.address}: ${outcome.status} — ${outcome.reason}`)
  }
})

const listCompanyEmailsTool = defineTool({
  name: 'list_company_emails',
  agent: AGENT,
  readOnly: true,
  description: 'Listet alle zu einer Firma gespeicherten E-Mail-Adressen mit Einstufung und Begründung.',
  schema: z.object({ company_id: z.number().int() }),
  async run(input) {
    const company = getCompany(input.company_id)
    if (!company) return fail(`Firma ${input.company_id} existiert nicht.`)
    const addresses = listEmailAddresses(input.company_id)
    if (addresses.length === 0) {
      return ok({ company: company.name, addresses: [] }, `Für ${company.name} ist keine Adresse gespeichert.`)
    }
    return ok(
      {
        company: company.name,
        addresses: addresses.map((a) => ({ address: a.address, status: a.status, reason: a.statusReason }))
      },
      `${addresses.length} Adresse(n) für ${company.name}.`
    )
  }
})

export const researchTools: JarvisTool[] = [
  searchWebTool,
  openWebsiteTool,
  extractCompanyInformationTool,
  researchCompaniesTool,
  verifyEmailTool,
  listCompanyEmailsTool
] as JarvisTool[]

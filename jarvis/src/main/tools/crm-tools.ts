/**
 * Werkzeuge für Firmendatenbank, Kampagnen und Versandzentrale.
 */
import { z } from 'zod'
import { prepareDraftForCompany, runCampaign } from '../agents/outreach-agent'
import { getCompany, listCompanies, listContacts, listEmailAddresses, setDoNotContact, updateCompanyFields } from '../db/repos/companies'
import { createCampaign, findCampaignByName, getCampaign, listCampaigns, listHistory, setCampaignStatus } from '../db/repos/outreach'
import { listSendCenter } from '../services/sendcenter'
import { defineTool, fail, ok, type JarvisTool } from './types'

const AGENT = 'OutreachAgent'

const listCompaniesTool = defineTool({
  name: 'list_companies',
  agent: AGENT,
  readOnly: true,
  description: 'Listet gespeicherte Firmen, wahlweise gefiltert nach einem Suchbegriff (Name, Ort, Branche, Domain).',
  schema: z.object({
    search: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional()
  }),
  async run(input) {
    const companies = listCompanies(input.search, input.limit ?? 50)
    return ok(
      companies.map((c) => ({
        id: c.id,
        name: c.name,
        website: c.website,
        city: c.city,
        status: c.status,
        lastContactedAt: c.lastContactedAt,
        doNotContact: c.doNotContact
      })),
      `${companies.length} Firmen.`
    )
  }
})

const getCompanyTool = defineTool({
  name: 'get_company',
  agent: AGENT,
  readOnly: true,
  description:
    'Gibt alles zu einer Firma zurück: Stammdaten, Ansprechpartner, Adressen mit Einstufung und die Kontakthistorie. ' +
    'Damit lässt sich prüfen, ob eine Firma bereits angeschrieben wurde.',
  schema: z.object({ company_id: z.number().int() }),
  async run(input) {
    const company = getCompany(input.company_id)
    if (!company) return fail(`Firma ${input.company_id} existiert nicht.`)

    const history = listHistory(company.id)
    return ok(
      {
        company,
        contacts: listContacts(company.id),
        emails: listEmailAddresses(company.id).map((a) => ({
          address: a.address,
          status: a.status,
          reason: a.statusReason
        })),
        history: history.map((h) => ({ at: h.occurredAt, kind: h.kind, summary: h.summary })),
        alreadyContacted: Boolean(company.lastContactedAt)
      },
      company.lastContactedAt
        ? `${company.name} wurde am ${new Date(company.lastContactedAt).toLocaleDateString('de-DE')} bereits angeschrieben.`
        : `${company.name} wurde bisher nicht angeschrieben.`
    )
  }
})

const noteCompanyTool = defineTool({
  name: 'note_company',
  agent: AGENT,
  readOnly: false,
  description: 'Speichert eine Notiz oder korrigiert Stammdaten einer Firma.',
  schema: z.object({
    company_id: z.number().int(),
    notes: z.string().optional(),
    industry: z.string().optional(),
    size_hint: z.string().optional(),
    acquisition_reason: z.string().optional().describe('KI-Einschätzung, warum die Firma interessant ist.')
  }),
  async run(input) {
    const company = getCompany(input.company_id)
    if (!company) return fail(`Firma ${input.company_id} existiert nicht.`)
    updateCompanyFields(input.company_id, {
      notes: input.notes,
      industry: input.industry,
      sizeHint: input.size_hint,
      acquisitionReason: input.acquisition_reason
    })
    return ok({ companyId: input.company_id }, `Notiz zu ${company.name} gespeichert.`)
  }
})

const doNotContactCompanyTool = defineTool({
  name: 'set_company_do_not_contact',
  agent: AGENT,
  readOnly: false,
  description: 'Markiert eine Firma als "nicht kontaktieren" oder hebt die Markierung auf.',
  schema: z.object({ company_id: z.number().int(), value: z.boolean(), reason: z.string().optional() }),
  async run(input) {
    const company = getCompany(input.company_id)
    if (!company) return fail(`Firma ${input.company_id} existiert nicht.`)
    setDoNotContact(input.company_id, input.value)
    if (input.reason) updateCompanyFields(input.company_id, { notes: input.reason })
    return ok(
      { companyId: input.company_id, doNotContact: input.value },
      input.value ? `${company.name} wird nicht mehr kontaktiert.` : `${company.name} darf wieder kontaktiert werden.`
    )
  }
})

const createCampaignTool = defineTool({
  name: 'create_campaign',
  agent: AGENT,
  readOnly: false,
  description:
    'Legt eine Akquise-Kampagne an (Name, Leistung, Region, Zielzahl). Startet noch nichts — dafür run_campaign.',
  schema: z.object({
    name: z.string().min(2),
    service: z.string().min(2).describe('Die angebotene Leistung, z. B. "24/7 Baustellenbewachung".'),
    region: z.string().min(2).describe('z. B. "Hamburg" oder "Hamburg + 50 km".'),
    target_count: z.number().int().min(1).max(200).optional(),
    radius_km: z.number().int().min(0).max(500).optional(),
    briefing: z.string().optional().describe('Zusatzhinweise, die in jeden Mailtext einfließen sollen.')
  }),
  async run(input) {
    const existing = findCampaignByName(input.name)
    if (existing) {
      return ok({ campaignId: existing.id, existed: true }, `Kampagne "${existing.name}" gibt es bereits (#${existing.id}).`)
    }
    const campaign = createCampaign({
      name: input.name,
      service: input.service,
      region: input.region,
      targetCount: input.target_count ?? 20,
      radiusKm: input.radius_km ?? null,
      briefing: input.briefing ?? null
    })
    return ok({ campaignId: campaign.id, existed: false }, `Kampagne "${campaign.name}" angelegt (#${campaign.id}).`)
  }
})

const runCampaignTool = defineTool({
  name: 'run_campaign',
  agent: AGENT,
  readOnly: false,
  description:
    'Fährt eine Kampagne bis zum Entwurf durch: Firmen recherchieren, Dubletten und bereits kontaktierte Firmen ' +
    'aussortieren, Adressen prüfen, je Firma einen individuellen Entwurf schreiben. Versendet NICHTS. ' +
    'Das kann einige Minuten dauern.',
  schema: z.object({
    campaign_id: z.number().int(),
    search_query: z.string().optional().describe('Eigene Suchanfrage; sonst wird sie aus Name und Region gebildet.')
  }),
  async run(input, ctx) {
    ctx.say('Kampagne läuft an ...')
    const result = await runCampaign(input.campaign_id, { signal: ctx.signal, searchQuery: input.search_query })
    if (!result.ok) return result
    return ok(
      {
        campaign: result.data.campaign.name,
        researched: result.data.researched,
        drafted: result.data.drafted,
        drafts: result.data.drafts,
        skipped: result.data.skipped.map((s) => `${s.companyName}: ${s.skipped}`),
        problems: result.data.problems.slice(0, 15)
      },
      result.note
    )
  }
})

const prepareDraftTool = defineTool({
  name: 'prepare_outreach_draft',
  agent: AGENT,
  readOnly: false,
  description:
    'Schreibt für genau eine bereits recherchierte Firma einen individuellen Akquise-Entwurf, inklusive Begründung, ' +
    'warum die Firma interessant sein könnte. Versendet nichts.',
  schema: z.object({
    company_id: z.number().int(),
    service: z.string().min(2).describe('Die angebotene Leistung.'),
    campaign_id: z.number().int().optional(),
    briefing: z.string().optional(),
    force: z.boolean().optional().describe('Auch dann, wenn die Firma bereits angeschrieben wurde.')
  }),
  async run(input, ctx) {
    const campaign = input.campaign_id ? getCampaign(input.campaign_id) : null
    const result = await prepareDraftForCompany(
      input.company_id,
      {
        id: input.campaign_id ?? null,
        service: input.service || campaign?.service || '',
        briefing: input.briefing ?? campaign?.briefing ?? null,
        region: campaign?.region
      },
      { signal: ctx.signal, force: input.force }
    )
    if (!result.ok) return result
    if (result.data.skipped) return ok(result.data, `${result.data.companyName}: ${result.data.skipped}`)
    return ok(result.data, `Entwurf #${result.data.emailId} für ${result.data.companyName} steht.`)
  }
})

const listCampaignsTool = defineTool({
  name: 'list_campaigns',
  agent: AGENT,
  readOnly: true,
  description: 'Listet alle Kampagnen mit Status.',
  schema: z.object({}),
  async run() {
    const campaigns = listCampaigns()
    return ok(campaigns, `${campaigns.length} Kampagnen.`)
  }
})

const closeCampaignTool = defineTool({
  name: 'set_campaign_status',
  agent: AGENT,
  readOnly: false,
  description: 'Setzt den Status einer Kampagne (entwurf, aktiv, pausiert, abgeschlossen).',
  schema: z.object({
    campaign_id: z.number().int(),
    status: z.enum(['entwurf', 'aktiv', 'pausiert', 'abgeschlossen'])
  }),
  async run(input) {
    const campaign = getCampaign(input.campaign_id)
    if (!campaign) return fail(`Kampagne ${input.campaign_id} existiert nicht.`)
    setCampaignStatus(input.campaign_id, input.status)
    return ok({ campaignId: input.campaign_id, status: input.status }, `"${campaign.name}" steht jetzt auf ${input.status}.`)
  }
})

const sendCenterTool = defineTool({
  name: 'list_send_center',
  agent: AGENT,
  readOnly: true,
  description:
    'Zeigt die Versandzentrale: je Vorgang Unternehmen, Ansprechpartner, Adresse, Quelle, Verifizierung, ' +
    'Akquisegrund, Mailstatus, letzter Kontakt und Freigabestatus. Damit lassen sich Fragen wie ' +
    '"Zeig mir alle fertigen Entwürfe" beantworten.',
  schema: z.object({
    status: z.string().optional().describe('Mailstatus (entwurf, wartet_auf_freigabe, gesendet, fehler) oder Firmenstatus.'),
    campaign_id: z.number().int().optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(200).optional()
  }),
  async run(input) {
    const rows = listSendCenter({
      status: input.status,
      campaignId: input.campaign_id,
      search: input.search,
      limit: input.limit ?? 50
    })
    return ok(rows, `${rows.length} Einträge in der Versandzentrale.`)
  }
})

export const crmTools: JarvisTool[] = [
  listCompaniesTool,
  getCompanyTool,
  noteCompanyTool,
  doNotContactCompanyTool,
  createCampaignTool,
  runCampaignTool,
  prepareDraftTool,
  listCampaignsTool,
  closeCampaignTool,
  sendCenterTool
] as JarvisTool[]

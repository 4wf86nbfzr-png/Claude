/**
 * OutreachAgent.
 *
 * Verbindet Recherche und MailAgent: Firmen suchen, Ergebnisse bereinigen,
 * bereits kontaktierte erkennen, Kontaktdaten prüfen, eine Begründung
 * erstellen und daraus einen individuellen Entwurf schreiben.
 *
 * Der Text jeder Mail wird einzeln erzeugt. Eine identische Rundmail wäre
 * genau das, was hier nicht passieren soll — und fällt beim Empfänger auch
 * sofort auf.
 */
import { bestEmailAddress, getCompany, listContacts, listEmailAddresses, updateCompanyFields } from '../db/repos/companies'
import { getCampaign, getEmail, lastSentEmailForCompany, openDraftForCompany } from '../db/repos/outreach'
import { getLlm } from '../llm'
import { auditInfo, auditWarn } from '../services/audit'
import { dataChanged, status } from '../services/events'
import { getSettings } from '../services/settings'
import { createDraft } from './mail-agent'
import { researchCompanies } from './research-agent'
import type { Campaign, Company, EmailDraft, ToolResult } from '@shared/types'

const AGENT = 'OutreachAgent'

// ---------------------------------------------------------------------------
// Textbausteine für das Modell
// ---------------------------------------------------------------------------

const WRITING_RULES = `
Regeln für den Text:
- Sie-Form, höflich, hanseatisch-sachlich. Kein Werbedeutsch, keine Superlative.
- Höchstens 150 Wörter im Fließtext. Kurze Absätze.
- KEINE erfundenen Angaben. Nur was in den Fakten steht, darf im Text stehen.
  Keine erfundenen Bauprojekte, Mitarbeiterzahlen, Referenzen oder Jubiläen.
- Wenn über die Firma wenig bekannt ist, dann allgemein bleiben statt zu raten.
- Kein "Ich habe gesehen, dass ...", wenn es dafür keinen Beleg in den Fakten gibt.
- Keine Anrede mit Namen, wenn kein Ansprechpartner belegt ist; dann
  "Sehr geehrte Damen und Herren".
- Keine Grußformel-Signatur anhängen: die setzt das Programm selbst darunter.
- Kein Abmeldehinweis im Text: den setzt das Programm ebenfalls selbst.
- Betreff: sachlich, höchstens 65 Zeichen, ohne Ausrufezeichen, ohne "Angebot".
`.trim()

function factSheet(company: Company): string {
  const contacts = listContacts(company.id)
  const addresses = listEmailAddresses(company.id)
  const lines: string[] = []

  lines.push(`Firmenname: ${company.name}`)
  if (company.website) lines.push(`Website: ${company.website}`)
  if (company.industry) lines.push(`Branche (laut Website): ${company.industry}`)
  if (company.street || company.postalCode || company.city) {
    lines.push(`Anschrift (laut Impressum): ${[company.street, company.postalCode, company.city].filter(Boolean).join(', ')}`)
  }
  if (company.phone) lines.push(`Telefon: ${company.phone}`)
  if (company.description) lines.push(`Selbstbeschreibung der Website: ${company.description}`)
  if (contacts.length > 0) {
    lines.push(
      `Oeffentlich genannte Ansprechpartner: ${contacts.map((c) => `${c.fullName}${c.position ? ` (${c.position})` : ''}`).join('; ')}`
    )
  }
  if (addresses.length > 0) {
    lines.push(
      `Gefundene Adressen: ${addresses.map((a) => `${a.address} [${a.status}]`).join('; ')}`
    )
  }
  if (lines.length <= 2) lines.push('(Darüber hinaus ist nichts belegt.)')
  return lines.join('\n')
}

/** Holt das erste JSON-Objekt aus einer Modellantwort. */
export function parseJsonObject<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Einschätzung und Entwurf
// ---------------------------------------------------------------------------

export interface DraftedOutreach {
  subject: string
  body: string
  acquisitionReason: string
  personalizationBasis: string
}

/**
 * Lässt das Sprachmodell Begründung und Mailtext schreiben.
 *
 * Die Fakten kommen aus der Datenbank, die Einschätzung vom Modell — und
 * beides wird getrennt gespeichert, damit später erkennbar bleibt, was
 * belegt ist und was nicht.
 */
export async function draftOutreachText(
  company: Company,
  campaign: { service: string; briefing?: string | null; region?: string },
  options: { signal?: AbortSignal } = {}
): Promise<ToolResult<DraftedOutreach>> {
  const settings = getSettings()
  const contacts = listContacts(company.id)
  const salutation = contacts[0]?.fullName ?? null

  const system = [
    'Du schreibst geschäftliche Erstkontakt-Mails für einen deutschen Personaldienstleister.',
    'Du arbeitest ausschließlich mit den übergebenen Fakten. Erfinde nichts.',
    'Du antwortest ausschließlich mit einem JSON-Objekt, ohne Text davor oder danach.'
  ].join(' ')

  const prompt = `
Absender: ${settings.outreach.senderCompany || '(Firmenname in den Einstellungen hinterlegen)'}
Angebotene Leistung: ${campaign.service}
${campaign.region ? `Region: ${campaign.region}` : ''}
${campaign.briefing ? `Zusatzhinweise des Nutzers: ${campaign.briefing}` : ''}
${salutation ? `Belegter Ansprechpartner für die Anrede: ${salutation}` : 'Kein Ansprechpartner belegt.'}

FAKTEN über das Zielunternehmen (aus der Recherche, jede Zeile ist belegt):
${factSheet(company)}

${WRITING_RULES}

Antworte mit genau diesem JSON:
{
  "akquisegrund": "Ein bis zwei Sätze: warum dieses Unternehmen für die Leistung interessant sein könnte. Das ist eine EINSCHAETZUNG, kein Fakt — formuliere sie entsprechend vorsichtig.",
  "personalisierungsbasis": "Welche der obigen Fakten du im Text verwendet hast. Wenn keine: 'keine firmenspezifischen Fakten verfügbar'.",
  "betreff": "Betreffzeile",
  "text": "Der Mailtext mit Anrede und Grußformel, ohne Signatur."
}`.trim()

  let response
  try {
    response = await getLlm().complete({
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      tools: [],
      maxTokens: 2000,
      signal: options.signal
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Das Sprachmodell hat den Entwurf nicht geliefert: ${message}` }
  }

  const parsed = parseJsonObject<{
    akquisegrund?: string
    personalisierungsbasis?: string
    betreff?: string
    text?: string
  }>(response.text)

  if (!parsed?.betreff || !parsed?.text) {
    return {
      ok: false,
      error: 'Die Antwort des Sprachmodells ließ sich nicht als Entwurf lesen.',
      hint: response.text.slice(0, 300)
    }
  }

  return {
    ok: true,
    data: {
      subject: parsed.betreff.trim().slice(0, 200),
      body: parsed.text.trim(),
      acquisitionReason: (parsed.akquisegrund ?? '').trim(),
      personalizationBasis: (parsed.personalisierungsbasis ?? 'nicht angegeben').trim()
    }
  }
}

// ---------------------------------------------------------------------------
// Entwurf je Firma
// ---------------------------------------------------------------------------

export interface PrepareResult {
  companyId: number
  companyName: string
  emailId: number | null
  address: string | null
  verification: string | null
  skipped: string | null
  warnings: string[]
}

/**
 * Bereitet für genau eine Firma einen Entwurf vor.
 * Versendet nichts und beantragt auch keine Freigabe.
 */
export async function prepareDraftForCompany(
  companyId: number,
  campaign: { id?: number | null; service: string; briefing?: string | null; region?: string },
  options: { signal?: AbortSignal; force?: boolean } = {}
): Promise<ToolResult<PrepareResult>> {
  const company = getCompany(companyId)
  if (!company) return { ok: false, error: `Firma ${companyId} existiert nicht.` }

  const base: PrepareResult = {
    companyId,
    companyName: company.name,
    emailId: null,
    address: null,
    verification: null,
    skipped: null,
    warnings: []
  }

  if (company.doNotContact) {
    return { ok: true, data: { ...base, skipped: 'Steht auf "nicht kontaktieren".' } }
  }

  const already = lastSentEmailForCompany(companyId)
  if (already && !options.force) {
    const when = new Date(already.sentAt ?? already.createdAt).toLocaleDateString('de-DE')
    return {
      ok: true,
      data: { ...base, skipped: `Wurde am ${when} bereits angeschrieben — kein zweiter Erstkontakt.` }
    }
  }

  const open = openDraftForCompany(companyId)
  if (open && !options.force) {
    return {
      ok: true,
      data: {
        ...base,
        emailId: open.id,
        address: open.toAddress,
        verification: open.recipientVerification,
        skipped: `Es liegt bereits Entwurf #${open.id} vor.`
      }
    }
  }

  const address = bestEmailAddress(companyId)
  if (!address) {
    return { ok: true, data: { ...base, skipped: 'Keine verifizierte E-Mail-Adresse gefunden.' } }
  }
  if (address.status !== 'VERIFIZIERT' && getSettings().outreach.requireVerifiedAddress) {
    return {
      ok: true,
      data: {
        ...base,
        address: address.address,
        verification: address.status,
        skipped: `Nur eine als ${address.status} eingestufte Adresse vorhanden — für den Versand reicht das nicht.`
      }
    }
  }

  const drafted = await draftOutreachText(company, campaign, { signal: options.signal })
  if (!drafted.ok) return drafted

  if (drafted.data.acquisitionReason) {
    updateCompanyFields(companyId, {
      acquisitionReason: drafted.data.acquisitionReason,
      acquisitionBasis: drafted.data.personalizationBasis
    })
  }

  const contact = listContacts(companyId)[0] ?? null
  const created = createDraft({
    companyId,
    contactId: contact?.id ?? null,
    campaignId: campaign.id ?? null,
    toAddress: address.address,
    toName: contact?.fullName ?? company.name,
    subject: drafted.data.subject,
    bodyText: drafted.data.body,
    recipientVerification: address.status,
    personalizationBasis: drafted.data.personalizationBasis,
    forceSecondContact: options.force
  })

  if (!created.ok) return { ok: true, data: { ...base, address: address.address, skipped: created.error } }

  return {
    ok: true,
    data: {
      ...base,
      emailId: created.data.email.id,
      address: address.address,
      verification: address.status,
      warnings: created.data.warnings
    }
  }
}

// ---------------------------------------------------------------------------
// Kampagne
// ---------------------------------------------------------------------------

export interface CampaignRunResult {
  campaign: Campaign
  researched: number
  drafted: number
  skipped: PrepareResult[]
  drafts: { emailId: number; company: string; address: string; subject: string }[]
  problems: string[]
}

/**
 * Fährt eine Kampagne bis zum Entwurf durch: recherchieren, bereinigen,
 * Entwürfe schreiben. Der Versand bleibt außen vor — dafür gibt es die
 * Versandzentrale und die Freigabe.
 */
export async function runCampaign(
  campaignId: number,
  options: { signal?: AbortSignal; searchQuery?: string } = {}
): Promise<ToolResult<CampaignRunResult>> {
  const campaign = getCampaign(campaignId)
  if (!campaign) return { ok: false, error: `Kampagne ${campaignId} existiert nicht.` }

  const query =
    options.searchQuery ??
    `${campaign.name} ${campaign.region}`.trim()

  status(`Kampagne "${campaign.name}": Recherche läuft.`)
  auditInfo(AGENT, 'Kampagne gestartet', `${campaign.name} — Ziel ${campaign.targetCount} Firmen, Suche: "${query}"`, {
    type: 'campaign',
    id: campaign.id
  })

  const research = await researchCompanies(query, {
    limit: campaign.targetCount,
    signal: options.signal,
    onProgress: (message) => status(message)
  })

  if (!research.ok) return research

  const drafts: CampaignRunResult['drafts'] = []
  const skipped: PrepareResult[] = []
  const problems: string[] = [...research.data.skipped]

  for (const entry of research.data.results) {
    if (options.signal?.aborted) break
    status(`Entwurf für ${entry.company.name} ...`)

    const prepared = await prepareDraftForCompany(
      entry.company.id,
      { id: campaign.id, service: campaign.service, briefing: campaign.briefing, region: campaign.region },
      { signal: options.signal }
    )

    if (!prepared.ok) {
      problems.push(`${entry.company.name}: ${prepared.error}`)
      continue
    }
    if (prepared.data.skipped) {
      skipped.push(prepared.data)
      continue
    }
    if (prepared.data.emailId) {
      drafts.push({
        emailId: prepared.data.emailId,
        company: prepared.data.companyName,
        address: prepared.data.address ?? '',
        subject: '' // wird unten nachgetragen
      })
    }
  }

  // Betreffzeilen nachtragen, damit die Rückgabe für die Ansage taugt.
  for (const draft of drafts) {
    const email: EmailDraft | null = getEmail(draft.emailId)
    if (email) draft.subject = email.subject
  }

  auditInfo(
    AGENT,
    'Kampagne vorbereitet',
    `${campaign.name}: ${research.data.results.length} Firmen recherchiert, ${drafts.length} Entwürfe, ${skipped.length} zurückgestellt.`,
    { type: 'campaign', id: campaign.id }
  )
  if (problems.length > 0) auditWarn(AGENT, 'Kampagne — Hinweise', problems.slice(0, 12).join(' | '))
  dataChanged('emails')

  return {
    ok: true,
    data: {
      campaign,
      researched: research.data.results.length,
      drafted: drafts.length,
      skipped,
      drafts,
      problems
    },
    note: `${drafts.length} Entwürfe fertig, ${skipped.length} zurückgestellt. Nichts wurde versendet.`
  }
}

/**
 * Werkzeuge für E-Mail.
 *
 * `send_email` versendet NICHT. Es legt eine Freigabeanfrage an und gibt sie
 * zurück. Erst die Entscheidung des Nutzers löst den Versand aus. Das ist
 * über die Beschreibung so klar formuliert, dass das Sprachmodell es dem
 * Nutzer auch korrekt ansagt.
 */
import { statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { z } from 'zod'
import {
  createDraft,
  editDraft,
  readAloudText,
  requestBulkSend,
  requestSend,
  syncReplies
} from '../agents/mail-agent'
import { bestEmailAddress, getCompany, listContacts, listEmailAddresses } from '../db/repos/companies'
import { addAttachment, addToDoNotContact, getEmail, listEmails, removeFromDoNotContact } from '../db/repos/outreach'
import { defineTool, fail, ok, type JarvisTool } from './types'

const AGENT = 'MailAgent'

const createEmailDraftTool = defineTool({
  name: 'create_email_draft',
  agent: AGENT,
  readOnly: false,
  description:
    'Legt einen E-Mail-Entwurf an. Versendet nichts. Prüft dabei Sperrliste, Dubletten und ob die Firma bereits ' +
    'angeschrieben wurde. Wenn eine Firma zugeordnet ist, wird die beste gespeicherte Adresse verwendet, sofern ' +
    'keine ausdrücklich angegeben ist.',
  schema: z.object({
    to_address: z.string().optional().describe('Empfängeradresse. Weglassen, wenn company_id gesetzt ist.'),
    company_id: z.number().int().optional().describe('Firma, an die geschrieben wird.'),
    subject: z.string().min(1).describe('Betreffzeile.'),
    body: z.string().min(1).describe('Der Mailtext. Ohne Signatur — die hängt das Programm an.'),
    to_name: z.string().optional().describe('Name des Empfängers für die Anrede im Kopf.'),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    campaign_id: z.number().int().optional(),
    force_second_contact: z
      .boolean()
      .optional()
      .describe('Nur setzen, wenn der Nutzer einen erneuten Kontakt ausdrücklich verlangt hat.')
  }),
  async run(input) {
    let address = input.to_address
    let verification: 'VERIFIZIERT' | 'WAHRSCHEINLICH' | 'NICHT_VERIFIZIERT' = 'NICHT_VERIFIZIERT'
    let contactId: number | null = null

    if (input.company_id) {
      const company = getCompany(input.company_id)
      if (!company) return fail(`Firma ${input.company_id} existiert nicht.`)

      if (address) {
        const known = listEmailAddresses(input.company_id).find((a) => a.address === address?.toLowerCase())
        verification = known?.status ?? 'NICHT_VERIFIZIERT'
      } else {
        const best = bestEmailAddress(input.company_id)
        if (!best) {
          return fail(
            `Für ${company.name} ist keine E-Mail-Adresse gespeichert.`,
            'Keine verifizierte E-Mail-Adresse gefunden — bitte zuerst recherchieren oder eine Adresse angeben.'
          )
        }
        address = best.address
        verification = best.status
      }
      contactId = listContacts(input.company_id)[0]?.id ?? null
    }

    if (!address) return fail('Es fehlt eine Empfängeradresse (to_address oder company_id angeben).')

    return createDraft({
      toAddress: address,
      toName: input.to_name ?? null,
      subject: input.subject,
      bodyText: input.body,
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      companyId: input.company_id ?? null,
      contactId,
      campaignId: input.campaign_id ?? null,
      recipientVerification: verification,
      forceSecondContact: input.force_second_contact
    })
  }
})

const readEmailDraftTool = defineTool({
  name: 'read_email_draft',
  agent: AGENT,
  readOnly: true,
  description:
    'Gibt einen Entwurf vollständig zurück: Empfänger, Betreff und Text — in der Form, in der er vorgelesen wird.',
  schema: z.object({ email_id: z.number().int() }),
  async run(input) {
    const email = getEmail(input.email_id)
    if (!email) return fail(`Entwurf #${input.email_id} existiert nicht.`)
    return ok(
      {
        id: email.id,
        toAddress: email.toAddress,
        toName: email.toName,
        subject: email.subject,
        body: email.bodyText,
        status: email.status,
        verification: email.recipientVerification,
        spoken: readAloudText(email)
      },
      `Entwurf #${email.id} an ${email.toAddress}.`
    )
  }
})

const updateEmailDraftTool = defineTool({
  name: 'update_email_draft',
  agent: AGENT,
  readOnly: false,
  description:
    'Aendert einen Entwurf (Betreff, Text, Empfänger). War der Entwurf bereits freigegeben, verfällt die Freigabe ' +
    'und muss neu eingeholt werden — sonst würde ein anderer Text versendet als der geprüfte.',
  schema: z.object({
    email_id: z.number().int(),
    subject: z.string().optional(),
    body: z.string().optional(),
    to_address: z.string().optional(),
    cc: z.string().optional(),
    bcc: z.string().optional()
  }),
  async run(input) {
    const patch: Record<string, string> = {}
    if (input.subject !== undefined) patch.subject = input.subject
    if (input.body !== undefined) patch.bodyText = input.body
    if (input.to_address !== undefined) patch.toAddress = input.to_address
    if (input.cc !== undefined) patch.cc = input.cc
    if (input.bcc !== undefined) patch.bcc = input.bcc
    if (Object.keys(patch).length === 0) return fail('Es wurde keine Aenderung angegeben.')

    const result = editDraft(input.email_id, patch)
    if (!result.ok) return result
    return ok(
      { id: result.data.id, subject: result.data.subject, body: result.data.bodyText, status: result.data.status },
      `Entwurf #${result.data.id} geändert.`
    )
  }
})

const listEmailDraftsTool = defineTool({
  name: 'list_email_drafts',
  agent: AGENT,
  readOnly: true,
  description: 'Listet E-Mail-Entwürfe, wahlweise gefiltert nach Status oder Kampagne.',
  schema: z.object({
    status: z
      .enum(['entwurf', 'wartet_auf_freigabe', 'freigegeben', 'gesendet', 'fehler'])
      .optional()
      .describe('Ohne Angabe werden alle gezeigt.'),
    campaign_id: z.number().int().optional()
  }),
  async run(input) {
    const emails = listEmails({ status: input.status, campaignId: input.campaign_id })
    return ok(
      emails.map((e) => ({
        id: e.id,
        to: e.toAddress,
        subject: e.subject,
        status: e.status,
        verification: e.recipientVerification,
        company: e.companyId ? (getCompany(e.companyId)?.name ?? null) : null,
        updatedAt: e.updatedAt
      })),
      `${emails.length} Entwürfe${input.status ? ` im Status "${input.status}"` : ''}.`
    )
  }
})

const addAttachmentTool = defineTool({
  name: 'add_email_attachment',
  agent: AGENT,
  readOnly: false,
  description: 'Hängt eine vorhandene Datei an einen Entwurf. Die Datei muss auf diesem Rechner liegen.',
  schema: z.object({
    email_id: z.number().int(),
    path: z.string().describe('Vollständiger Pfad zur Datei.')
  }),
  async run(input) {
    const email = getEmail(input.email_id)
    if (!email) return fail(`Entwurf #${input.email_id} existiert nicht.`)
    if (email.status === 'gesendet') return fail('Der Entwurf wurde bereits versendet.')

    const path = resolve(input.path)
    let size: number
    try {
      const stat = statSync(path)
      if (!stat.isFile()) return fail(`${path} ist keine Datei.`)
      size = stat.size
    } catch {
      return fail(`Die Datei ${path} wurde nicht gefunden.`)
    }
    if (size > 20_000_000) return fail(`Die Datei ist ${Math.round(size / 1_000_000)} MB groß — das nehmen die meisten Server nicht an.`)

    addAttachment(input.email_id, { filename: basename(path), path, sizeBytes: size, contentType: null })
    return ok({ emailId: input.email_id, filename: basename(path), sizeBytes: size }, `${basename(path)} angehängt.`)
  }
})

const sendEmailTool = defineTool({
  name: 'send_email',
  agent: AGENT,
  readOnly: false,
  description:
    'BEANTRAGT den Versand eines Entwurfs. Dieses Werkzeug versendet NICHTS. ' +
    'Es legt eine Freigabeanfrage an; der Nutzer sieht danach Empfänger, Betreff und Text und entscheidet. ' +
    'Nach dem Aufruf dem Nutzer die Freigabefrage stellen und auf eine eindeutige Antwort warten. ' +
    'Niemals behaupten, die Mail sei gesendet.',
  schema: z.object({ email_id: z.number().int().describe('Der Entwurf, der versendet werden soll.') }),
  async run(input, ctx) {
    const result = requestSend(input.email_id, ctx.actor)
    if (!result.ok) return result
    const email = getEmail(input.email_id)
    return ok(
      {
        approvalId: result.data.approval.id,
        status: 'wartet_auf_freigabe',
        recipient: email?.toAddress,
        subject: email?.subject,
        question: `Versand an ${email?.toAddress} freigeben?`
      },
      `Freigabe angefragt. Es wurde noch nichts versendet.`
    )
  }
})

const sendBulkTool = defineTool({
  name: 'send_emails_bulk',
  agent: AGENT,
  readOnly: false,
  description:
    'BEANTRAGT den Versand mehrerer Entwürfe in einem Rutsch. Versendet ebenfalls NICHTS. ' +
    'Es entsteht eine einzige Freigabeanfrage, in der alle Empfänger aufgelistet sind.',
  schema: z.object({ email_ids: z.array(z.number().int()).min(1).max(200) }),
  async run(input, ctx) {
    const result = requestBulkSend(input.email_ids, ctx.actor)
    if (!result.ok) return result
    return ok(
      {
        approvalId: result.data.approval.id,
        count: result.data.approval.details.Anzahl,
        status: 'wartet_auf_freigabe'
      },
      result.note ?? 'Sammelfreigabe angefragt. Es wurde noch nichts versendet.'
    )
  }
})

const syncRepliesTool = defineTool({
  name: 'sync_email_replies',
  agent: AGENT,
  readOnly: false,
  description:
    'Liest den Posteingang und ordnet Antworten den Firmen zu. Aendert nur die eigene Datenbank, sendet nichts.',
  schema: z.object({ since_days: z.number().int().min(1).max(365).optional() }),
  async run(input, ctx) {
    ctx.say('Gleiche den Posteingang ab ...')
    return syncReplies(input.since_days ?? 30)
  }
})

const doNotContactTool = defineTool({
  name: 'set_do_not_contact',
  agent: AGENT,
  readOnly: false,
  description:
    'Trägt eine Adresse oder eine ganze Domain in die Sperrliste ein oder entfernt sie wieder. ' +
    'Gesperrte Empfänger können weder als Entwurf angelegt noch versendet werden.',
  schema: z.object({
    pattern: z.string().describe('E-Mail-Adresse oder Domain, z. B. "info@firma.de" oder "firma.de".'),
    action: z.enum(['sperren', 'freigeben']),
    reason: z.string().optional()
  }),
  async run(input) {
    const isDomain = !input.pattern.includes('@')
    if (input.action === 'sperren') {
      addToDoNotContact(input.pattern, isDomain ? 'domain' : 'adresse', input.reason)
      return ok({ pattern: input.pattern, blocked: true }, `${input.pattern} steht jetzt auf der Sperrliste.`)
    }
    const removed = removeFromDoNotContact(input.pattern)
    return ok(
      { pattern: input.pattern, blocked: false, removed },
      removed > 0 ? `${input.pattern} wurde von der Sperrliste genommen.` : `${input.pattern} stand nicht auf der Liste.`
    )
  }
})

export const mailTools: JarvisTool[] = [
  createEmailDraftTool,
  readEmailDraftTool,
  updateEmailDraftTool,
  listEmailDraftsTool,
  addAttachmentTool,
  sendEmailTool,
  sendBulkTool,
  syncRepliesTool,
  doNotContactTool
] as JarvisTool[]

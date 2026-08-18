/**
 * Kampagnen, E-Mail-Entwürfe, Kontakthistorie, Sperrliste und Versandprotokoll.
 */
import { getDb } from '../index'
import type {
  Campaign,
  EmailAttachment,
  EmailDraft,
  EmailStatus,
  InteractionHistoryEntry,
  VerificationStatus
} from '@shared/types'

const now = (): string => new Date().toISOString()

// ---------------------------------------------------------------------------
// Kampagnen
// ---------------------------------------------------------------------------

type CampaignRow = {
  id: number
  name: string
  service: string
  region: string
  radius_km: number | null
  target_count: number
  briefing: string | null
  status: string
  created_at: string
  updated_at: string
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    service: row.service,
    region: row.region,
    radiusKm: row.radius_km,
    targetCount: row.target_count,
    briefing: row.briefing,
    status: row.status as Campaign['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export interface CampaignInput {
  name: string
  service: string
  region: string
  radiusKm?: number | null
  targetCount?: number
  briefing?: string | null
}

export function createCampaign(input: CampaignInput): Campaign {
  const at = now()
  const res = getDb()
    .prepare(
      `INSERT INTO outreach_campaigns (name, service, region, radius_km, target_count, briefing, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      input.name,
      input.service,
      input.region,
      input.radiusKm ?? null,
      input.targetCount ?? 20,
      input.briefing ?? null,
      'entwurf',
      at,
      at
    )
  const campaign = getCampaign(res.lastInsertRowid)
  if (!campaign) throw new Error('Kampagne konnte nicht angelegt werden.')
  return campaign
}

export function getCampaign(id: number): Campaign | null {
  const row = getDb().prepare('SELECT * FROM outreach_campaigns WHERE id = ?').get<CampaignRow>(id)
  return row ? mapCampaign(row) : null
}

export function findCampaignByName(name: string): Campaign | null {
  const row = getDb()
    .prepare('SELECT * FROM outreach_campaigns WHERE lower(name) = lower(?) ORDER BY id DESC LIMIT 1')
    .get<CampaignRow>(name.trim())
  return row ? mapCampaign(row) : null
}

export function listCampaigns(): Campaign[] {
  return getDb()
    .prepare('SELECT * FROM outreach_campaigns ORDER BY updated_at DESC')
    .all<CampaignRow>()
    .map(mapCampaign)
}

export function setCampaignStatus(id: number, status: Campaign['status']): void {
  getDb()
    .prepare('UPDATE outreach_campaigns SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, now(), id)
}

// ---------------------------------------------------------------------------
// E-Mail-Entwürfe
// ---------------------------------------------------------------------------

type EmailRow = {
  id: number
  campaign_id: number | null
  company_id: number | null
  contact_id: number | null
  to_address: string
  to_name: string | null
  cc: string | null
  bcc: string | null
  subject: string
  body_text: string
  body_html: string | null
  status: string
  recipient_verification: string
  approval_id: number | null
  message_id: string | null
  thread_key: string | null
  error_message: string | null
  personalization_basis: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
}

function attachmentsFor(emailId: number): EmailAttachment[] {
  return getDb()
    .prepare('SELECT filename, path, size_bytes, content_type FROM email_attachments WHERE email_id = ?')
    .all<{ filename: string; path: string; size_bytes: number; content_type: string | null }>(emailId)
    .map((r) => ({
      filename: r.filename,
      path: r.path,
      sizeBytes: r.size_bytes,
      contentType: r.content_type
    }))
}

function mapEmail(row: EmailRow): EmailDraft {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    companyId: row.company_id,
    contactId: row.contact_id,
    toAddress: row.to_address,
    toName: row.to_name,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    status: row.status as EmailStatus,
    attachments: attachmentsFor(row.id),
    recipientVerification: row.recipient_verification as VerificationStatus,
    approvalId: row.approval_id,
    messageId: row.message_id,
    threadKey: row.thread_key,
    errorMessage: row.error_message,
    personalizationBasis: row.personalization_basis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at
  }
}

export interface EmailDraftInput {
  toAddress: string
  subject: string
  bodyText: string
  toName?: string | null
  cc?: string | null
  bcc?: string | null
  bodyHtml?: string | null
  campaignId?: number | null
  companyId?: number | null
  contactId?: number | null
  recipientVerification?: VerificationStatus
  personalizationBasis?: string | null
  threadKey?: string | null
}

export function createEmailDraft(input: EmailDraftInput): EmailDraft {
  const at = now()
  const res = getDb()
    .prepare(
      `INSERT INTO emails
        (campaign_id, company_id, contact_id, to_address, to_name, cc, bcc, subject, body_text, body_html,
         status, recipient_verification, personalization_basis, thread_key, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      input.campaignId ?? null,
      input.companyId ?? null,
      input.contactId ?? null,
      input.toAddress.trim(),
      input.toName ?? null,
      input.cc ?? null,
      input.bcc ?? null,
      input.subject,
      input.bodyText,
      input.bodyHtml ?? null,
      'entwurf',
      input.recipientVerification ?? 'NICHT_VERIFIZIERT',
      input.personalizationBasis ?? null,
      input.threadKey ?? null,
      at,
      at
    )
  const draft = getEmail(res.lastInsertRowid)
  if (!draft) throw new Error('Entwurf konnte nicht gespeichert werden.')
  return draft
}

export function getEmail(id: number): EmailDraft | null {
  const row = getDb().prepare('SELECT * FROM emails WHERE id = ?').get<EmailRow>(id)
  return row ? mapEmail(row) : null
}

export function listEmails(filter: { status?: string; campaignId?: number; companyId?: number } = {}): EmailDraft[] {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    where.push('status = ?')
    params.push(filter.status)
  }
  if (filter.campaignId !== undefined) {
    where.push('campaign_id = ?')
    params.push(filter.campaignId)
  }
  if (filter.companyId !== undefined) {
    where.push('company_id = ?')
    params.push(filter.companyId)
  }
  const sql = `SELECT * FROM emails ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT 1000`
  return getDb().prepare(sql).all<EmailRow>(...params).map(mapEmail)
}

export function updateEmailDraft(
  id: number,
  patch: Partial<Pick<EmailDraft, 'subject' | 'bodyText' | 'bodyHtml' | 'toAddress' | 'toName' | 'cc' | 'bcc' | 'personalizationBasis'>>
): EmailDraft | null {
  const columns: Record<string, string> = {
    subject: 'subject',
    bodyText: 'body_text',
    bodyHtml: 'body_html',
    toAddress: 'to_address',
    toName: 'to_name',
    cc: 'cc',
    bcc: 'bcc',
    personalizationBasis: 'personalization_basis'
  }
  const entries = Object.entries(patch).filter(([k, v]) => columns[k] && v !== undefined)
  if (entries.length > 0) {
    const set = entries.map(([k]) => `${columns[k]} = ?`).join(', ')
    getDb()
      .prepare(`UPDATE emails SET ${set}, updated_at = ? WHERE id = ?`)
      .run(...entries.map(([, v]) => v), now(), id)
  }
  return getEmail(id)
}

export function setEmailStatus(
  id: number,
  status: EmailStatus,
  extra: { approvalId?: number | null; messageId?: string | null; errorMessage?: string | null; sentAt?: string | null } = {}
): void {
  const db = getDb()
  db.prepare(
    `UPDATE emails
       SET status = ?,
           approval_id = COALESCE(?, approval_id),
           message_id = COALESCE(?, message_id),
           error_message = ?,
           sent_at = COALESCE(?, sent_at),
           updated_at = ?
     WHERE id = ?`
  ).run(
    status,
    extra.approvalId ?? null,
    extra.messageId ?? null,
    extra.errorMessage ?? null,
    extra.sentAt ?? null,
    now(),
    id
  )
}

export function setEmailThreadKey(id: number, threadKey: string): void {
  getDb().prepare('UPDATE emails SET thread_key = ?, updated_at = ? WHERE id = ?').run(threadKey, now(), id)
}

export function addAttachment(emailId: number, attachment: EmailAttachment): void {
  getDb()
    .prepare(
      'INSERT INTO email_attachments (email_id, filename, path, size_bytes, content_type) VALUES (?,?,?,?,?)'
    )
    .run(emailId, attachment.filename, attachment.path, attachment.sizeBytes, attachment.contentType ?? null)
}

/** Gab es zu dieser Firma schon eine gesendete Mail? */
export function lastSentEmailForCompany(companyId: number): EmailDraft | null {
  const row = getDb()
    .prepare(`SELECT * FROM emails WHERE company_id = ? AND status = 'gesendet' ORDER BY sent_at DESC LIMIT 1`)
    .get<EmailRow>(companyId)
  return row ? mapEmail(row) : null
}

/** Gibt es zu dieser Firma bereits einen offenen Entwurf? */
export function openDraftForCompany(companyId: number): EmailDraft | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM emails WHERE company_id = ? AND status IN ('entwurf','wartet_auf_freigabe','freigegeben')
       ORDER BY id DESC LIMIT 1`
    )
    .get<EmailRow>(companyId)
  return row ? mapEmail(row) : null
}

export function findEmailByThreadKey(threadKey: string): EmailDraft | null {
  const row = getDb()
    .prepare('SELECT * FROM emails WHERE thread_key = ? ORDER BY id DESC LIMIT 1')
    .get<EmailRow>(threadKey)
  return row ? mapEmail(row) : null
}

export function findEmailByMessageId(messageId: string): EmailDraft | null {
  const row = getDb()
    .prepare('SELECT * FROM emails WHERE message_id = ? ORDER BY id DESC LIMIT 1')
    .get<EmailRow>(messageId)
  return row ? mapEmail(row) : null
}

// ---------------------------------------------------------------------------
// Kontakthistorie
// ---------------------------------------------------------------------------

type HistoryRow = {
  id: number
  company_id: number
  contact_id: number | null
  email_id: number | null
  kind: string
  channel: string
  summary: string
  occurred_at: string
}

export function addHistory(entry: {
  companyId: number
  summary: string
  kind: InteractionHistoryEntry['kind']
  channel?: InteractionHistoryEntry['channel']
  contactId?: number | null
  emailId?: number | null
  occurredAt?: string
}): void {
  getDb()
    .prepare(
      `INSERT INTO interaction_history (company_id, contact_id, email_id, kind, channel, summary, occurred_at)
       VALUES (?,?,?,?,?,?,?)`
    )
    .run(
      entry.companyId,
      entry.contactId ?? null,
      entry.emailId ?? null,
      entry.kind,
      entry.channel ?? 'email',
      entry.summary,
      entry.occurredAt ?? now()
    )
}

export function listHistory(companyId: number): InteractionHistoryEntry[] {
  return getDb()
    .prepare('SELECT * FROM interaction_history WHERE company_id = ? ORDER BY occurred_at DESC')
    .all<HistoryRow>(companyId)
    .map((r) => ({
      id: r.id,
      companyId: r.company_id,
      contactId: r.contact_id,
      emailId: r.email_id,
      kind: r.kind as InteractionHistoryEntry['kind'],
      channel: r.channel as InteractionHistoryEntry['channel'],
      summary: r.summary,
      occurredAt: r.occurred_at
    }))
}

// ---------------------------------------------------------------------------
// Sperrliste
// ---------------------------------------------------------------------------

export function addToDoNotContact(pattern: string, kind: 'adresse' | 'domain', reason?: string): void {
  getDb()
    .prepare(
      `INSERT INTO do_not_contact (pattern, kind, reason, created_at) VALUES (?,?,?,?)
       ON CONFLICT(pattern) DO UPDATE SET reason = excluded.reason`
    )
    .run(pattern.trim().toLowerCase(), kind, reason ?? null, now())
}

export function removeFromDoNotContact(pattern: string): number {
  return getDb().prepare('DELETE FROM do_not_contact WHERE pattern = ?').run(pattern.trim().toLowerCase()).changes
}

export function listDoNotContact(): { pattern: string; kind: string; reason: string | null; createdAt: string }[] {
  return getDb()
    .prepare('SELECT pattern, kind, reason, created_at FROM do_not_contact ORDER BY created_at DESC')
    .all<{ pattern: string; kind: string; reason: string | null; created_at: string }>()
    .map((r) => ({ pattern: r.pattern, kind: r.kind, reason: r.reason, createdAt: r.created_at }))
}

/**
 * Prüft Adresse und Domain gegen die Sperrliste.
 * Rückgabe ist der Grund, oder null wenn nichts gesperrt ist.
 */
export function blockedReason(address: string): string | null {
  const addr = address.trim().toLowerCase()
  const domain = addr.split('@')[1] ?? ''
  const row = getDb()
    .prepare('SELECT pattern, reason FROM do_not_contact WHERE pattern = ? OR pattern = ?')
    .get<{ pattern: string; reason: string | null }>(addr, domain)
  if (!row) return null
  return row.reason ?? `Auf der Sperrliste: ${row.pattern}`
}

// ---------------------------------------------------------------------------
// Versandprotokoll (für Tageslimits)
// ---------------------------------------------------------------------------

export function logSend(entry: {
  emailId: number | null
  address: string
  transport: string
  ok: boolean
  detail?: string | null
}): void {
  getDb()
    .prepare('INSERT INTO send_log (email_id, address, sent_at, transport, ok, detail) VALUES (?,?,?,?,?,?)')
    .run(entry.emailId, entry.address, now(), entry.transport, entry.ok, entry.detail ?? null)
}

export function countSendsSince(isoTimestamp: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM send_log WHERE sent_at >= ? AND ok = 1')
    .get<{ n: number }>(isoTimestamp)
  return Number(row?.n ?? 0)
}

export function lastSendAt(): string | null {
  const row = getDb().prepare('SELECT sent_at FROM send_log WHERE ok = 1 ORDER BY sent_at DESC LIMIT 1').get<{
    sent_at: string
  }>()
  return row?.sent_at ?? null
}

/**
 * Firmen, Ansprechpartner, Adressen und Quellen.
 *
 * Alle Schreibzugriffe laufen hier durch, damit Dubletten an einer Stelle
 * abgefangen werden — die Domain ist der Schlüssel, nicht der Firmenname.
 */
import { getDb } from '../index'
import type {
  Company,
  Contact,
  EmailAddress,
  OutreachStatus,
  Source,
  VerificationStatus
} from '@shared/types'

const now = (): string => new Date().toISOString()

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

/** Normalisiert eine Website auf die reine Domain ohne www. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let value = input.trim().toLowerCase()
  if (!value) return null
  if (!/^https?:\/\//.test(value)) value = `https://${value}`
  try {
    const host = new URL(value).hostname.replace(/^www\./, '')
    return host || null
  } catch {
    return null
  }
}

type CompanyRow = {
  id: number
  name: string
  website: string | null
  domain: string | null
  street: string | null
  postal_code: string | null
  city: string | null
  country: string | null
  industry: string | null
  description: string | null
  acquisition_reason: string | null
  acquisition_basis: string | null
  size_hint: string | null
  phone: string | null
  contact_page_url: string | null
  imprint_url: string | null
  status: string
  do_not_contact: number
  notes: string | null
  researched_at: string | null
  last_contacted_at: string | null
  created_at: string
  updated_at: string
}

function mapCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    domain: row.domain,
    street: row.street,
    postalCode: row.postal_code,
    city: row.city,
    country: row.country,
    industry: row.industry,
    description: row.description,
    acquisitionReason: row.acquisition_reason,
    acquisitionBasis: row.acquisition_basis,
    sizeHint: row.size_hint,
    phone: row.phone,
    contactPageUrl: row.contact_page_url,
    imprintUrl: row.imprint_url,
    status: row.status as OutreachStatus,
    doNotContact: row.do_not_contact === 1,
    notes: row.notes,
    researchedAt: row.researched_at,
    lastContactedAt: row.last_contacted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

// ---------------------------------------------------------------------------
// Quellen
// ---------------------------------------------------------------------------

export interface NewSource {
  url: string
  kind: string
  title?: string | null
  contentHash?: string | null
  excerpt?: string | null
}

export function insertSource(input: NewSource): Source {
  const db = getDb()
  const at = now()
  const res = db
    .prepare(
      `INSERT INTO sources (url, kind, title, fetched_at, content_hash, excerpt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.url, input.kind, input.title ?? null, at, input.contentHash ?? null, input.excerpt ?? null)

  return {
    id: res.lastInsertRowid,
    url: input.url,
    kind: input.kind,
    title: input.title ?? null,
    fetchedAt: at,
    contentHash: input.contentHash ?? null,
    excerpt: input.excerpt ?? null
  }
}

export function getSource(id: number): Source | null {
  const row = getDb()
    .prepare('SELECT * FROM sources WHERE id = ?')
    .get<{
      id: number
      url: string
      kind: string
      title: string | null
      fetched_at: string
      content_hash: string | null
      excerpt: string | null
    }>(id)
  if (!row) return null
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    title: row.title,
    fetchedAt: row.fetched_at,
    contentHash: row.content_hash,
    excerpt: row.excerpt
  }
}

// ---------------------------------------------------------------------------
// Firmen
// ---------------------------------------------------------------------------

export interface CompanyInput {
  name: string
  website?: string | null
  street?: string | null
  postalCode?: string | null
  city?: string | null
  country?: string | null
  industry?: string | null
  description?: string | null
  acquisitionReason?: string | null
  acquisitionBasis?: string | null
  sizeHint?: string | null
  phone?: string | null
  contactPageUrl?: string | null
  imprintUrl?: string | null
  notes?: string | null
}

export function findCompanyByDomain(domain: string): Company | null {
  const row = getDb().prepare('SELECT * FROM companies WHERE domain = ?').get<CompanyRow>(domain)
  return row ? mapCompany(row) : null
}

export function findCompanyByName(name: string): Company | null {
  const row = getDb()
    .prepare('SELECT * FROM companies WHERE lower(name) = lower(?) ORDER BY id LIMIT 1')
    .get<CompanyRow>(name.trim())
  return row ? mapCompany(row) : null
}

export function getCompany(id: number): Company | null {
  const row = getDb().prepare('SELECT * FROM companies WHERE id = ?').get<CompanyRow>(id)
  return row ? mapCompany(row) : null
}

/**
 * Legt eine Firma an oder ergänzt eine vorhandene.
 *
 * Bestehende Werte werden nicht überschrieben, sondern nur gefüllt, wenn sie
 * leer sind. So kann eine zweite Recherche Lücken schließen, ohne bereits
 * geprüfte Angaben zu überschreiben.
 */
export function upsertCompany(input: CompanyInput): { company: Company; created: boolean } {
  const db = getDb()
  const domain = normalizeDomain(input.website)
  const existing = domain ? findCompanyByDomain(domain) : findCompanyByName(input.name)

  if (existing) {
    const merged: Record<string, unknown> = {}
    const fill = (column: string, current: unknown, next: unknown): void => {
      if ((current === null || current === '') && next !== undefined && next !== null && next !== '') {
        merged[column] = next
      }
    }
    fill('website', existing.website, input.website)
    fill('street', existing.street, input.street)
    fill('postal_code', existing.postalCode, input.postalCode)
    fill('city', existing.city, input.city)
    fill('country', existing.country, input.country)
    fill('industry', existing.industry, input.industry)
    fill('description', existing.description, input.description)
    fill('acquisition_reason', existing.acquisitionReason, input.acquisitionReason)
    fill('acquisition_basis', existing.acquisitionBasis, input.acquisitionBasis)
    fill('size_hint', existing.sizeHint, input.sizeHint)
    fill('phone', existing.phone, input.phone)
    fill('contact_page_url', existing.contactPageUrl, input.contactPageUrl)
    fill('imprint_url', existing.imprintUrl, input.imprintUrl)
    fill('notes', existing.notes, input.notes)
    if (!existing.domain && domain) merged['domain'] = domain

    const keys = Object.keys(merged)
    if (keys.length > 0) {
      const set = keys.map((k) => `${k} = ?`).join(', ')
      db.prepare(`UPDATE companies SET ${set}, updated_at = ? WHERE id = ?`).run(
        ...keys.map((k) => merged[k]),
        now(),
        existing.id
      )
    }
    const company = getCompany(existing.id)
    if (!company) throw new Error(`Firma ${existing.id} verschwand während der Aktualisierung.`)
    return { company, created: false }
  }

  const at = now()
  const res = db
    .prepare(
      `INSERT INTO companies
        (name, website, domain, street, postal_code, city, country, industry, description,
         acquisition_reason, acquisition_basis, size_hint, phone, contact_page_url, imprint_url,
         status, do_not_contact, notes, researched_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`
    )
    .run(
      input.name.trim(),
      input.website ?? null,
      domain,
      input.street ?? null,
      input.postalCode ?? null,
      input.city ?? null,
      input.country ?? 'DE',
      input.industry ?? null,
      input.description ?? null,
      input.acquisitionReason ?? null,
      input.acquisitionBasis ?? null,
      input.sizeHint ?? null,
      input.phone ?? null,
      input.contactPageUrl ?? null,
      input.imprintUrl ?? null,
      'neu',
      input.notes ?? null,
      at,
      at,
      at
    )

  const company = getCompany(res.lastInsertRowid)
  if (!company) throw new Error('Firma konnte nicht angelegt werden.')
  return { company, created: true }
}

export function updateCompanyStatus(id: number, status: OutreachStatus): void {
  getDb().prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id)
}

export function updateCompanyFields(
  id: number,
  patch: Partial<Record<keyof CompanyInput, unknown>>
): void {
  const columns: Record<string, string> = {
    name: 'name',
    website: 'website',
    street: 'street',
    postalCode: 'postal_code',
    city: 'city',
    country: 'country',
    industry: 'industry',
    description: 'description',
    acquisitionReason: 'acquisition_reason',
    acquisitionBasis: 'acquisition_basis',
    sizeHint: 'size_hint',
    phone: 'phone',
    contactPageUrl: 'contact_page_url',
    imprintUrl: 'imprint_url',
    notes: 'notes'
  }
  const entries = Object.entries(patch).filter(([k, v]) => columns[k] !== undefined && v !== undefined)
  if (entries.length === 0) return
  const set = entries.map(([k]) => `${columns[k]} = ?`).join(', ')
  getDb()
    .prepare(`UPDATE companies SET ${set}, updated_at = ? WHERE id = ?`)
    .run(...entries.map(([, v]) => v), now(), id)
}

export function markResearched(id: number): void {
  const at = now()
  getDb().prepare('UPDATE companies SET researched_at = ?, updated_at = ? WHERE id = ?').run(at, at, id)
}

export function markContacted(id: number, at: string = now()): void {
  getDb()
    .prepare('UPDATE companies SET last_contacted_at = ?, updated_at = ? WHERE id = ?')
    .run(at, now(), id)
}

export function setDoNotContact(id: number, value: boolean): void {
  getDb()
    .prepare('UPDATE companies SET do_not_contact = ?, updated_at = ? WHERE id = ?')
    .run(value, now(), id)
}

export function listCompanies(search?: string, limit = 500): Company[] {
  const db = getDb()
  const rows = search
    ? db
        .prepare(
          `SELECT * FROM companies
           WHERE name LIKE ? OR city LIKE ? OR industry LIKE ? OR domain LIKE ?
           ORDER BY updated_at DESC LIMIT ?`
        )
        .all<CompanyRow>(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, limit)
    : db.prepare('SELECT * FROM companies ORDER BY updated_at DESC LIMIT ?').all<CompanyRow>(limit)
  return rows.map(mapCompany)
}

export function deleteCompany(id: number): number {
  return getDb().prepare('DELETE FROM companies WHERE id = ?').run(id).changes
}

// ---------------------------------------------------------------------------
// Ansprechpartner
// ---------------------------------------------------------------------------

type ContactRow = {
  id: number
  company_id: number
  first_name: string | null
  last_name: string | null
  full_name: string
  position: string | null
  phone: string | null
  source_id: number | null
  created_at: string
}

function mapContact(row: ContactRow): Contact {
  return {
    id: row.id,
    companyId: row.company_id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name,
    position: row.position,
    phone: row.phone,
    sourceId: row.source_id,
    createdAt: row.created_at
  }
}

export interface ContactInput {
  companyId: number
  fullName: string
  firstName?: string | null
  lastName?: string | null
  position?: string | null
  phone?: string | null
  sourceId?: number | null
}

export function upsertContact(input: ContactInput): Contact {
  const db = getDb()
  const existing = db
    .prepare('SELECT * FROM contacts WHERE company_id = ? AND lower(full_name) = lower(?)')
    .get<ContactRow>(input.companyId, input.fullName.trim())
  if (existing) {
    if (input.position && !existing.position) {
      db.prepare('UPDATE contacts SET position = ? WHERE id = ?').run(input.position, existing.id)
      existing.position = input.position
    }
    return mapContact(existing)
  }
  const res = db
    .prepare(
      `INSERT INTO contacts (company_id, first_name, last_name, full_name, position, phone, source_id, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(
      input.companyId,
      input.firstName ?? null,
      input.lastName ?? null,
      input.fullName.trim(),
      input.position ?? null,
      input.phone ?? null,
      input.sourceId ?? null,
      now()
    )
  const row = db.prepare('SELECT * FROM contacts WHERE id = ?').get<ContactRow>(res.lastInsertRowid)
  if (!row) throw new Error('Ansprechpartner konnte nicht angelegt werden.')
  return mapContact(row)
}

export function listContacts(companyId: number): Contact[] {
  return getDb()
    .prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY id')
    .all<ContactRow>(companyId)
    .map(mapContact)
}

// ---------------------------------------------------------------------------
// E-Mail-Adressen
// ---------------------------------------------------------------------------

type EmailAddressRow = {
  id: number
  company_id: number
  contact_id: number | null
  address: string
  status: string
  status_reason: string
  source_id: number | null
  is_primary: number
  mx_checked: number
  mx_ok: number | null
  created_at: string
}

function mapEmailAddress(row: EmailAddressRow): EmailAddress {
  return {
    id: row.id,
    companyId: row.company_id,
    contactId: row.contact_id,
    address: row.address,
    status: row.status as VerificationStatus,
    statusReason: row.status_reason,
    sourceId: row.source_id,
    isPrimary: row.is_primary === 1,
    mxChecked: row.mx_checked === 1,
    mxOk: row.mx_ok === null ? null : row.mx_ok === 1,
    createdAt: row.created_at
  }
}

export interface EmailAddressInput {
  companyId: number
  address: string
  status: VerificationStatus
  statusReason: string
  contactId?: number | null
  sourceId?: number | null
  isPrimary?: boolean
  mxChecked?: boolean
  mxOk?: boolean | null
}

const STATUS_RANK: Record<VerificationStatus, number> = {
  NICHT_VERIFIZIERT: 0,
  WAHRSCHEINLICH: 1,
  VERIFIZIERT: 2
}

/**
 * Speichert eine Adresse. Ein bereits gespeicherter, höherwertiger Status
 * wird nicht herabgestuft — sonst könnte ein schlechterer Treffer einen
 * guten überschreiben.
 */
export function upsertEmailAddress(input: EmailAddressInput): EmailAddress {
  const db = getDb()
  const address = input.address.trim().toLowerCase()
  const existing = db
    .prepare('SELECT * FROM email_addresses WHERE company_id = ? AND address = ?')
    .get<EmailAddressRow>(input.companyId, address)

  if (existing) {
    const currentRank = STATUS_RANK[existing.status as VerificationStatus] ?? 0
    const nextRank = STATUS_RANK[input.status]
    if (nextRank > currentRank) {
      db.prepare(
        `UPDATE email_addresses SET status = ?, status_reason = ?, source_id = COALESCE(?, source_id) WHERE id = ?`
      ).run(input.status, input.statusReason, input.sourceId ?? null, existing.id)
      existing.status = input.status
      existing.status_reason = input.statusReason
    }
    if (input.mxChecked) {
      db.prepare('UPDATE email_addresses SET mx_checked = 1, mx_ok = ? WHERE id = ?').run(
        input.mxOk ?? null,
        existing.id
      )
      existing.mx_checked = 1
      existing.mx_ok = input.mxOk === null || input.mxOk === undefined ? null : input.mxOk ? 1 : 0
    }
    return mapEmailAddress(existing)
  }

  const res = db
    .prepare(
      `INSERT INTO email_addresses
        (company_id, contact_id, address, status, status_reason, source_id, is_primary, mx_checked, mx_ok, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      input.companyId,
      input.contactId ?? null,
      address,
      input.status,
      input.statusReason,
      input.sourceId ?? null,
      input.isPrimary ?? false,
      input.mxChecked ?? false,
      input.mxOk === undefined ? null : input.mxOk,
      now()
    )
  const row = db.prepare('SELECT * FROM email_addresses WHERE id = ?').get<EmailAddressRow>(res.lastInsertRowid)
  if (!row) throw new Error('E-Mail-Adresse konnte nicht gespeichert werden.')
  return mapEmailAddress(row)
}

export function listEmailAddresses(companyId: number): EmailAddress[] {
  return getDb()
    .prepare(
      `SELECT * FROM email_addresses WHERE company_id = ?
       ORDER BY is_primary DESC,
         CASE status WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END,
         id`
    )
    .all<EmailAddressRow>(companyId)
    .map(mapEmailAddress)
}

/** Beste Adresse einer Firma — oder null, wenn nichts Brauchbares da ist. */
export function bestEmailAddress(companyId: number): EmailAddress | null {
  const all = listEmailAddresses(companyId)
  return all[0] ?? null
}

export function findCompanyIdByEmail(address: string): number | null {
  const row = getDb()
    .prepare('SELECT company_id FROM email_addresses WHERE address = ? ORDER BY id LIMIT 1')
    .get<{ company_id: number }>(address.trim().toLowerCase())
  return row?.company_id ?? null
}

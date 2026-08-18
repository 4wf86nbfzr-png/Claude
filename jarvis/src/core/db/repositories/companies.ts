import type { Database } from '../database.js';
import { nowIso } from '../../util/id.js';
import type {
  CompanyDossier,
  CompanyRecord,
  CompanyStatus,
  ContactRecord,
  EmailAddressRecord,
  SendDeskFilterRow,
  SourceRef,
  VerificationStatus,
} from './row-types.js';

interface CompanyRow {
  id: number;
  name: string;
  website: string | null;
  domain: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  industry: string | null;
  description: string | null;
  phone: string | null;
  contact_page_url: string | null;
  imprint_url: string | null;
  status: string;
  outreach_rationale: string | null;
  do_not_contact: number;
  dnc_reason: string | null;
  last_contact_at: string | null;
  researched_at: string | null;
  created_at: string;
  updated_at: string;
}

function toCompany(row: CompanyRow): CompanyRecord {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    domain: row.domain,
    city: row.city,
    region: row.region,
    country: row.country,
    industry: row.industry,
    description: row.description,
    phone: row.phone,
    contactPageUrl: row.contact_page_url,
    imprintUrl: row.imprint_url,
    status: row.status as CompanyStatus,
    outreachRationale: row.outreach_rationale,
    doNotContact: row.do_not_contact === 1,
    doNotContactReason: row.dnc_reason,
    lastContactAt: row.last_contact_at,
    researchedAt: row.researched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CompanyInput {
  name: string;
  website?: string | null;
  domain?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  industry?: string | null;
  description?: string | null;
  phone?: string | null;
  contactPageUrl?: string | null;
  imprintUrl?: string | null;
  outreachRationale?: string | null;
}

export class CompanyRepository {
  constructor(private readonly db: Database) {}

  /**
   * Inserts a company or returns the existing one. Identity is the registrable
   * domain when known, otherwise the lower-cased name — matching the unique
   * indexes in the schema so duplicates cannot enter the database at all.
   */
  upsert(input: CompanyInput): { company: CompanyRecord; created: boolean } {
    const domain = input.domain?.toLowerCase() ?? null;
    const existing = domain
      ? this.findByDomain(domain)
      : this.findByName(input.name);

    const at = nowIso();
    if (existing) {
      // Only fill gaps — never overwrite a value a human may have corrected.
      this.db
        .prepare(
          `UPDATE companies SET
             website = COALESCE(website, ?),
             city = COALESCE(city, ?),
             region = COALESCE(region, ?),
             country = COALESCE(country, ?),
             industry = COALESCE(industry, ?),
             description = COALESCE(description, ?),
             phone = COALESCE(phone, ?),
             contact_page_url = COALESCE(contact_page_url, ?),
             imprint_url = COALESCE(imprint_url, ?),
             outreach_rationale = COALESCE(?, outreach_rationale),
             updated_at = ?
           WHERE id = ?`,
        )
        .run(
          input.website ?? null,
          input.city ?? null,
          input.region ?? null,
          input.country ?? null,
          input.industry ?? null,
          input.description ?? null,
          input.phone ?? null,
          input.contactPageUrl ?? null,
          input.imprintUrl ?? null,
          input.outreachRationale ?? null,
          at,
          existing.id,
        );
      return { company: this.get(existing.id)!, created: false };
    }

    const result = this.db
      .prepare(
        `INSERT INTO companies
           (name, website, domain, city, region, country, industry, description,
            phone, contact_page_url, imprint_url, status, outreach_rationale,
            created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.name.trim(),
        input.website ?? null,
        domain,
        input.city ?? null,
        input.region ?? null,
        input.country ?? null,
        input.industry ?? null,
        input.description ?? null,
        input.phone ?? null,
        input.contactPageUrl ?? null,
        input.imprintUrl ?? null,
        'Neu',
        input.outreachRationale ?? null,
        at,
        at,
      );
    return { company: this.get(result.lastInsertRowid)!, created: true };
  }

  get(id: number): CompanyRecord | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get<CompanyRow>(id);
    return row ? toCompany(row) : null;
  }

  findByDomain(domain: string): CompanyRecord | null {
    const row = this.db
      .prepare('SELECT * FROM companies WHERE domain = ?')
      .get<CompanyRow>(domain.toLowerCase());
    return row ? toCompany(row) : null;
  }

  findByName(name: string): CompanyRecord | null {
    const row = this.db
      .prepare('SELECT * FROM companies WHERE lower(name) = ?')
      .get<CompanyRow>(name.trim().toLowerCase());
    return row ? toCompany(row) : null;
  }

  search(term: string, limit = 20): CompanyRecord[] {
    const like = `%${term.trim().toLowerCase()}%`;
    return this.db
      .prepare(
        `SELECT * FROM companies
          WHERE lower(name) LIKE ? OR lower(COALESCE(domain,'')) LIKE ?
          ORDER BY updated_at DESC LIMIT ?`,
      )
      .all<CompanyRow>(like, like, limit)
      .map(toCompany);
  }

  list(limit = 200): CompanyRecord[] {
    return this.db
      .prepare('SELECT * FROM companies ORDER BY updated_at DESC LIMIT ?')
      .all<CompanyRow>(limit)
      .map(toCompany);
  }

  setStatus(id: number, status: CompanyStatus): void {
    this.db
      .prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id);
  }

  setRationale(id: number, rationale: string): void {
    this.db
      .prepare('UPDATE companies SET outreach_rationale = ?, updated_at = ? WHERE id = ?')
      .run(rationale, nowIso(), id);
  }

  markResearched(id: number): void {
    const at = nowIso();
    this.db
      .prepare('UPDATE companies SET researched_at = ?, updated_at = ? WHERE id = ?')
      .run(at, at, id);
  }

  markContacted(id: number, at = nowIso()): void {
    this.db
      .prepare('UPDATE companies SET last_contact_at = ?, updated_at = ? WHERE id = ?')
      .run(at, at, id);
  }

  setDoNotContact(id: number, value: boolean, reason?: string): void {
    this.db
      .prepare('UPDATE companies SET do_not_contact = ?, dnc_reason = ?, updated_at = ? WHERE id = ?')
      .run(value ? 1 : 0, reason ?? null, nowIso(), id);
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM companies WHERE id = ?').run(id).changes > 0;
  }

  update(id: number, patch: Partial<CompanyInput>): CompanyRecord | null {
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    const map: Record<string, string> = {
      name: 'name',
      website: 'website',
      domain: 'domain',
      city: 'city',
      region: 'region',
      country: 'country',
      industry: 'industry',
      description: 'description',
      phone: 'phone',
      contactPageUrl: 'contact_page_url',
      imprintUrl: 'imprint_url',
      outreachRationale: 'outreach_rationale',
    };
    for (const [key, column] of Object.entries(map)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value as string | null);
      }
    }
    if (fields.length === 0) return this.get(id);
    fields.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE companies SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.get(id);
  }

  /* ---------------------------------------------------------------- */
  /* Contacts                                                          */
  /* ---------------------------------------------------------------- */

  addContact(input: {
    companyId: number;
    fullName: string;
    role?: string | null;
    phone?: string | null;
    sourceUrl?: string | null;
  }): ContactRecord {
    const at = nowIso();
    this.db
      .prepare(
        `INSERT INTO contacts (company_id, full_name, role, phone, source_url, created_at)
         VALUES (?,?,?,?,?,?)
         ON CONFLICT(company_id, lower(full_name)) DO UPDATE SET
           role = COALESCE(excluded.role, contacts.role),
           phone = COALESCE(excluded.phone, contacts.phone),
           source_url = COALESCE(excluded.source_url, contacts.source_url)`,
      )
      .run(
        input.companyId,
        input.fullName.trim(),
        input.role ?? null,
        input.phone ?? null,
        input.sourceUrl ?? null,
        at,
      );
    const row = this.db
      .prepare('SELECT * FROM contacts WHERE company_id = ? AND lower(full_name) = ?')
      .get<{
        id: number;
        company_id: number;
        full_name: string;
        role: string | null;
        phone: string | null;
        source_url: string | null;
        created_at: string;
      }>(input.companyId, input.fullName.trim().toLowerCase())!;
    return {
      id: row.id,
      companyId: row.company_id,
      fullName: row.full_name,
      role: row.role,
      phone: row.phone,
      sourceUrl: row.source_url,
      createdAt: row.created_at,
    };
  }

  contacts(companyId: number): ContactRecord[] {
    return this.db
      .prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY id')
      .all<{
        id: number;
        company_id: number;
        full_name: string;
        role: string | null;
        phone: string | null;
        source_url: string | null;
        created_at: string;
      }>(companyId)
      .map((row) => ({
        id: row.id,
        companyId: row.company_id,
        fullName: row.full_name,
        role: row.role,
        phone: row.phone,
        sourceUrl: row.source_url,
        createdAt: row.created_at,
      }));
  }

  /* ---------------------------------------------------------------- */
  /* E-mail addresses                                                  */
  /* ---------------------------------------------------------------- */

  addEmailAddress(input: {
    companyId: number;
    contactId?: number | null;
    address: string;
    kind?: 'general' | 'person' | 'department';
    status: VerificationStatus;
    reason: string;
    sourceUrl?: string | null;
    mxChecked?: boolean;
    mxOk?: boolean | null;
  }): EmailAddressRecord {
    const address = input.address.trim();
    const at = nowIso();
    this.db
      .prepare(
        `INSERT INTO email_addresses
           (company_id, contact_id, address, kind, status, reason, source_url, mx_checked, mx_ok, found_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(company_id, lower(address)) DO UPDATE SET
           status = excluded.status,
           reason = excluded.reason,
           source_url = COALESCE(excluded.source_url, email_addresses.source_url),
           contact_id = COALESCE(excluded.contact_id, email_addresses.contact_id),
           mx_checked = excluded.mx_checked,
           mx_ok = excluded.mx_ok`,
      )
      .run(
        input.companyId,
        input.contactId ?? null,
        address,
        input.kind ?? 'general',
        input.status,
        input.reason,
        input.sourceUrl ?? null,
        input.mxChecked ? 1 : 0,
        input.mxOk === null || input.mxOk === undefined ? null : input.mxOk ? 1 : 0,
        at,
      );
    return this.emailAddresses(input.companyId).find(
      (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
    )!;
  }

  emailAddresses(companyId: number): EmailAddressRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM email_addresses WHERE company_id = ?
         ORDER BY CASE status
           WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END, id`,
      )
      .all<{
        id: number;
        company_id: number;
        contact_id: number | null;
        address: string;
        kind: string;
        status: string;
        reason: string;
        source_url: string | null;
        mx_checked: number;
        mx_ok: number | null;
        found_at: string;
      }>(companyId)
      .map((row) => ({
        id: row.id,
        companyId: row.company_id,
        contactId: row.contact_id,
        address: row.address,
        kind: row.kind as EmailAddressRecord['kind'],
        status: row.status as VerificationStatus,
        reason: row.reason,
        sourceUrl: row.source_url,
        foundAt: row.found_at,
        mxChecked: row.mx_checked === 1,
        mxOk: row.mx_ok === null ? null : row.mx_ok === 1,
      }));
  }

  /** The address that may actually be used for sending, or null. */
  bestEmailAddress(companyId: number, requireVerified: boolean): EmailAddressRecord | null {
    const all = this.emailAddresses(companyId);
    const usable = all.filter((candidate) =>
      requireVerified
        ? candidate.status === 'VERIFIZIERT'
        : candidate.status !== 'NICHT_VERIFIZIERT',
    );
    return usable[0] ?? null;
  }

  /* ---------------------------------------------------------------- */
  /* Sources                                                           */
  /* ---------------------------------------------------------------- */

  addSource(companyId: number, source: SourceRef, field = ''): number {
    const existing = this.db
      .prepare('SELECT id FROM sources WHERE url = ? AND kind = ?')
      .get<{ id: number }>(source.url, source.kind);
    const sourceId =
      existing?.id ??
      this.db
        .prepare('INSERT INTO sources (url, kind, title, excerpt, retrieved_at) VALUES (?,?,?,?,?)')
        .run(source.url, source.kind, source.title ?? null, source.excerpt ?? null, source.retrievedAt)
        .lastInsertRowid;
    this.db
      .prepare(
        'INSERT OR IGNORE INTO company_sources (company_id, source_id, field) VALUES (?,?,?)',
      )
      .run(companyId, sourceId, field);
    return sourceId;
  }

  sources(companyId: number): SourceRef[] {
    return this.db
      .prepare(
        `SELECT s.* FROM sources s
           JOIN company_sources cs ON cs.source_id = s.id
          WHERE cs.company_id = ?
          GROUP BY s.id
          ORDER BY s.retrieved_at DESC`,
      )
      .all<{
        id: number;
        url: string;
        kind: string;
        title: string | null;
        excerpt: string | null;
        retrieved_at: string;
      }>(companyId)
      .map((row) => ({
        id: row.id,
        url: row.url,
        kind: row.kind,
        title: row.title ?? undefined,
        excerpt: row.excerpt ?? undefined,
        retrievedAt: row.retrieved_at,
      }));
  }

  dossier(companyId: number): CompanyDossier | null {
    const company = this.get(companyId);
    if (!company) return null;
    return {
      company,
      contacts: this.contacts(companyId),
      emails: this.emailAddresses(companyId),
      sources: this.sources(companyId),
    };
  }

  /* ---------------------------------------------------------------- */
  /* Suppression list                                                  */
  /* ---------------------------------------------------------------- */

  suppress(pattern: string, kind: 'address' | 'domain', reason?: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO suppression_list (pattern, kind, reason, created_at) VALUES (?,?,?,?)',
      )
      .run(pattern.trim().toLowerCase(), kind, reason ?? null, nowIso());
  }

  unsuppress(pattern: string): void {
    this.db
      .prepare('DELETE FROM suppression_list WHERE lower(pattern) = ?')
      .run(pattern.trim().toLowerCase());
  }

  isSuppressed(address: string): { suppressed: boolean; reason?: string } {
    const normalized = address.trim().toLowerCase();
    const domain = normalized.split('@')[1] ?? '';
    const row = this.db
      .prepare(
        `SELECT reason FROM suppression_list
          WHERE (kind = 'address' AND lower(pattern) = ?)
             OR (kind = 'domain' AND lower(pattern) = ?)
          LIMIT 1`,
      )
      .get<{ reason: string | null }>(normalized, domain);
    if (!row) return { suppressed: false };
    return { suppressed: true, reason: row.reason ?? 'Auf der Sperrliste' };
  }

  suppressionList(): Array<{ pattern: string; kind: string; reason: string | null; createdAt: string }> {
    return this.db
      .prepare('SELECT pattern, kind, reason, created_at FROM suppression_list ORDER BY created_at DESC')
      .all<{ pattern: string; kind: string; reason: string | null; created_at: string }>()
      .map((row) => ({
        pattern: row.pattern,
        kind: row.kind,
        reason: row.reason,
        createdAt: row.created_at,
      }));
  }

  /* ---------------------------------------------------------------- */
  /* Send desk                                                         */
  /* ---------------------------------------------------------------- */

  sendDeskRows(filter: {
    campaignId?: number;
    mailStatus?: string;
    onlyReadyForApproval?: boolean;
    search?: string;
  }): SendDeskFilterRow[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];

    if (filter.campaignId !== undefined) {
      clauses.push('e.campaign_id = ?');
      params.push(filter.campaignId);
    }
    if (filter.mailStatus) {
      clauses.push('e.status = ?');
      params.push(filter.mailStatus);
    }
    if (filter.onlyReadyForApproval) {
      clauses.push("e.status IN ('entwurf','wartet_auf_freigabe')");
    }
    if (filter.search) {
      clauses.push('lower(c.name) LIKE ?');
      params.push(`%${filter.search.toLowerCase()}%`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

    // The newest e-mail per company wins; companies without a draft still show.
    return this.db
      .prepare(
        `SELECT
            c.id            AS company_id,
            c.name          AS company,
            c.status        AS company_status,
            c.outreach_rationale AS rationale,
            c.last_contact_at    AS last_contact_at,
            c.do_not_contact     AS do_not_contact,
            ct.full_name    AS contact,
            ea.address      AS email,
            ea.status       AS email_status,
            ea.source_url   AS source,
            e.id            AS email_id,
            e.status        AS mail_status,
            a.status        AS approval_status
          FROM companies c
          LEFT JOIN (
            SELECT * FROM email_addresses ea1
             WHERE ea1.id = (
               SELECT id FROM email_addresses ea2
                WHERE ea2.company_id = ea1.company_id
                ORDER BY CASE ea2.status
                  WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END, ea2.id
                LIMIT 1)
          ) ea ON ea.company_id = c.id
          LEFT JOIN contacts ct ON ct.id = ea.contact_id
          LEFT JOIN (
            SELECT * FROM emails e1
             WHERE e1.id = (
               SELECT id FROM emails e2 WHERE e2.company_id = e1.company_id
                ORDER BY e2.id DESC LIMIT 1)
          ) e ON e.company_id = c.id
          LEFT JOIN approvals a ON a.subject = 'email:' || e.id AND a.status = 'offen'
          ${where}
          ORDER BY c.updated_at DESC
          LIMIT 500`,
      )
      .all<SendDeskFilterRow>(...params);
  }
}

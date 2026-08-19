import type { Db } from '../database.js';
import {
  type CompanyFactRow,
  type CompanyRow,
  type ContactRow,
  type EmailAddressRow,
  type FactKind,
  type SourceKind,
  type SourceRow,
  type VerificationStatus,
} from '../schema.js';
import { companySlug, domainOfUrl, newId, nowIso, registrableDomain } from '../../util/text.js';

export interface CompanyInput {
  name: string;
  website?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  industry?: string | null;
  sizeHint?: string | null;
  description?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface SourceInput {
  url: string;
  kind: SourceKind;
  title?: string | null;
  httpStatus?: number | null;
  snippet?: string | null;
  contentHash?: string | null;
  fetchedAt?: string;
}

/**
 * Firmen, Ansprechpartner, Adressen und Quellen.
 *
 * Die Dublettenpruefung sitzt bewusst hier und nicht im Agenten: `upsert`
 * greift ueber den normalisierten Namen bzw. die Domain, damit dieselbe Firma
 * nicht durch zwei Recherchelaeufe doppelt entsteht.
 */
export class CompanyRepo {
  constructor(private readonly db: Db) {}

  // --- Quellen ------------------------------------------------------------

  addSource(input: SourceInput): SourceRow {
    const row: SourceRow = {
      id: newId('src'),
      url: input.url,
      title: input.title ?? null,
      kind: input.kind,
      http_status: input.httpStatus ?? null,
      fetched_at: input.fetchedAt ?? nowIso(),
      snippet: input.snippet ?? null,
      content_hash: input.contentHash ?? null,
    };
    this.db
      .prepare(
        `INSERT INTO sources (id, url, title, kind, http_status, fetched_at, snippet, content_hash)
         VALUES (@id, @url, @title, @kind, @http_status, @fetched_at, @snippet, @content_hash)`,
      )
      .run(row);
    return row;
  }

  getSource(id: string): SourceRow | undefined {
    return this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id) as SourceRow | undefined;
  }

  // --- Firmen -------------------------------------------------------------

  findBySlug(slug: string): CompanyRow | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE slug = ?').get(slug) as
      | CompanyRow
      | undefined;
  }

  findByDomain(domain: string): CompanyRow | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE domain = ?').get(registrableDomain(domain)) as
      | CompanyRow
      | undefined;
  }

  get(id: string): CompanyRow | undefined {
    return this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as CompanyRow | undefined;
  }

  /** Findet eine bestehende Firma ueber Domain oder Namensslug. */
  findExisting(input: { name?: string; website?: string | null }): CompanyRow | undefined {
    if (input.website) {
      const d = domainOfUrl(input.website);
      if (d) {
        const byDomain = this.findByDomain(d);
        if (byDomain) return byDomain;
      }
    }
    if (input.name) {
      const bySlug = this.findBySlug(companySlug(input.name));
      if (bySlug) return bySlug;
    }
    return undefined;
  }

  /**
   * Legt eine Firma an oder ergaenzt eine bestehende. Vorhandene Werte werden
   * nur gefuellt, wenn sie leer sind -- eine Recherche soll geprueften
   * Bestand nicht stillschweigend ueberschreiben.
   */
  upsert(input: CompanyInput): { company: CompanyRow; created: boolean } {
    const existing = this.findExisting(input);
    const ts = nowIso();
    const domain = input.website ? domainOfUrl(input.website) : null;

    if (existing) {
      const merged: CompanyRow = {
        ...existing,
        website: existing.website ?? input.website ?? null,
        domain: existing.domain ?? domain,
        street: existing.street ?? input.street ?? null,
        postal_code: existing.postal_code ?? input.postalCode ?? null,
        city: existing.city ?? input.city ?? null,
        region: existing.region ?? input.region ?? null,
        country: existing.country ?? input.country ?? 'DE',
        industry: existing.industry ?? input.industry ?? null,
        size_hint: existing.size_hint ?? input.sizeHint ?? null,
        description: existing.description ?? input.description ?? null,
        phone: existing.phone ?? input.phone ?? null,
        notes: existing.notes ?? input.notes ?? null,
        updated_at: ts,
      };
      this.db
        .prepare(
          `UPDATE companies SET website=@website, domain=@domain, street=@street,
             postal_code=@postal_code, city=@city, region=@region, country=@country,
             industry=@industry, size_hint=@size_hint, description=@description,
             phone=@phone, notes=@notes, updated_at=@updated_at
           WHERE id=@id`,
        )
        .run(merged);
      return { company: merged, created: false };
    }

    const row: CompanyRow = {
      id: newId('co'),
      name: input.name.trim(),
      slug: companySlug(input.name),
      website: input.website ?? null,
      domain,
      street: input.street ?? null,
      postal_code: input.postalCode ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      country: input.country ?? 'DE',
      industry: input.industry ?? null,
      size_hint: input.sizeHint ?? null,
      description: input.description ?? null,
      phone: input.phone ?? null,
      status: 'neu',
      notes: input.notes ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO companies (id, name, slug, website, domain, street, postal_code, city, region,
            country, industry, size_hint, description, phone, status, notes, created_at, updated_at)
         VALUES (@id, @name, @slug, @website, @domain, @street, @postal_code, @city, @region,
            @country, @industry, @size_hint, @description, @phone, @status, @notes, @created_at, @updated_at)`,
      )
      .run(row);
    return { company: row, created: true };
  }

  updateStatus(id: string, status: string): void {
    this.db
      .prepare('UPDATE companies SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, nowIso(), id);
  }

  list(filter: { city?: string; industry?: string; limit?: number; search?: string } = {}): CompanyRow[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.city) {
      where.push('LOWER(city) LIKE @city');
      params.city = `%${filter.city.toLowerCase()}%`;
    }
    if (filter.industry) {
      where.push('LOWER(industry) LIKE @industry');
      params.industry = `%${filter.industry.toLowerCase()}%`;
    }
    if (filter.search) {
      where.push('(LOWER(name) LIKE @q OR LOWER(description) LIKE @q OR LOWER(domain) LIKE @q)');
      params.q = `%${filter.search.toLowerCase()}%`;
    }
    params.limit = filter.limit ?? 200;
    const sql = `SELECT * FROM companies ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY updated_at DESC LIMIT @limit`;
    return this.db.prepare(sql).all(params) as CompanyRow[];
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM companies WHERE id = ?').run(id).changes > 0;
  }

  // --- Ansprechpartner ----------------------------------------------------

  addContact(input: {
    companyId: string;
    fullName: string;
    role?: string | null;
    phone?: string | null;
    salutation?: string | null;
    sourceId?: string | null;
    notes?: string | null;
  }): ContactRow {
    const existing = this.db
      .prepare('SELECT * FROM contacts WHERE company_id = ? AND LOWER(full_name) = LOWER(?)')
      .get(input.companyId, input.fullName) as ContactRow | undefined;
    if (existing) return existing;

    const ts = nowIso();
    const row: ContactRow = {
      id: newId('ct'),
      company_id: input.companyId,
      full_name: input.fullName.trim(),
      role: input.role ?? null,
      phone: input.phone ?? null,
      salutation: input.salutation ?? null,
      source_id: input.sourceId ?? null,
      notes: input.notes ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO contacts (id, company_id, full_name, role, phone, salutation, source_id, notes, created_at, updated_at)
         VALUES (@id, @company_id, @full_name, @role, @phone, @salutation, @source_id, @notes, @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  contactsOf(companyId: string): ContactRow[] {
    return this.db
      .prepare('SELECT * FROM contacts WHERE company_id = ? ORDER BY created_at')
      .all(companyId) as ContactRow[];
  }

  getContact(id: string): ContactRow | undefined {
    return this.db.prepare('SELECT * FROM contacts WHERE id = ?').get(id) as ContactRow | undefined;
  }

  // --- E-Mail-Adressen ----------------------------------------------------

  /**
   * Speichert eine gefundene Adresse. Der Verifizierungsstatus wird nicht hier
   * bestimmt, sondern von `research/verify.ts` -- diese Methode nimmt ihn nur
   * entgegen und haelt die Quelle daran fest.
   */
  addEmailAddress(input: {
    address: string;
    companyId?: string | null;
    contactId?: string | null;
    kind?: 'funktion' | 'person';
    verification: VerificationStatus;
    verifyNote?: string | null;
    mxOk?: boolean | null;
    sourceId?: string | null;
    foundOnUrl?: string | null;
  }): EmailAddressRow {
    const norm = input.address.trim().toLowerCase();
    const existing = this.findEmailAddress(norm);
    const ts = nowIso();

    if (existing) {
      // Nur "nach oben" korrigieren: eine bereits verifizierte Adresse wird
      // durch einen schwaecheren Fund nicht abgewertet.
      const rank: Record<VerificationStatus, number> = {
        NICHT_VERIFIZIERT: 0,
        WAHRSCHEINLICH: 1,
        VERIFIZIERT: 2,
      };
      const better = rank[input.verification] > rank[existing.verification];
      const merged: EmailAddressRow = {
        ...existing,
        company_id: existing.company_id ?? input.companyId ?? null,
        contact_id: existing.contact_id ?? input.contactId ?? null,
        verification: better ? input.verification : existing.verification,
        verify_note: better ? input.verifyNote ?? null : existing.verify_note,
        mx_ok: input.mxOk === undefined || input.mxOk === null ? existing.mx_ok : input.mxOk ? 1 : 0,
        source_id: better ? input.sourceId ?? existing.source_id : existing.source_id,
        found_on_url: better ? input.foundOnUrl ?? existing.found_on_url : existing.found_on_url,
        updated_at: ts,
      };
      this.db
        .prepare(
          `UPDATE email_addresses SET company_id=@company_id, contact_id=@contact_id,
             verification=@verification, verify_note=@verify_note, mx_ok=@mx_ok,
             source_id=@source_id, found_on_url=@found_on_url, updated_at=@updated_at
           WHERE id=@id`,
        )
        .run(merged);
      return merged;
    }

    const row: EmailAddressRow = {
      id: newId('em'),
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      address: input.address.trim(),
      address_norm: norm,
      kind: input.kind ?? 'funktion',
      verification: input.verification,
      verify_note: input.verifyNote ?? null,
      mx_ok: input.mxOk === undefined || input.mxOk === null ? null : input.mxOk ? 1 : 0,
      source_id: input.sourceId ?? null,
      found_on_url: input.foundOnUrl ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO email_addresses (id, company_id, contact_id, address, address_norm, kind,
            verification, verify_note, mx_ok, source_id, found_on_url, created_at, updated_at)
         VALUES (@id, @company_id, @contact_id, @address, @address_norm, @kind,
            @verification, @verify_note, @mx_ok, @source_id, @found_on_url, @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  findEmailAddress(address: string): EmailAddressRow | undefined {
    return this.db
      .prepare('SELECT * FROM email_addresses WHERE address_norm = ?')
      .get(address.trim().toLowerCase()) as EmailAddressRow | undefined;
  }

  emailsOf(companyId: string): EmailAddressRow[] {
    return this.db
      .prepare(
        `SELECT * FROM email_addresses WHERE company_id = ?
         ORDER BY CASE verification WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END,
                  created_at`,
      )
      .all(companyId) as EmailAddressRow[];
  }

  /** Beste verwendbare Adresse einer Firma, oder undefined. */
  bestEmailOf(companyId: string, requireVerified: boolean): EmailAddressRow | undefined {
    const all = this.emailsOf(companyId);
    if (requireVerified) return all.find((e) => e.verification === 'VERIFIZIERT');
    return all.find((e) => e.verification !== 'NICHT_VERIFIZIERT');
  }

  // --- Fakten / Einschaetzungen ------------------------------------------

  addFact(input: {
    companyId: string;
    kind: FactKind;
    label: string;
    value: string;
    sourceId?: string | null;
  }): CompanyFactRow {
    const row: CompanyFactRow = {
      id: newId('fct'),
      company_id: input.companyId,
      kind: input.kind,
      label: input.label,
      value: input.value,
      source_id: input.sourceId ?? null,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO company_facts (id, company_id, kind, label, value, source_id, created_at)
         VALUES (@id, @company_id, @kind, @label, @value, @source_id, @created_at)`,
      )
      .run(row);
    return row;
  }

  factsOf(companyId: string): CompanyFactRow[] {
    return this.db
      .prepare('SELECT * FROM company_facts WHERE company_id = ? ORDER BY kind, created_at')
      .all(companyId) as CompanyFactRow[];
  }
}

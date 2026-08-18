import { Db, nowIso } from '../database';
import type { Company, CompanyClaim } from '../../../shared/types';
import type { ClaimKind } from '../../../shared/status';
import { normalizeCompanyName, normalizeDomain } from '../../util/text';

export interface CompanyInput {
  name: string;
  website?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  industry?: string | null;
  sizeHint?: string | null;
  description?: string | null;
  notes?: string | null;
}

const map = (row: Record<string, unknown>): Company => ({
  id: Number(row.id),
  name: String(row.name),
  normalizedName: String(row.normalized_name),
  website: (row.website as string | null) ?? null,
  domain: (row.domain as string | null) ?? null,
  city: (row.city as string | null) ?? null,
  region: (row.region as string | null) ?? null,
  country: (row.country as string | null) ?? null,
  industry: (row.industry as string | null) ?? null,
  sizeHint: (row.size_hint as string | null) ?? null,
  description: (row.description as string | null) ?? null,
  notes: (row.notes as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export class CompanyRepo {
  constructor(private readonly db: Db) {}

  /**
   * Legt ein Unternehmen an oder ergänzt ein bestehendes.
   *
   * Dublettenerkennung in zwei Stufen: erst über die Domain (härtestes
   * Merkmal), dann über normalisierten Namen plus Ort. Vorhandene Felder
   * werden nur gefüllt, nicht überschrieben – die zuerst recherchierte,
   * belegte Angabe hat Vorrang vor späteren Treffern.
   */
  upsert(input: CompanyInput): { company: Company; created: boolean } {
    const domain = normalizeDomain(input.website);
    const normalized = normalizeCompanyName(input.name);
    const existing =
      (domain ? this.byDomain(domain) : null) ?? this.byNormalizedName(normalized, input.city ?? null);

    if (existing) {
      const patch: Record<string, string | null> = {};
      const maybe = (column: string, current: string | null, next: string | null | undefined) => {
        if (!current && next) patch[column] = next;
      };
      maybe('website', existing.website, input.website ?? null);
      maybe('domain', existing.domain, domain);
      maybe('city', existing.city, input.city ?? null);
      maybe('region', existing.region, input.region ?? null);
      maybe('industry', existing.industry, input.industry ?? null);
      maybe('size_hint', existing.sizeHint, input.sizeHint ?? null);
      maybe('description', existing.description, input.description ?? null);
      maybe('notes', existing.notes, input.notes ?? null);
      if (Object.keys(patch).length > 0) {
        const sets = Object.keys(patch).map((column) => `${column} = ?`);
        this.db.run(`UPDATE companies SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
          ...Object.values(patch),
          nowIso(),
          existing.id
        ]);
      }
      return { company: this.byId(existing.id)!, created: false };
    }

    const ts = nowIso();
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO companies
        (name, normalized_name, website, domain, city, region, country, industry, size_hint, description, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        normalized,
        input.website ?? null,
        domain,
        input.city ?? null,
        input.region ?? null,
        input.country ?? 'DE',
        input.industry ?? null,
        input.sizeHint ?? null,
        input.description ?? null,
        input.notes ?? null,
        ts,
        ts
      ]
    );
    return { company: this.byId(lastInsertRowid)!, created: true };
  }

  byId(id: number): Company | null {
    const row = this.db.get('SELECT * FROM companies WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  byDomain(domain: string): Company | null {
    const row = this.db.get('SELECT * FROM companies WHERE domain = ?', [domain]);
    return row ? map(row) : null;
  }

  byNormalizedName(normalized: string, city: string | null): Company | null {
    const row = this.db.get(
      'SELECT * FROM companies WHERE normalized_name = ? AND IFNULL(city, \'\') = ?',
      [normalized, city ?? '']
    );
    return row ? map(row) : null;
  }

  /** Freitextsuche über Name, Ort und Branche. */
  search(query: string, limit = 50): Company[] {
    const like = `%${query.trim().toLowerCase()}%`;
    return this.db
      .all(
        `SELECT * FROM companies
          WHERE lower(name) LIKE ? OR lower(IFNULL(city,'')) LIKE ? OR lower(IFNULL(industry,'')) LIKE ?
          ORDER BY updated_at DESC LIMIT ?`,
        [like, like, like, limit]
      )
      .map(map);
  }

  list(limit = 200, offset = 0): Company[] {
    return this.db
      .all('SELECT * FROM companies ORDER BY updated_at DESC LIMIT ? OFFSET ?', [limit, offset])
      .map(map);
  }

  count(): number {
    const row = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM companies');
    return Number(row?.n ?? 0);
  }

  update(id: number, patch: Partial<CompanyInput>): Company | null {
    const columns: Record<string, string> = {
      name: 'name',
      website: 'website',
      city: 'city',
      region: 'region',
      country: 'country',
      industry: 'industry',
      sizeHint: 'size_hint',
      description: 'description',
      notes: 'notes'
    };
    const sets: string[] = [];
    const values: (string | null)[] = [];
    for (const [key, column] of Object.entries(columns)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(value === null ? null : String(value));
    }
    if (patch.name) {
      sets.push('normalized_name = ?');
      values.push(normalizeCompanyName(patch.name));
    }
    if (patch.website !== undefined) {
      sets.push('domain = ?');
      values.push(normalizeDomain(patch.website));
    }
    if (sets.length === 0) return this.byId(id);
    this.db.run(`UPDATE companies SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [
      ...values,
      nowIso(),
      id
    ]);
    return this.byId(id);
  }

  delete(id: number): boolean {
    return this.db.run('DELETE FROM companies WHERE id = ?', [id]).changes > 0;
  }

  /** Belegte Aussage oder ausdrücklich gekennzeichnete Einschätzung ablegen. */
  addClaim(companyId: number, kind: ClaimKind, statement: string, sourceId: number | null): CompanyClaim {
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO company_claims (company_id, kind, statement, source_id, created_at) VALUES (?, ?, ?, ?, ?)',
      [companyId, kind, statement, sourceId, nowIso()]
    );
    return this.claims(companyId).find((c) => c.id === lastInsertRowid)!;
  }

  claims(companyId: number): CompanyClaim[] {
    return this.db
      .all(
        `SELECT c.*, s.url AS source_url FROM company_claims c
           LEFT JOIN sources s ON s.id = c.source_id
          WHERE c.company_id = ? ORDER BY c.id`,
        [companyId]
      )
      .map((row) => ({
        id: Number(row.id),
        companyId: Number(row.company_id),
        kind: String(row.kind) as ClaimKind,
        statement: String(row.statement),
        sourceId: row.source_id === null ? null : Number(row.source_id),
        sourceUrl: (row.source_url as string | null) ?? null,
        createdAt: String(row.created_at)
      }));
  }
}

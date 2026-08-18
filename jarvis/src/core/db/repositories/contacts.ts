import { Db, nowIso } from '../database';
import type { Contact, EmailAddress } from '../../../shared/types';
import { VerificationStatus } from '../../../shared/status';
import { normalizeEmail, truncate } from '../../util/text';

/** Rangfolge für "welche Adresse ist die bessere". Kleiner ist besser. */
export const VERIFICATION_RANK: Record<VerificationStatus, number> = {
  VERIFIZIERT: 0,
  WAHRSCHEINLICH: 1,
  NICHT_VERIFIZIERT: 2
};

export interface ContactInput {
  companyId: number;
  fullName: string;
  role?: string | null;
  phone?: string | null;
  sourceId?: number | null;
}

export interface EmailAddressInput {
  companyId: number;
  contactId?: number | null;
  address: string;
  verificationStatus: VerificationStatus;
  verificationMethod: string;
  evidenceUrl?: string | null;
  evidenceSnippet?: string | null;
  sourceId?: number | null;
}

const mapContact = (row: Record<string, unknown>): Contact => ({
  id: Number(row.id),
  companyId: Number(row.company_id),
  fullName: String(row.full_name),
  role: (row.role as string | null) ?? null,
  phone: (row.phone as string | null) ?? null,
  sourceId: row.source_id === null ? null : Number(row.source_id),
  createdAt: String(row.created_at)
});

const mapAddress = (row: Record<string, unknown>): EmailAddress => ({
  id: Number(row.id),
  companyId: Number(row.company_id),
  contactId: row.contact_id === null ? null : Number(row.contact_id),
  address: String(row.address),
  verificationStatus: String(row.verification_status) as VerificationStatus,
  verificationMethod: String(row.verification_method),
  evidenceUrl: (row.evidence_url as string | null) ?? null,
  evidenceSnippet: (row.evidence_snippet as string | null) ?? null,
  sourceId: row.source_id === null ? null : Number(row.source_id),
  firstSeenAt: String(row.first_seen_at),
  lastCheckedAt: (row.last_checked_at as string | null) ?? null
});

export class ContactRepo {
  constructor(private readonly db: Db) {}

  upsert(input: ContactInput): Contact {
    const existing = this.db.get('SELECT * FROM contacts WHERE company_id = ? AND full_name = ?', [
      input.companyId,
      input.fullName.trim()
    ]);
    if (existing) {
      const contact = mapContact(existing);
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (!contact.role && input.role) {
        sets.push('role = ?');
        values.push(input.role);
      }
      if (!contact.phone && input.phone) {
        sets.push('phone = ?');
        values.push(input.phone);
      }
      if (sets.length > 0) {
        this.db.run(`UPDATE contacts SET ${sets.join(', ')} WHERE id = ?`, [...values, contact.id]);
      }
      return this.byId(contact.id)!;
    }
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO contacts (company_id, full_name, role, phone, source_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [input.companyId, input.fullName.trim(), input.role ?? null, input.phone ?? null, input.sourceId ?? null, nowIso()]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): Contact | null {
    const row = this.db.get('SELECT * FROM contacts WHERE id = ?', [id]);
    return row ? mapContact(row) : null;
  }

  forCompany(companyId: number): Contact[] {
    return this.db.all('SELECT * FROM contacts WHERE company_id = ? ORDER BY id', [companyId]).map(mapContact);
  }
}

export class EmailAddressRepo {
  constructor(private readonly db: Db) {}

  /**
   * Adresse ablegen. Ist sie bereits bekannt, wird nur dann aktualisiert,
   * wenn der neue Fund besser belegt ist – eine einmal verifizierte Adresse
   * kann nicht durch einen schwächeren Treffer herabgestuft werden.
   */
  upsert(input: EmailAddressInput): EmailAddress {
    const address = normalizeEmail(input.address);
    const existing = this.db.get('SELECT * FROM email_addresses WHERE company_id = ? AND address = ?', [
      input.companyId,
      address
    ]);
    const ts = nowIso();
    if (existing) {
      const current = mapAddress(existing);
      const besser =
        VERIFICATION_RANK[input.verificationStatus] < VERIFICATION_RANK[current.verificationStatus];
      if (besser) {
        this.db.run(
          `UPDATE email_addresses
              SET verification_status = ?, verification_method = ?, evidence_url = ?, evidence_snippet = ?,
                  source_id = ?, last_checked_at = ?, contact_id = COALESCE(?, contact_id)
            WHERE id = ?`,
          [
            input.verificationStatus,
            input.verificationMethod,
            input.evidenceUrl ?? null,
            input.evidenceSnippet ? truncate(input.evidenceSnippet, 300) : null,
            input.sourceId ?? null,
            ts,
            input.contactId ?? null,
            current.id
          ]
        );
      } else {
        this.db.run('UPDATE email_addresses SET last_checked_at = ? WHERE id = ?', [ts, current.id]);
      }
      return this.byId(current.id)!;
    }
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO email_addresses
        (company_id, contact_id, address, verification_status, verification_method, evidence_url, evidence_snippet, source_id, first_seen_at, last_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.companyId,
        input.contactId ?? null,
        address,
        input.verificationStatus,
        input.verificationMethod,
        input.evidenceUrl ?? null,
        input.evidenceSnippet ? truncate(input.evidenceSnippet, 300) : null,
        input.sourceId ?? null,
        ts,
        ts
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): EmailAddress | null {
    const row = this.db.get('SELECT * FROM email_addresses WHERE id = ?', [id]);
    return row ? mapAddress(row) : null;
  }

  forCompany(companyId: number): EmailAddress[] {
    return this.db
      .all(
        `SELECT * FROM email_addresses WHERE company_id = ?
          ORDER BY CASE verification_status WHEN 'VERIFIZIERT' THEN 0 WHEN 'WAHRSCHEINLICH' THEN 1 ELSE 2 END,
                   CASE WHEN contact_id IS NULL THEN 1 ELSE 0 END, id`,
        [companyId]
      )
      .map(mapAddress);
  }

  /** Beste bekannte Adresse, optional erst ab einem Mindest-Verifizierungsgrad. */
  best(companyId: number, minStatus: VerificationStatus = VerificationStatus.VERIFIZIERT): EmailAddress | null {
    const maxRank = VERIFICATION_RANK[minStatus];
    return this.forCompany(companyId).find((a) => VERIFICATION_RANK[a.verificationStatus] <= maxRank) ?? null;
  }

  findByAddress(address: string): EmailAddress[] {
    return this.db.all('SELECT * FROM email_addresses WHERE address = ?', [normalizeEmail(address)]).map(mapAddress);
  }
}

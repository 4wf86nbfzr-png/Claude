import { Db, nowIso } from '../database';

export interface Interaction {
  id: number;
  companyId: number | null;
  contactId: number | null;
  emailId: number | null;
  kind: string;
  summary: string;
  occurredAt: string;
}

const map = (row: Record<string, unknown>): Interaction => ({
  id: Number(row.id),
  companyId: row.company_id === null ? null : Number(row.company_id),
  contactId: row.contact_id === null ? null : Number(row.contact_id),
  emailId: row.email_id === null ? null : Number(row.email_id),
  kind: String(row.kind),
  summary: String(row.summary),
  occurredAt: String(row.occurred_at)
});

/** Kontakthistorie (§17): wer wurde wann womit erreicht. */
export class InteractionRepo {
  constructor(private readonly db: Db) {}

  add(input: {
    companyId?: number | null;
    contactId?: number | null;
    emailId?: number | null;
    kind: string;
    summary: string;
    occurredAt?: string;
  }): Interaction {
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO interaction_history (company_id, contact_id, email_id, kind, summary, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        input.companyId ?? null,
        input.contactId ?? null,
        input.emailId ?? null,
        input.kind,
        input.summary,
        input.occurredAt ?? nowIso()
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): Interaction | null {
    const row = this.db.get('SELECT * FROM interaction_history WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  forCompany(companyId: number, limit = 50): Interaction[] {
    return this.db
      .all('SELECT * FROM interaction_history WHERE company_id = ? ORDER BY occurred_at DESC LIMIT ?', [
        companyId,
        limit
      ])
      .map(map);
  }
}

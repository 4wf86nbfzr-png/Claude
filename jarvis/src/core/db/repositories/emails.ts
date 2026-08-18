import type { Database } from '../database.js';
import { nowIso } from '../../util/id.js';
import type { EmailAttachment, EmailRecord, EmailStatus } from './row-types.js';

interface EmailRow {
  id: number;
  company_id: number | null;
  contact_id: number | null;
  campaign_id: number | null;
  to_address: string;
  cc_addresses: string;
  bcc_addresses: string;
  subject: string;
  body: string;
  attachments: string;
  status: string;
  approval_id: number | null;
  revision: number;
  message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  replied_at: string | null;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toEmail(row: EmailRow): EmailRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    contactId: row.contact_id,
    campaignId: row.campaign_id,
    to: row.to_address,
    cc: parseJson<string[]>(row.cc_addresses, []),
    bcc: parseJson<string[]>(row.bcc_addresses, []),
    subject: row.subject,
    body: row.body,
    attachments: parseJson<EmailAttachment[]>(row.attachments, []),
    status: row.status as EmailStatus,
    approvalId: row.approval_id,
    revision: row.revision,
    messageId: row.message_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    repliedAt: row.replied_at,
  };
}

export interface DraftInput {
  companyId?: number | null;
  contactId?: number | null;
  campaignId?: number | null;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

export class EmailRepository {
  constructor(private readonly db: Database) {}

  createDraft(input: DraftInput): EmailRecord {
    const at = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO emails
           (company_id, contact_id, campaign_id, to_address, cc_addresses, bcc_addresses,
            subject, body, attachments, status, revision, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'entwurf',1,?,?)`,
      )
      .run(
        input.companyId ?? null,
        input.contactId ?? null,
        input.campaignId ?? null,
        input.to,
        JSON.stringify(input.cc ?? []),
        JSON.stringify(input.bcc ?? []),
        input.subject,
        input.body,
        JSON.stringify(input.attachments ?? []),
        at,
        at,
      );
    return this.get(result.lastInsertRowid)!;
  }

  get(id: number): EmailRecord | null {
    const row = this.db.prepare('SELECT * FROM emails WHERE id = ?').get<EmailRow>(id);
    return row ? toEmail(row) : null;
  }

  list(filter: { companyId?: number; status?: string; campaignId?: number; limit?: number } = {}): EmailRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.companyId !== undefined) {
      clauses.push('company_id = ?');
      params.push(filter.companyId);
    }
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    if (filter.campaignId !== undefined) {
      clauses.push('campaign_id = ?');
      params.push(filter.campaignId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(filter.limit ?? 200);
    return this.db
      .prepare(`SELECT * FROM emails ${where} ORDER BY id DESC LIMIT ?`)
      .all<EmailRow>(...params)
      .map(toEmail);
  }

  /**
   * Applies an edit. Any edit bumps the revision and drops an existing
   * approval — approval is always bound to the exact text that was approved.
   */
  update(
    id: number,
    patch: Partial<Pick<EmailRecord, 'to' | 'subject' | 'body' | 'cc' | 'bcc' | 'attachments'>>,
  ): EmailRecord | null {
    const current = this.get(id);
    if (!current) return null;
    if (current.status === 'gesendet') return current;

    const fields: string[] = [];
    const values: Array<string | number | null> = [];

    if (patch.to !== undefined) {
      fields.push('to_address = ?');
      values.push(patch.to);
    }
    if (patch.subject !== undefined) {
      fields.push('subject = ?');
      values.push(patch.subject);
    }
    if (patch.body !== undefined) {
      fields.push('body = ?');
      values.push(patch.body);
    }
    if (patch.cc !== undefined) {
      fields.push('cc_addresses = ?');
      values.push(JSON.stringify(patch.cc));
    }
    if (patch.bcc !== undefined) {
      fields.push('bcc_addresses = ?');
      values.push(JSON.stringify(patch.bcc));
    }
    if (patch.attachments !== undefined) {
      fields.push('attachments = ?');
      values.push(JSON.stringify(patch.attachments));
    }
    if (fields.length === 0) return current;

    fields.push('revision = revision + 1', "status = 'entwurf'", 'approval_id = NULL', 'updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE emails SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.get(id);
  }

  setStatus(id: number, status: EmailStatus, extra: { approvalId?: number | null } = {}): void {
    this.db
      .prepare('UPDATE emails SET status = ?, approval_id = COALESCE(?, approval_id), updated_at = ? WHERE id = ?')
      .run(status, extra.approvalId ?? null, nowIso(), id);
  }

  markSent(id: number, messageId: string): void {
    const at = nowIso();
    this.db
      .prepare(
        `UPDATE emails SET status = 'gesendet', message_id = ?, sent_at = ?, updated_at = ?,
           error_code = NULL, error_message = NULL WHERE id = ?`,
      )
      .run(messageId, at, at, id);
  }

  markFailed(id: number, code: string, message: string): void {
    this.db
      .prepare(
        `UPDATE emails SET status = 'fehlgeschlagen', error_code = ?, error_message = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(code, message.slice(0, 2000), nowIso(), id);
  }

  markReplied(id: number, at = nowIso()): void {
    this.db.prepare('UPDATE emails SET replied_at = ?, updated_at = ? WHERE id = ?').run(at, at, id);
  }

  remove(id: number): boolean {
    return (
      this.db.prepare("DELETE FROM emails WHERE id = ? AND status <> 'gesendet'").run(id).changes > 0
    );
  }

  /** Has this company already received a first contact? (§14) */
  previousContact(companyId: number): EmailRecord | null {
    const row = this.db
      .prepare(
        "SELECT * FROM emails WHERE company_id = ? AND status = 'gesendet' ORDER BY sent_at DESC LIMIT 1",
      )
      .get<EmailRow>(companyId);
    return row ? toEmail(row) : null;
  }

  findByMessageId(messageId: string): EmailRecord | null {
    const row = this.db.prepare('SELECT * FROM emails WHERE message_id = ?').get<EmailRow>(messageId);
    return row ? toEmail(row) : null;
  }

  /* ---------------------------------------------------------------- */
  /* Send log — evidence for rate limits (§17)                         */
  /* ---------------------------------------------------------------- */

  logSend(emailId: number | null, toAddress: string, outcome: 'ok' | 'fehler'): void {
    this.db
      .prepare('INSERT INTO send_log (email_id, to_address, outcome, at) VALUES (?,?,?,?)')
      .run(emailId, toAddress, outcome, nowIso());
  }

  sendsSince(iso: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM send_log WHERE outcome = 'ok' AND at >= ?")
      .get<{ n: number }>(iso);
    return row?.n ?? 0;
  }

  lastSendAt(): string | null {
    const row = this.db
      .prepare("SELECT at FROM send_log WHERE outcome = 'ok' ORDER BY at DESC LIMIT 1")
      .get<{ at: string }>();
    return row?.at ?? null;
  }

  /* ---------------------------------------------------------------- */
  /* Interaction history                                               */
  /* ---------------------------------------------------------------- */

  addInteraction(input: {
    companyId?: number | null;
    contactId?: number | null;
    emailId?: number | null;
    direction: 'out' | 'in';
    channel?: string;
    summary: string;
    occurredAt?: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO interaction_history
           (company_id, contact_id, email_id, direction, channel, summary, occurred_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        input.companyId ?? null,
        input.contactId ?? null,
        input.emailId ?? null,
        input.direction,
        input.channel ?? 'email',
        input.summary,
        input.occurredAt ?? nowIso(),
      );
  }

  interactions(companyId: number): Array<{
    direction: string;
    channel: string;
    summary: string;
    occurredAt: string;
  }> {
    return this.db
      .prepare(
        'SELECT direction, channel, summary, occurred_at FROM interaction_history WHERE company_id = ? ORDER BY occurred_at DESC',
      )
      .all<{ direction: string; channel: string; summary: string; occurred_at: string }>(companyId)
      .map((row) => ({
        direction: row.direction,
        channel: row.channel,
        summary: row.summary,
        occurredAt: row.occurred_at,
      }));
  }
}

import { Db, nowIso, parseJson } from '../database';
import type { EmailAttachment, EmailRecord } from '../../../shared/types';
import { EmailStatus } from '../../../shared/status';
import { mailContentHash } from '../../util/hash';
import { normalizeEmail } from '../../util/text';

export interface DraftInput {
  campaignId?: number | null;
  companyId?: number | null;
  contactId?: number | null;
  fromAddress?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  attachments?: EmailAttachment[];
  threadKey?: string | null;
  inReplyTo?: string | null;
}

export interface DraftPatch {
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  bodyText?: string;
  bodyHtml?: string | null;
  attachments?: EmailAttachment[];
}

const map = (row: Record<string, unknown>): EmailRecord => ({
  id: Number(row.id),
  campaignId: row.campaign_id === null ? null : Number(row.campaign_id),
  companyId: row.company_id === null ? null : Number(row.company_id),
  contactId: row.contact_id === null ? null : Number(row.contact_id),
  direction: String(row.direction) as EmailRecord['direction'],
  fromAddress: (row.from_address as string | null) ?? null,
  toAddresses: parseJson<string[]>(row.to_addresses, []),
  cc: parseJson<string[]>(row.cc, []),
  bcc: parseJson<string[]>(row.bcc, []),
  subject: String(row.subject),
  bodyText: String(row.body_text),
  bodyHtml: (row.body_html as string | null) ?? null,
  attachments: parseJson<EmailAttachment[]>(row.attachments, []),
  status: String(row.status) as EmailStatus,
  contentHash: String(row.content_hash),
  approvalId: row.approval_id === null ? null : Number(row.approval_id),
  messageId: (row.message_id as string | null) ?? null,
  inReplyTo: (row.in_reply_to as string | null) ?? null,
  threadKey: (row.thread_key as string | null) ?? null,
  sentAt: (row.sent_at as string | null) ?? null,
  error: (row.error as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export class EmailRepo {
  constructor(private readonly db: Db) {}

  createDraft(input: DraftInput): EmailRecord {
    const to = input.to.map(normalizeEmail);
    const cc = (input.cc ?? []).map(normalizeEmail);
    const bcc = (input.bcc ?? []).map(normalizeEmail);
    const attachments = input.attachments ?? [];
    const hash = mailContentHash({ to, cc, bcc, subject: input.subject, bodyText: input.bodyText, attachments });
    const ts = nowIso();
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO emails
        (campaign_id, company_id, contact_id, direction, from_address, to_addresses, cc, bcc, subject,
         body_text, body_html, attachments, status, content_hash, thread_key, in_reply_to, created_at, updated_at)
       VALUES (?, ?, ?, 'AUSGEHEND', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.campaignId ?? null,
        input.companyId ?? null,
        input.contactId ?? null,
        input.fromAddress ?? null,
        JSON.stringify(to),
        JSON.stringify(cc),
        JSON.stringify(bcc),
        input.subject,
        input.bodyText,
        input.bodyHtml ?? null,
        JSON.stringify(attachments),
        EmailStatus.ENTWURF,
        hash,
        input.threadKey ?? (to[0] ? `zu:${to[0]}` : null),
        input.inReplyTo ?? null,
        ts,
        ts
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  /**
   * Entwurf ändern.
   *
   * Jede Änderung setzt den Entwurf auf ENTWURF zurück und löst die
   * Verbindung zu einer eventuell bereits erteilten Freigabe. Wer den Text
   * nach der Freigabe anfasst, muss erneut freigeben – sonst ließe sich der
   * Inhalt zwischen Bestätigung und Versand austauschen.
   */
  updateDraft(id: number, patch: DraftPatch): EmailRecord | null {
    const current = this.byId(id);
    if (!current) return null;
    if (current.status === EmailStatus.GESENDET) {
      throw new Error('Eine bereits gesendete E-Mail kann nicht mehr geändert werden.');
    }
    const next = {
      to: (patch.to ?? current.toAddresses).map(normalizeEmail),
      cc: (patch.cc ?? current.cc).map(normalizeEmail),
      bcc: (patch.bcc ?? current.bcc).map(normalizeEmail),
      subject: patch.subject ?? current.subject,
      bodyText: patch.bodyText ?? current.bodyText,
      bodyHtml: patch.bodyHtml === undefined ? current.bodyHtml : patch.bodyHtml,
      attachments: patch.attachments ?? current.attachments
    };
    const hash = mailContentHash(next);
    this.db.run(
      `UPDATE emails
          SET to_addresses = ?, cc = ?, bcc = ?, subject = ?, body_text = ?, body_html = ?, attachments = ?,
              content_hash = ?, status = ?, approval_id = NULL, error = NULL, updated_at = ?
        WHERE id = ?`,
      [
        JSON.stringify(next.to),
        JSON.stringify(next.cc),
        JSON.stringify(next.bcc),
        next.subject,
        next.bodyText,
        next.bodyHtml,
        JSON.stringify(next.attachments),
        hash,
        EmailStatus.ENTWURF,
        nowIso(),
        id
      ]
    );
    return this.byId(id);
  }

  byId(id: number): EmailRecord | null {
    const row = this.db.get('SELECT * FROM emails WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  list(filter: { status?: EmailStatus; campaignId?: number; companyId?: number; limit?: number } = {}): EmailRecord[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }
    if (filter.campaignId !== undefined) {
      where.push('campaign_id = ?');
      params.push(filter.campaignId);
    }
    if (filter.companyId !== undefined) {
      where.push('company_id = ?');
      params.push(filter.companyId);
    }
    params.push(filter.limit ?? 200);
    return this.db
      .all(
        `SELECT * FROM emails ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`,
        params
      )
      .map(map);
  }

  linkApproval(id: number, approvalId: number): void {
    this.db.run('UPDATE emails SET approval_id = ?, status = ?, updated_at = ? WHERE id = ?', [
      approvalId,
      EmailStatus.WARTET_AUF_FREIGABE,
      nowIso(),
      id
    ]);
  }

  markApproved(id: number): void {
    this.db.run('UPDATE emails SET status = ?, updated_at = ? WHERE id = ?', [
      EmailStatus.FREIGEGEBEN,
      nowIso(),
      id
    ]);
  }

  markSent(id: number, messageId: string | null): void {
    const ts = nowIso();
    this.db.run('UPDATE emails SET status = ?, message_id = ?, sent_at = ?, error = NULL, updated_at = ? WHERE id = ?', [
      EmailStatus.GESENDET,
      messageId,
      ts,
      ts,
      id
    ]);
  }

  markFailed(id: number, error: string): void {
    this.db.run('UPDATE emails SET status = ?, error = ?, updated_at = ? WHERE id = ?', [
      EmailStatus.FEHLGESCHLAGEN,
      error,
      nowIso(),
      id
    ]);
  }

  /** Letzte ausgehende, tatsächlich gesendete Nachricht an ein Unternehmen. */
  lastSentToCompany(companyId: number): EmailRecord | null {
    const row = this.db.get(
      `SELECT * FROM emails WHERE company_id = ? AND direction = 'AUSGEHEND' AND status = ?
        ORDER BY datetime(sent_at) DESC LIMIT 1`,
      [companyId, EmailStatus.GESENDET]
    );
    return row ? map(row) : null;
  }

  /** Wurde diese Adresse schon einmal angeschrieben? (Dublettensperre) */
  lastSentToAddress(address: string): EmailRecord | null {
    const needle = `%"${normalizeEmail(address)}"%`;
    const row = this.db.get(
      `SELECT * FROM emails WHERE direction = 'AUSGEHEND' AND status = ? AND to_addresses LIKE ?
        ORDER BY datetime(sent_at) DESC LIMIT 1`,
      [EmailStatus.GESENDET, needle]
    );
    return row ? map(row) : null;
  }

  sentSince(isoTimestamp: string): number {
    const row = this.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM emails WHERE status = ? AND sent_at IS NOT NULL AND sent_at >= ?`,
      [EmailStatus.GESENDET, isoTimestamp]
    );
    return Number(row?.n ?? 0);
  }

  /** Eingehende Nachricht protokollieren (Zuordnung von Antworten). */
  recordIncoming(input: {
    companyId: number | null;
    fromAddress: string;
    to: string[];
    subject: string;
    bodyText: string;
    messageId: string | null;
    inReplyTo: string | null;
    threadKey: string | null;
    receivedAt?: string;
  }): EmailRecord {
    const ts = input.receivedAt ?? nowIso();
    const hash = mailContentHash({ to: input.to, subject: input.subject, bodyText: input.bodyText });
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO emails
        (company_id, direction, from_address, to_addresses, cc, bcc, subject, body_text, attachments,
         status, content_hash, message_id, in_reply_to, thread_key, sent_at, created_at, updated_at)
       VALUES (?, 'EINGEHEND', ?, ?, '[]', '[]', ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.companyId,
        normalizeEmail(input.fromAddress),
        JSON.stringify(input.to.map(normalizeEmail)),
        input.subject,
        input.bodyText,
        EmailStatus.EMPFANGEN,
        hash,
        input.messageId,
        input.inReplyTo,
        input.threadKey ?? `von:${normalizeEmail(input.fromAddress)}`,
        ts,
        ts,
        ts
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  delete(id: number): boolean {
    return this.db.run('DELETE FROM emails WHERE id = ? AND status <> ?', [id, EmailStatus.GESENDET]).changes > 0;
  }
}

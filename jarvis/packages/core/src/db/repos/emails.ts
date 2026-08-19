import type { Db } from '../database.js';
import type { AttachmentRow, EmailRow, EmailStatus, InteractionRow } from '../schema.js';
import { contentHash, newId, nowIso } from '../../util/text.js';

export interface DraftInput {
  toAddress: string;
  subject: string;
  bodyText: string;
  toName?: string | null;
  cc?: string | null;
  bcc?: string | null;
  fromAddress?: string | null;
  replyTo?: string | null;
  bodyHtml?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  inReplyTo?: string | null;
  threadKey?: string | null;
}

/** Der Hash entscheidet, ob eine Freigabe noch zum Inhalt passt. */
export function hashEmail(e: {
  to_address: string;
  cc?: string | null;
  bcc?: string | null;
  subject: string;
  body_text: string;
}): string {
  return contentHash([e.to_address.trim().toLowerCase(), e.cc, e.bcc, e.subject, e.body_text]);
}

export class EmailRepo {
  constructor(private readonly db: Db) {}

  createDraft(input: DraftInput): EmailRow {
    const ts = nowIso();
    const base = {
      to_address: input.toAddress.trim(),
      cc: input.cc ?? null,
      bcc: input.bcc ?? null,
      subject: input.subject,
      body_text: input.bodyText,
    };
    const row: EmailRow = {
      id: newId('mail'),
      campaign_id: input.campaignId ?? null,
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      direction: 'ausgehend',
      to_address: base.to_address,
      to_name: input.toName ?? null,
      cc: base.cc,
      bcc: base.bcc,
      from_address: input.fromAddress ?? null,
      reply_to: input.replyTo ?? null,
      subject: input.subject,
      body_text: input.bodyText,
      body_html: input.bodyHtml ?? null,
      status: 'entwurf',
      approval_id: null,
      content_hash: hashEmail(base),
      provider: null,
      message_id: null,
      in_reply_to: input.inReplyTo ?? null,
      thread_key: input.threadKey ?? null,
      error: null,
      sent_at: null,
      received_at: null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO emails (id, campaign_id, company_id, contact_id, direction, to_address, to_name,
            cc, bcc, from_address, reply_to, subject, body_text, body_html, status, approval_id,
            content_hash, provider, message_id, in_reply_to, thread_key, error, sent_at, received_at,
            created_at, updated_at)
         VALUES (@id, @campaign_id, @company_id, @contact_id, @direction, @to_address, @to_name,
            @cc, @bcc, @from_address, @reply_to, @subject, @body_text, @body_html, @status, @approval_id,
            @content_hash, @provider, @message_id, @in_reply_to, @thread_key, @error, @sent_at, @received_at,
            @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  get(id: string): EmailRow | undefined {
    return this.db.prepare('SELECT * FROM emails WHERE id = ?').get(id) as EmailRow | undefined;
  }

  /**
   * Aendert einen Entwurf. Jede inhaltliche Aenderung setzt den Status zurueck
   * auf 'entwurf' und loest die Freigabe -- sonst koennte man nach der
   * Freigabe den Text austauschen.
   */
  updateDraft(
    id: string,
    patch: Partial<Pick<EmailRow, 'to_address' | 'to_name' | 'cc' | 'bcc' | 'subject' | 'body_text' | 'body_html' | 'reply_to'>>,
  ): EmailRow | undefined {
    const current = this.get(id);
    if (!current) return undefined;

    const next: EmailRow = { ...current, ...patch, updated_at: nowIso() };
    const newHash = hashEmail(next);
    const contentChanged = newHash !== current.content_hash;
    if (contentChanged) {
      next.content_hash = newHash;
      next.approval_id = null;
      if (current.status !== 'gesendet') next.status = 'entwurf';
    }

    this.db
      .prepare(
        `UPDATE emails SET to_address=@to_address, to_name=@to_name, cc=@cc, bcc=@bcc,
           subject=@subject, body_text=@body_text, body_html=@body_html, reply_to=@reply_to,
           content_hash=@content_hash, approval_id=@approval_id, status=@status, updated_at=@updated_at
         WHERE id=@id`,
      )
      .run(next);
    return next;
  }

  setStatus(id: string, status: EmailStatus, extra?: { error?: string | null; approvalId?: string | null }): void {
    this.db
      .prepare('UPDATE emails SET status = ?, error = ?, approval_id = COALESCE(?, approval_id), updated_at = ? WHERE id = ?')
      .run(status, extra?.error ?? null, extra?.approvalId ?? null, nowIso(), id);
  }

  markSent(id: string, info: { provider: string; messageId: string | null; sentAt?: string }): void {
    this.db
      .prepare(
        `UPDATE emails SET status='gesendet', provider=?, message_id=?, sent_at=?, error=NULL, updated_at=?
         WHERE id=?`,
      )
      .run(info.provider, info.messageId, info.sentAt ?? nowIso(), nowIso(), id);
  }

  markFailed(id: string, message: string): void {
    this.db
      .prepare(`UPDATE emails SET status='fehlgeschlagen', error=?, updated_at=? WHERE id=?`)
      .run(message, nowIso(), id);
  }

  list(filter: { status?: EmailStatus | EmailStatus[]; campaignId?: string; companyId?: string; limit?: number } = {}): EmailRow[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.status) {
      const list = Array.isArray(filter.status) ? filter.status : [filter.status];
      where.push(`status IN (${list.map((_, i) => `@s${i}`).join(',')})`);
      list.forEach((s, i) => (params[`s${i}`] = s));
    }
    if (filter.campaignId) {
      where.push('campaign_id = @campaignId');
      params.campaignId = filter.campaignId;
    }
    if (filter.companyId) {
      where.push('company_id = @companyId');
      params.companyId = filter.companyId;
    }
    params.limit = filter.limit ?? 200;
    return this.db
      .prepare(
        `SELECT * FROM emails ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY created_at DESC LIMIT @limit`,
      )
      .all(params) as EmailRow[];
  }

  /** Wurde diese Adresse schon einmal erfolgreich angeschrieben? */
  lastSentTo(address: string): EmailRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM emails WHERE LOWER(to_address) = LOWER(?) AND status = 'gesendet'
         ORDER BY sent_at DESC LIMIT 1`,
      )
      .get(address.trim()) as EmailRow | undefined;
  }

  lastSentToCompany(companyId: string): EmailRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM emails WHERE company_id = ? AND status = 'gesendet'
         ORDER BY sent_at DESC LIMIT 1`,
      )
      .get(companyId) as EmailRow | undefined;
  }

  /** Zaehlt erfolgreiche Sendungen seit einem Zeitpunkt (Versandlimits). */
  countSentSince(isoTimestamp: string): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) AS n FROM emails WHERE status='gesendet' AND sent_at >= ?`)
      .get(isoTimestamp) as { n: number };
    return r.n;
  }

  lastSendAt(): string | null {
    const r = this.db
      .prepare(`SELECT sent_at FROM emails WHERE status='gesendet' ORDER BY sent_at DESC LIMIT 1`)
      .get() as { sent_at: string } | undefined;
    return r?.sent_at ?? null;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM emails WHERE id = ?').run(id).changes > 0;
  }

  // --- Anhaenge -----------------------------------------------------------

  addAttachment(input: {
    emailId: string;
    filename: string;
    path: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
  }): AttachmentRow {
    const row: AttachmentRow = {
      id: newId('att'),
      email_id: input.emailId,
      filename: input.filename,
      path: input.path,
      mime_type: input.mimeType ?? null,
      size_bytes: input.sizeBytes ?? null,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO email_attachments (id, email_id, filename, path, mime_type, size_bytes, created_at)
         VALUES (@id, @email_id, @filename, @path, @mime_type, @size_bytes, @created_at)`,
      )
      .run(row);
    return row;
  }

  attachmentsOf(emailId: string): AttachmentRow[] {
    return this.db
      .prepare('SELECT * FROM email_attachments WHERE email_id = ? ORDER BY created_at')
      .all(emailId) as AttachmentRow[];
  }

  removeAttachment(id: string): boolean {
    return this.db.prepare('DELETE FROM email_attachments WHERE id = ?').run(id).changes > 0;
  }

  // --- Eingang / Verlauf --------------------------------------------------

  recordIncoming(input: {
    fromAddress: string;
    subject: string;
    bodyText: string;
    receivedAt: string;
    messageId?: string | null;
    inReplyTo?: string | null;
    companyId?: string | null;
    threadKey?: string | null;
  }): EmailRow {
    const ts = nowIso();
    const row: EmailRow = {
      id: newId('mail'),
      campaign_id: null,
      company_id: input.companyId ?? null,
      contact_id: null,
      direction: 'eingehend',
      to_address: input.fromAddress,
      to_name: null,
      cc: null,
      bcc: null,
      from_address: input.fromAddress,
      reply_to: null,
      subject: input.subject,
      body_text: input.bodyText,
      body_html: null,
      status: 'eingegangen',
      approval_id: null,
      content_hash: contentHash([input.messageId, input.subject, input.bodyText]),
      provider: 'imap',
      message_id: input.messageId ?? null,
      in_reply_to: input.inReplyTo ?? null,
      thread_key: input.threadKey ?? null,
      error: null,
      sent_at: null,
      received_at: input.receivedAt,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO emails (id, campaign_id, company_id, contact_id, direction, to_address, to_name,
            cc, bcc, from_address, reply_to, subject, body_text, body_html, status, approval_id,
            content_hash, provider, message_id, in_reply_to, thread_key, error, sent_at, received_at,
            created_at, updated_at)
         VALUES (@id, @campaign_id, @company_id, @contact_id, @direction, @to_address, @to_name,
            @cc, @bcc, @from_address, @reply_to, @subject, @body_text, @body_html, @status, @approval_id,
            @content_hash, @provider, @message_id, @in_reply_to, @thread_key, @error, @sent_at, @received_at,
            @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  existsMessageId(messageId: string): boolean {
    const r = this.db.prepare('SELECT 1 AS x FROM emails WHERE message_id = ? LIMIT 1').get(messageId);
    return Boolean(r);
  }

  addInteraction(input: {
    companyId?: string | null;
    contactId?: string | null;
    emailId?: string | null;
    kind: string;
    direction: 'ausgehend' | 'eingehend';
    summary: string;
    occurredAt?: string;
  }): InteractionRow {
    const row: InteractionRow = {
      id: newId('int'),
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      email_id: input.emailId ?? null,
      kind: input.kind,
      direction: input.direction,
      occurred_at: input.occurredAt ?? nowIso(),
      summary: input.summary,
    };
    this.db
      .prepare(
        `INSERT INTO interaction_history (id, company_id, contact_id, email_id, kind, direction, occurred_at, summary)
         VALUES (@id, @company_id, @contact_id, @email_id, @kind, @direction, @occurred_at, @summary)`,
      )
      .run(row);
    return row;
  }

  historyOf(companyId: string, limit = 50): InteractionRow[] {
    return this.db
      .prepare('SELECT * FROM interaction_history WHERE company_id = ? ORDER BY occurred_at DESC LIMIT ?')
      .all(companyId, limit) as InteractionRow[];
  }
}

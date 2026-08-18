import { Db, nowIso, parseJson } from '../database';
import type { Approval } from '../../../shared/types';
import { ApprovalStatus } from '../../../shared/status';

export interface ApprovalInput {
  action: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  contentHash: string;
  expiresAt?: string | null;
}

const map = (row: Record<string, unknown>): Approval => ({
  id: Number(row.id),
  action: String(row.action),
  title: String(row.title),
  summary: String(row.summary),
  payload: parseJson<Record<string, unknown>>(row.payload, {}),
  contentHash: String(row.content_hash),
  status: String(row.status) as ApprovalStatus,
  requestedAt: String(row.requested_at),
  decidedAt: (row.decided_at as string | null) ?? null,
  decidedBy: (row.decided_by as string | null) ?? null,
  note: (row.note as string | null) ?? null,
  expiresAt: (row.expires_at as string | null) ?? null
});

export class ApprovalRepo {
  constructor(private readonly db: Db) {}

  create(input: ApprovalInput): Approval {
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO approvals (action, title, summary, payload, content_hash, status, requested_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.action,
        input.title,
        input.summary,
        JSON.stringify(input.payload),
        input.contentHash,
        ApprovalStatus.OFFEN,
        nowIso(),
        input.expiresAt ?? null
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): Approval | null {
    const row = this.db.get('SELECT * FROM approvals WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  open(): Approval[] {
    return this.db
      .all('SELECT * FROM approvals WHERE status = ? ORDER BY id DESC', [ApprovalStatus.OFFEN])
      .map(map);
  }

  list(limit = 100): Approval[] {
    return this.db.all('SELECT * FROM approvals ORDER BY id DESC LIMIT ?', [limit]).map(map);
  }

  setStatus(id: number, status: ApprovalStatus, decidedBy: string | null, note?: string | null): Approval | null {
    this.db.run('UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, note = ? WHERE id = ?', [
      status,
      nowIso(),
      decidedBy,
      note ?? null,
      id
    ]);
    return this.byId(id);
  }

  /** Läuft über alle offenen Freigaben und markiert abgelaufene. */
  expireOverdue(now = new Date()): number {
    const rows = this.db.all<{ id: number; expires_at: string | null }>(
      'SELECT id, expires_at FROM approvals WHERE status = ?',
      [ApprovalStatus.OFFEN]
    );
    let count = 0;
    for (const row of rows) {
      if (!row.expires_at) continue;
      if (new Date(String(row.expires_at)).getTime() <= now.getTime()) {
        this.setStatus(Number(row.id), ApprovalStatus.ABGELAUFEN, 'SYSTEM', 'Zeitlich abgelaufen');
        count++;
      }
    }
    return count;
  }
}

import type { Db } from '../database.js';
import type { ApprovalRow, ApprovalStatus } from '../schema.js';
import { newId, nowIso } from '../../util/text.js';

export interface ApprovalInput {
  actionType: string;
  title: string;
  summary: string;
  payload: unknown;
  contentHash?: string | null;
  risk?: 'niedrig' | 'mittel' | 'hoch';
  requestedBy: string;
  expiresAt?: string | null;
}

export class ApprovalRepo {
  constructor(private readonly db: Db) {}

  create(input: ApprovalInput): ApprovalRow {
    const row: ApprovalRow = {
      id: newId('apr'),
      action_type: input.actionType,
      title: input.title,
      summary: input.summary,
      payload_json: JSON.stringify(input.payload ?? null),
      content_hash: input.contentHash ?? null,
      risk: input.risk ?? 'mittel',
      status: 'offen',
      requested_by: input.requestedBy,
      requested_at: nowIso(),
      decided_at: null,
      decided_by: null,
      decision_note: null,
      executed_at: null,
      result_json: null,
      expires_at: input.expiresAt ?? null,
    };
    this.db
      .prepare(
        `INSERT INTO approvals (id, action_type, title, summary, payload_json, content_hash, risk,
            status, requested_by, requested_at, decided_at, decided_by, decision_note, executed_at,
            result_json, expires_at)
         VALUES (@id, @action_type, @title, @summary, @payload_json, @content_hash, @risk,
            @status, @requested_by, @requested_at, @decided_at, @decided_by, @decision_note, @executed_at,
            @result_json, @expires_at)`,
      )
      .run(row);
    return row;
  }

  get(id: string): ApprovalRow | undefined {
    return this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined;
  }

  /** Offene Freigaben, aelteste zuerst -- "Nummer 4 freigeben" zaehlt hierauf. */
  pending(limit = 100): ApprovalRow[] {
    return this.db
      .prepare(`SELECT * FROM approvals WHERE status = 'offen' ORDER BY requested_at ASC LIMIT ?`)
      .all(limit) as ApprovalRow[];
  }

  list(filter: { status?: ApprovalStatus; limit?: number } = {}): ApprovalRow[] {
    if (filter.status) {
      return this.db
        .prepare('SELECT * FROM approvals WHERE status = ? ORDER BY requested_at DESC LIMIT ?')
        .all(filter.status, filter.limit ?? 100) as ApprovalRow[];
    }
    return this.db
      .prepare('SELECT * FROM approvals ORDER BY requested_at DESC LIMIT ?')
      .all(filter.limit ?? 100) as ApprovalRow[];
  }

  /** Findet die letzte offene oder freigegebene Anfrage zu einem Objekt. */
  findLatestFor(actionType: string, entityId: string): ApprovalRow | undefined {
    return this.db
      .prepare(
        `SELECT * FROM approvals WHERE action_type = ?
           AND json_extract(payload_json, '$.entityId') = ?
         ORDER BY requested_at DESC LIMIT 1`,
      )
      .get(actionType, entityId) as ApprovalRow | undefined;
  }

  decide(id: string, status: Extract<ApprovalStatus, 'freigegeben' | 'abgelehnt' | 'abgelaufen'>, by: string, note?: string): ApprovalRow | undefined {
    this.db
      .prepare('UPDATE approvals SET status = ?, decided_at = ?, decided_by = ?, decision_note = ? WHERE id = ? AND status = ?')
      .run(status, nowIso(), by, note ?? null, id, 'offen');
    return this.get(id);
  }

  markExecuted(id: string, ok: boolean, result: unknown): ApprovalRow | undefined {
    this.db
      .prepare('UPDATE approvals SET status = ?, executed_at = ?, result_json = ? WHERE id = ?')
      .run(ok ? 'ausgefuehrt' : 'fehlgeschlagen', nowIso(), JSON.stringify(result ?? null), id);
    return this.get(id);
  }

  /** Setzt abgelaufene Anfragen um; liefert die Anzahl. */
  expireOverdue(now = nowIso()): number {
    return this.db
      .prepare(`UPDATE approvals SET status='abgelaufen', decided_at=? WHERE status='offen' AND expires_at IS NOT NULL AND expires_at < ?`)
      .run(now, now).changes;
  }

  payloadOf<T = unknown>(row: ApprovalRow): T {
    return JSON.parse(row.payload_json) as T;
  }
}

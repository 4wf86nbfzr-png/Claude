import { Db, nowIso, parseJson } from '../database';
import type { AuditEntry } from '../../../shared/types';

export interface AuditInput {
  actor: AuditEntry['actor'];
  agent?: string | null;
  action: string;
  target?: string | null;
  status?: AuditEntry['status'];
  detail?: Record<string, unknown> | null;
}

const map = (row: Record<string, unknown>): AuditEntry => ({
  id: Number(row.id),
  ts: String(row.ts),
  actor: String(row.actor) as AuditEntry['actor'],
  agent: (row.agent as string | null) ?? null,
  action: String(row.action),
  target: (row.target as string | null) ?? null,
  status: String(row.status) as AuditEntry['status'],
  detail: row.detail ? parseJson<Record<string, unknown>>(row.detail, {}) : null
});

export class AuditRepo {
  constructor(private readonly db: Db) {}

  append(input: AuditInput): AuditEntry {
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO audit_logs (ts, actor, agent, action, target, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        nowIso(),
        input.actor,
        input.agent ?? null,
        input.action,
        input.target ?? null,
        input.status ?? 'INFO',
        input.detail ? JSON.stringify(input.detail) : null
      ]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): AuditEntry | null {
    const row = this.db.get('SELECT * FROM audit_logs WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  recent(limit = 200, since?: string): AuditEntry[] {
    if (since) {
      return this.db
        .all('SELECT * FROM audit_logs WHERE ts >= ? ORDER BY id DESC LIMIT ?', [since, limit])
        .map(map);
    }
    return this.db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?', [limit]).map(map);
  }
}

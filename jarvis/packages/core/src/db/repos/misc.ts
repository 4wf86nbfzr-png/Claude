import type { Db } from '../database.js';
import type {
  AuditRow,
  ConversationRow,
  MemoryRow,
  MessageRow,
  SuppressionRow,
  TaskRow,
} from '../schema.js';
import { newId, nowIso, registrableDomain } from '../../util/text.js';

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get<T = unknown>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined;
    if (!row) return fallback;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return fallback;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value ?? null), nowIso());
  }

  all(): Record<string, unknown> {
    const rows = this.db.prepare('SELECT key, value_json FROM settings').all() as Array<{
      key: string;
      value_json: string;
    }>;
    const out: Record<string, unknown> = {};
    for (const r of rows) {
      try {
        out[r.key] = JSON.parse(r.value_json);
      } catch {
        out[r.key] = null;
      }
    }
    return out;
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}

// ---------------------------------------------------------------------------
// Audit-Log
// ---------------------------------------------------------------------------

export interface AuditInput {
  actor: string;
  action: string;
  summary: string;
  entityType?: string | null;
  entityId?: string | null;
  detail?: unknown;
  outcome?: 'ok' | 'fehler' | 'abgebrochen';
}

export class AuditRepo {
  constructor(private readonly db: Db) {}

  append(input: AuditInput): AuditRow {
    const row: AuditRow = {
      id: newId('log'),
      ts: nowIso(),
      actor: input.actor,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      detail_json: input.detail === undefined ? null : safeJson(input.detail),
      outcome: input.outcome ?? 'ok',
    };
    this.db
      .prepare(
        `INSERT INTO audit_logs (id, ts, actor, action, entity_type, entity_id, summary, detail_json, outcome)
         VALUES (@id, @ts, @actor, @action, @entity_type, @entity_id, @summary, @detail_json, @outcome)`,
      )
      .run(row);
    return row;
  }

  list(filter: { entityType?: string; entityId?: string; since?: string; limit?: number } = {}): AuditRow[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.entityType) {
      where.push('entity_type = @entityType');
      params.entityType = filter.entityType;
    }
    if (filter.entityId) {
      where.push('entity_id = @entityId');
      params.entityId = filter.entityId;
    }
    if (filter.since) {
      where.push('ts >= @since');
      params.since = filter.since;
    }
    params.limit = filter.limit ?? 200;
    return this.db
      .prepare(
        `SELECT * FROM audit_logs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ts DESC LIMIT @limit`,
      )
      .all(params) as AuditRow[];
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return JSON.stringify({ hinweis: 'nicht serialisierbar', typ: typeof v });
  }
}

// ---------------------------------------------------------------------------
// Sperrliste (Do-not-contact)
// ---------------------------------------------------------------------------

export class SuppressionRepo {
  constructor(private readonly db: Db) {}

  add(input: { scope: 'email' | 'domain' | 'firma'; value: string; reason?: string; source?: string }): SuppressionRow {
    const norm = normalizeSuppression(input.scope, input.value);
    const existing = this.db
      .prepare('SELECT * FROM suppression_list WHERE scope = ? AND value_norm = ?')
      .get(input.scope, norm) as SuppressionRow | undefined;
    if (existing) return existing;

    const row: SuppressionRow = {
      id: newId('sup'),
      scope: input.scope,
      value_norm: norm,
      reason: input.reason ?? null,
      source: input.source ?? 'manuell',
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO suppression_list (id, scope, value_norm, reason, source, created_at)
         VALUES (@id, @scope, @value_norm, @reason, @source, @created_at)`,
      )
      .run(row);
    return row;
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM suppression_list WHERE id = ?').run(id).changes > 0;
  }

  list(): SuppressionRow[] {
    return this.db.prepare('SELECT * FROM suppression_list ORDER BY created_at DESC').all() as SuppressionRow[];
  }

  find(scope: 'email' | 'domain' | 'firma', value: string): SuppressionRow | undefined {
    return this.db
      .prepare('SELECT * FROM suppression_list WHERE scope = ? AND value_norm = ?')
      .get(scope, normalizeSuppression(scope, value)) as SuppressionRow | undefined;
  }
}

export function normalizeSuppression(scope: 'email' | 'domain' | 'firma', value: string): string {
  const v = value.trim().toLowerCase();
  if (scope === 'domain') return registrableDomain(v.replace(/^https?:\/\//, '').split('/')[0] ?? v);
  return v;
}

// ---------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------

export class TaskRepo {
  constructor(private readonly db: Db) {}

  create(input: { title: string; dueAt?: string | null; notes?: string | null; entityType?: string | null; entityId?: string | null }): TaskRow {
    const ts = nowIso();
    const row: TaskRow = {
      id: newId('task'),
      title: input.title,
      status: 'offen',
      due_at: input.dueAt ?? null,
      notes: input.notes ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      created_at: ts,
      updated_at: ts,
    };
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, status, due_at, notes, entity_type, entity_id, created_at, updated_at)
         VALUES (@id, @title, @status, @due_at, @notes, @entity_type, @entity_id, @created_at, @updated_at)`,
      )
      .run(row);
    return row;
  }

  setStatus(id: string, status: TaskRow['status']): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
  }

  list(filter: { status?: TaskRow['status']; limit?: number } = {}): TaskRow[] {
    if (filter.status) {
      return this.db
        .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY COALESCE(due_at, created_at) LIMIT ?')
        .all(filter.status, filter.limit ?? 100) as TaskRow[];
    }
    return this.db
      .prepare('SELECT * FROM tasks ORDER BY COALESCE(due_at, created_at) LIMIT ?')
      .all(filter.limit ?? 100) as TaskRow[];
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
  }
}

// ---------------------------------------------------------------------------
// Gedaechtnis
// ---------------------------------------------------------------------------

export class MemoryRepo {
  constructor(private readonly db: Db) {}

  set(input: { kind: string; key: string; value: string; importance?: number; source?: string; expiresAt?: string | null }): MemoryRow {
    const ts = nowIso();
    const existing = this.db
      .prepare('SELECT * FROM memory_items WHERE kind = ? AND key = ?')
      .get(input.kind, input.key) as MemoryRow | undefined;

    if (existing) {
      const next: MemoryRow = {
        ...existing,
        value: input.value,
        importance: input.importance ?? existing.importance,
        source: input.source ?? existing.source,
        expires_at: input.expiresAt ?? existing.expires_at,
        updated_at: ts,
      };
      this.db
        .prepare(
          'UPDATE memory_items SET value=@value, importance=@importance, source=@source, expires_at=@expires_at, updated_at=@updated_at WHERE id=@id',
        )
        .run(next);
      return next;
    }

    const row: MemoryRow = {
      id: newId('mem'),
      kind: input.kind,
      key: input.key,
      value: input.value,
      importance: input.importance ?? 1,
      source: input.source ?? null,
      created_at: ts,
      updated_at: ts,
      expires_at: input.expiresAt ?? null,
    };
    this.db
      .prepare(
        `INSERT INTO memory_items (id, kind, key, value, importance, source, created_at, updated_at, expires_at)
         VALUES (@id, @kind, @key, @value, @importance, @source, @created_at, @updated_at, @expires_at)`,
      )
      .run(row);
    return row;
  }

  list(kind?: string): MemoryRow[] {
    const now = nowIso();
    if (kind) {
      return this.db
        .prepare('SELECT * FROM memory_items WHERE kind = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY importance DESC, updated_at DESC')
        .all(kind, now) as MemoryRow[];
    }
    return this.db
      .prepare('SELECT * FROM memory_items WHERE expires_at IS NULL OR expires_at > ? ORDER BY importance DESC, updated_at DESC')
      .all(now) as MemoryRow[];
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM memory_items WHERE id = ?').run(id).changes > 0;
  }

  deleteAll(kind?: string): number {
    return kind
      ? this.db.prepare('DELETE FROM memory_items WHERE kind = ?').run(kind).changes
      : this.db.prepare('DELETE FROM memory_items').run().changes;
  }
}

// ---------------------------------------------------------------------------
// Gespraeche
// ---------------------------------------------------------------------------

export class ConversationRepo {
  constructor(private readonly db: Db) {}

  create(title: string): ConversationRow {
    const ts = nowIso();
    const row: ConversationRow = { id: newId('conv'), title, created_at: ts, updated_at: ts };
    this.db
      .prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (@id, @title, @created_at, @updated_at)')
      .run(row);
    return row;
  }

  get(id: string): ConversationRow | undefined {
    return this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined;
  }

  list(limit = 30): ConversationRow[] {
    return this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?').all(limit) as ConversationRow[];
  }

  rename(id: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, nowIso(), id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id).changes > 0;
  }

  addMessage(input: {
    conversationId: string;
    role: MessageRow['role'];
    content: string;
    agent?: string | null;
    toolCalls?: unknown;
    toolCallId?: string | null;
  }): MessageRow {
    const row: MessageRow = {
      id: newId('msg'),
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      agent: input.agent ?? null,
      tool_calls_json: input.toolCalls === undefined ? null : safeJson(input.toolCalls),
      tool_call_id: input.toolCallId ?? null,
      created_at: nowIso(),
    };
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, agent, tool_calls_json, tool_call_id, created_at)
         VALUES (@id, @conversation_id, @role, @content, @agent, @tool_calls_json, @tool_call_id, @created_at)`,
      )
      .run(row);
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(row.created_at, input.conversationId);
    return row;
  }

  messages(conversationId: string, limit = 200): MessageRow[] {
    return this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at LIMIT ?')
      .all(conversationId, limit) as MessageRow[];
  }
}

import type { Database } from '../database.js';
import { nowIso } from '../../util/id.js';
import type {
  AuditEntry,
  CampaignRecord,
  ChatMessage,
  MemoryEntry,
  MemoryKind,
} from './row-types.js';

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

interface CampaignRow {
  id: number;
  name: string;
  service: string;
  region: string | null;
  target_count: number;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

const toCampaign = (row: CampaignRow): CampaignRecord => ({
  id: row.id,
  name: row.name,
  service: row.service,
  region: row.region,
  targetCount: row.target_count,
  notes: row.notes,
  status: row.status as CampaignRecord['status'],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class CampaignRepository {
  constructor(private readonly db: Database) {}

  create(input: { name: string; service: string; region?: string | null; targetCount?: number; notes?: string | null }): CampaignRecord {
    const at = nowIso();
    const existing = this.findByName(input.name);
    if (existing) return existing;
    const result = this.db
      .prepare(
        'INSERT INTO outreach_campaigns (name, service, region, target_count, notes, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        input.name.trim(),
        input.service,
        input.region ?? null,
        input.targetCount ?? 25,
        input.notes ?? null,
        'aktiv',
        at,
        at,
      );
    return this.get(result.lastInsertRowid)!;
  }

  get(id: number): CampaignRecord | null {
    const row = this.db.prepare('SELECT * FROM outreach_campaigns WHERE id = ?').get<CampaignRow>(id);
    return row ? toCampaign(row) : null;
  }

  findByName(name: string): CampaignRecord | null {
    const row = this.db
      .prepare('SELECT * FROM outreach_campaigns WHERE lower(name) = ?')
      .get<CampaignRow>(name.trim().toLowerCase());
    return row ? toCampaign(row) : null;
  }

  list(): CampaignRecord[] {
    return this.db
      .prepare('SELECT * FROM outreach_campaigns ORDER BY updated_at DESC')
      .all<CampaignRow>()
      .map(toCampaign);
  }

  update(id: number, patch: Partial<CampaignRecord>): CampaignRecord | null {
    const map: Record<string, string> = {
      name: 'name',
      service: 'service',
      region: 'region',
      targetCount: 'target_count',
      notes: 'notes',
      status: 'status',
    };
    const fields: string[] = [];
    const values: Array<string | number | null> = [];
    for (const [key, column] of Object.entries(map)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        fields.push(`${column} = ?`);
        values.push(value as string | number | null);
      }
    }
    if (!fields.length) return this.get(id);
    fields.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE outreach_campaigns SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.get(id);
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM outreach_campaigns WHERE id = ?').run(id).changes > 0;
  }
}

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

interface AuditRow {
  id: number;
  at: string;
  actor: string;
  agent: string | null;
  action: string;
  subject: string | null;
  outcome: string;
  detail: string | null;
}

export class AuditRepository {
  constructor(private readonly db: Database) {}

  append(entry: Omit<AuditEntry, 'id' | 'at'> & { at?: string }): AuditEntry {
    const at = entry.at ?? nowIso();
    const result = this.db
      .prepare('INSERT INTO audit_logs (at, actor, agent, action, subject, outcome, detail) VALUES (?,?,?,?,?,?,?)')
      .run(
        at,
        entry.actor,
        entry.agent ?? null,
        entry.action,
        entry.subject ?? null,
        entry.outcome,
        entry.detail ? entry.detail.slice(0, 4000) : null,
      );
    return {
      id: result.lastInsertRowid,
      at,
      actor: entry.actor,
      agent: entry.agent ?? null,
      action: entry.action,
      subject: entry.subject ?? null,
      outcome: entry.outcome,
      detail: entry.detail ?? null,
    };
  }

  list(limit = 200): AuditEntry[] {
    return this.db
      .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
      .all<AuditRow>(limit)
      .map((row) => ({
        id: row.id,
        at: row.at,
        actor: row.actor as AuditEntry['actor'],
        agent: row.agent,
        action: row.action,
        subject: row.subject,
        outcome: row.outcome as AuditEntry['outcome'],
        detail: row.detail,
      }));
  }

  all(): AuditEntry[] {
    return this.list(100_000);
  }
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

interface MemoryRow {
  id: number;
  kind: string;
  key: string | null;
  value: string;
  scope: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

const toMemory = (row: MemoryRow): MemoryEntry => ({
  id: row.id,
  kind: row.kind as MemoryKind,
  key: row.key,
  value: row.value,
  scope: row.scope,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  expiresAt: row.expires_at,
});

export class MemoryRepository {
  constructor(private readonly db: Database) {}

  put(input: { kind: MemoryKind; key?: string | null; value: string; scope?: string | null; expiresAt?: string | null }): MemoryEntry {
    const at = nowIso();
    if (input.key) {
      this.db
        .prepare(
          `INSERT INTO memory (kind, key, value, scope, created_at, updated_at, expires_at)
           VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(kind, key) WHERE key IS NOT NULL DO UPDATE SET
             value = excluded.value, scope = excluded.scope,
             updated_at = excluded.updated_at, expires_at = excluded.expires_at`,
        )
        .run(input.kind, input.key, input.value, input.scope ?? null, at, at, input.expiresAt ?? null);
      return this.db
        .prepare('SELECT * FROM memory WHERE kind = ? AND key = ?')
        .all<MemoryRow>(input.kind, input.key)
        .map(toMemory)[0]!;
    }
    const result = this.db
      .prepare('INSERT INTO memory (kind, key, value, scope, created_at, updated_at, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(input.kind, null, input.value, input.scope ?? null, at, at, input.expiresAt ?? null);
    return toMemory(this.db.prepare('SELECT * FROM memory WHERE id = ?').get<MemoryRow>(result.lastInsertRowid)!);
  }

  get(kind: MemoryKind, key: string): MemoryEntry | null {
    const row = this.db
      .prepare('SELECT * FROM memory WHERE kind = ? AND key = ?')
      .get<MemoryRow>(kind, key);
    return row ? toMemory(row) : null;
  }

  list(kind?: string, limit = 500): MemoryEntry[] {
    if (kind) {
      return this.db
        .prepare('SELECT * FROM memory WHERE kind = ? ORDER BY updated_at DESC LIMIT ?')
        .all<MemoryRow>(kind, limit)
        .map(toMemory);
    }
    return this.db
      .prepare('SELECT * FROM memory ORDER BY updated_at DESC LIMIT ?')
      .all<MemoryRow>(limit)
      .map(toMemory);
  }

  remove(id: number): boolean {
    return this.db.prepare('DELETE FROM memory WHERE id = ?').run(id).changes > 0;
  }

  clear(kind?: string): number {
    if (kind) return this.db.prepare('DELETE FROM memory WHERE kind = ?').run(kind).changes;
    return this.db.prepare('DELETE FROM memory').run().changes;
  }

  purgeExpired(): number {
    return this.db
      .prepare('DELETE FROM memory WHERE expires_at IS NOT NULL AND expires_at < ?')
      .run(nowIso()).changes;
  }
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  text: string;
  tool_calls: string;
  spoken: number;
  created_at: string;
}

export class ConversationRepository {
  constructor(private readonly db: Database) {}

  ensure(id: string, title?: string): void {
    const at = nowIso();
    this.db
      .prepare('INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at) VALUES (?,?,?,?)')
      .run(id, title ?? null, at, at);
  }

  append(message: ChatMessage): ChatMessage {
    this.ensure(message.conversationId);
    this.db
      .prepare(
        'INSERT OR REPLACE INTO messages (id, conversation_id, role, text, tool_calls, spoken, created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        message.id,
        message.conversationId,
        message.role,
        message.text,
        JSON.stringify(message.toolCalls ?? []),
        message.spoken ? 1 : 0,
        message.createdAt,
      );
    this.db
      .prepare('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(message.createdAt, message.conversationId);
    return message;
  }

  history(conversationId: string, limit = 100): ChatMessage[] {
    return this.db
      .prepare(
        'SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC',
      )
      .all<MessageRow>(conversationId, limit)
      .map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        role: row.role as ChatMessage['role'],
        text: row.text,
        toolCalls: JSON.parse(row.tool_calls) as ChatMessage['toolCalls'],
        spoken: row.spoken === 1,
        createdAt: row.created_at,
      }));
  }

  latestConversationId(): string | null {
    const row = this.db
      .prepare('SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 1')
      .get<{ id: string }>();
    return row?.id ?? null;
  }

  purgeOlderThan(iso: string): number {
    return this.db.prepare('DELETE FROM conversations WHERE updated_at < ?').run(iso).changes;
  }
}

/* ------------------------------------------------------------------ */
/* Key/value settings                                                  */
/* ------------------------------------------------------------------ */

export class KeyValueRepository {
  constructor(private readonly db: Database) {}

  get(key: string): string | null {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').get<{ value: string }>(key)?.value ?? null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  }

  remove(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}

/* ------------------------------------------------------------------ */
/* Tasks                                                               */
/* ------------------------------------------------------------------ */

export interface TaskRecord {
  id: number;
  title: string;
  detail: string | null;
  status: 'offen' | 'erledigt' | 'verworfen';
  dueAt: string | null;
  companyId: number | null;
  campaignId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TaskRow {
  id: number;
  title: string;
  detail: string | null;
  status: string;
  due_at: string | null;
  company_id: number | null;
  campaign_id: number | null;
  created_at: string;
  updated_at: string;
}

const toTask = (row: TaskRow): TaskRecord => ({
  id: row.id,
  title: row.title,
  detail: row.detail,
  status: row.status as TaskRecord['status'],
  dueAt: row.due_at,
  companyId: row.company_id,
  campaignId: row.campaign_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class TaskRepository {
  constructor(private readonly db: Database) {}

  create(input: { title: string; detail?: string | null; dueAt?: string | null; companyId?: number | null; campaignId?: number | null }): TaskRecord {
    const at = nowIso();
    const result = this.db
      .prepare(
        'INSERT INTO tasks (title, detail, status, due_at, company_id, campaign_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        input.title,
        input.detail ?? null,
        'offen',
        input.dueAt ?? null,
        input.companyId ?? null,
        input.campaignId ?? null,
        at,
        at,
      );
    return toTask(this.db.prepare('SELECT * FROM tasks WHERE id = ?').get<TaskRow>(result.lastInsertRowid)!);
  }

  open(): TaskRecord[] {
    return this.db
      .prepare("SELECT * FROM tasks WHERE status = 'offen' ORDER BY COALESCE(due_at, '9999') ASC, id ASC")
      .all<TaskRow>()
      .map(toTask);
  }

  setStatus(id: number, status: TaskRecord['status']): void {
    this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
  }
}

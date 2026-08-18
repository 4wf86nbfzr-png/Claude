import { Db, nowIso } from '../database';
import type { MemoryItem } from '../../../shared/types';

const map = (row: Record<string, unknown>): MemoryItem => ({
  id: Number(row.id),
  scope: String(row.scope) as MemoryItem['scope'],
  key: String(row.key),
  value: String(row.value),
  importance: Number(row.importance),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

/**
 * Strukturiertes Gedächtnis (§13).
 *
 * Bewusst schlüsselbasiert: JARVIS legt einzelne, benannte Merkposten ab
 * ("bevorzugte Anrede", "Standardleistung"), nicht ganze Gesprächsverläufe.
 * Der Gesprächsverlauf liegt getrennt in `conversation_messages` und wird
 * standardmäßig nur für die laufende Sitzung gehalten.
 */
export class MemoryRepo {
  constructor(private readonly db: Db) {}

  remember(scope: MemoryItem['scope'], key: string, value: string, importance = 1): MemoryItem {
    const ts = nowIso();
    this.db.run(
      `INSERT INTO memory_items (scope, key, value, importance, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, importance = excluded.importance, updated_at = excluded.updated_at`,
      [scope, key, value, importance, ts, ts]
    );
    return this.get(scope, key)!;
  }

  get(scope: MemoryItem['scope'], key: string): MemoryItem | null {
    const row = this.db.get('SELECT * FROM memory_items WHERE scope = ? AND key = ?', [scope, key]);
    return row ? map(row) : null;
  }

  list(scope?: MemoryItem['scope']): MemoryItem[] {
    if (scope) {
      return this.db
        .all('SELECT * FROM memory_items WHERE scope = ? ORDER BY importance DESC, updated_at DESC', [scope])
        .map(map);
    }
    return this.db.all('SELECT * FROM memory_items ORDER BY scope, importance DESC, updated_at DESC').map(map);
  }

  forget(id: number): boolean {
    return this.db.run('DELETE FROM memory_items WHERE id = ?', [id]).changes > 0;
  }

  forgetScope(scope: MemoryItem['scope']): number {
    return this.db.run('DELETE FROM memory_items WHERE scope = ?', [scope]).changes;
  }
}

export interface StoredMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agent: string | null;
  createdAt: string;
}

export class ConversationRepo {
  constructor(private readonly db: Db) {}

  append(sessionId: string, role: StoredMessage['role'], content: string, agent: string | null = null): StoredMessage {
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO conversation_messages (session_id, role, content, agent, created_at) VALUES (?, ?, ?, ?, ?)',
      [sessionId, role, content, agent, nowIso()]
    );
    return {
      id: lastInsertRowid,
      sessionId,
      role,
      content,
      agent,
      createdAt: nowIso()
    };
  }

  history(sessionId: string, limit = 40): StoredMessage[] {
    const rows = this.db.all(
      'SELECT * FROM conversation_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?',
      [sessionId, limit]
    );
    return rows
      .map((row) => ({
        id: Number(row.id),
        sessionId: String(row.session_id),
        role: String(row.role) as StoredMessage['role'],
        content: String(row.content),
        agent: (row.agent as string | null) ?? null,
        createdAt: String(row.created_at)
      }))
      .reverse();
  }

  clear(sessionId?: string): number {
    if (sessionId) {
      return this.db.run('DELETE FROM conversation_messages WHERE session_id = ?', [sessionId]).changes;
    }
    return this.db.run('DELETE FROM conversation_messages', []).changes;
  }
}

export class SettingsRepo {
  constructor(private readonly db: Db) {}

  get(key: string): string | null {
    const row = this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? String(row.value) : null;
  }

  set(key: string, value: string): void {
    this.db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()]
    );
  }

  all(): Record<string, string> {
    const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((row) => [String(row.key), String(row.value)]));
  }
}

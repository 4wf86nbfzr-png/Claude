import { Db, nowIso } from '../database';
import type { TaskRecord } from '../../../shared/types';

const map = (row: Record<string, unknown>): TaskRecord => ({
  id: Number(row.id),
  title: String(row.title),
  detail: (row.detail as string | null) ?? null,
  status: String(row.status) as TaskRecord['status'],
  dueAt: (row.due_at as string | null) ?? null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export class TaskRepo {
  constructor(private readonly db: Db) {}

  create(title: string, detail?: string | null, dueAt?: string | null): TaskRecord {
    const ts = nowIso();
    const { lastInsertRowid } = this.db.run(
      'INSERT INTO tasks (title, detail, status, due_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [title.trim(), detail ?? null, 'OFFEN', dueAt ?? null, ts, ts]
    );
    return this.byId(lastInsertRowid)!;
  }

  byId(id: number): TaskRecord | null {
    const row = this.db.get('SELECT * FROM tasks WHERE id = ?', [id]);
    return row ? map(row) : null;
  }

  list(status?: TaskRecord['status']): TaskRecord[] {
    if (status) {
      return this.db
        .all('SELECT * FROM tasks WHERE status = ? ORDER BY IFNULL(due_at, \'9999\'), id', [status])
        .map(map);
    }
    return this.db.all('SELECT * FROM tasks ORDER BY IFNULL(due_at, \'9999\'), id').map(map);
  }

  setStatus(id: number, status: TaskRecord['status']): TaskRecord | null {
    this.db.run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, nowIso(), id]);
    return this.byId(id);
  }

  delete(id: number): boolean {
    return this.db.run('DELETE FROM tasks WHERE id = ?', [id]).changes > 0;
  }
}

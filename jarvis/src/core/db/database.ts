import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS } from './schema';

export type SqlValue = string | number | null | Uint8Array;

/**
 * Dünne Hülle um `node:sqlite` (in Node 22 eingebaut).
 *
 * Bewusst kein natives npm-Modul: better-sqlite3 müsste für jede
 * Electron-Version neu kompiliert werden, was Installation und
 * Auslieferung unnötig zerbrechlich macht.
 */
export class Db {
  private constructor(private readonly handle: DatabaseSync, readonly path: string) {}

  static open(path: string): Db {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    const handle = new DatabaseSync(path);
    handle.exec('PRAGMA journal_mode = WAL');
    handle.exec('PRAGMA foreign_keys = ON');
    const db = new Db(handle, path);
    db.migrate();
    return db;
  }

  /** Führt alle noch nicht angewendeten Migrationen aus. */
  private migrate(): void {
    const row = this.handle.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    const current = Number(row?.user_version ?? 0);
    for (let version = current; version < MIGRATIONS.length; version++) {
      const sql = MIGRATIONS[version];
      if (!sql) continue;
      this.handle.exec('BEGIN');
      try {
        this.handle.exec(sql);
        // PRAGMA erlaubt keine Platzhalter, die Zahl stammt aus dem Code.
        this.handle.exec(`PRAGMA user_version = ${version + 1}`);
        this.handle.exec('COMMIT');
      } catch (error) {
        this.handle.exec('ROLLBACK');
        throw new Error(`Migration ${version + 1} fehlgeschlagen: ${(error as Error).message}`);
      }
    }
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    return this.handle.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.handle.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, params: SqlValue[] = []): { changes: number; lastInsertRowid: number } {
    const result = this.handle.prepare(sql).run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: Number(result.lastInsertRowid)
    };
  }

  exec(sql: string): void {
    this.handle.exec(sql);
  }

  /** Führt `fn` in einer Transaktion aus; bei Fehler wird zurückgerollt. */
  tx<T>(fn: () => T): T {
    this.handle.exec('BEGIN');
    try {
      const result = fn();
      this.handle.exec('COMMIT');
      return result;
    } catch (error) {
      this.handle.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.handle.close();
  }
}

export const nowIso = (): string => new Date().toISOString();

/** JSON-Spalten sicher lesen – eine kaputte Zeile darf nicht die App stoppen. */
export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

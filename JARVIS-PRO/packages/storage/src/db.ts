import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Persistenzschicht.
 *
 * Bewusst hinter einem schmalen Interface: SQLite traegt die lokale
 * Entwicklung und den Einzelplatzbetrieb, fuer reale personenbezogene Daten
 * kommt SQLCipher darunter (siehe `docs/betrieb.md`), und ein spaeterer
 * Wechsel auf PostgreSQL muss nur dieses Interface neu bedienen - kein
 * Repository kennt den Treiber.
 *
 * `node:sqlite` ist Teil der Node-Laufzeit. Das spart eine native
 * Abhaengigkeit, die auf Apple Silicon und auf einem kleinen Linux-Rechner
 * jeweils neu gebaut werden muesste.
 */
export interface SqlValue {
  readonly _tag?: never;
}

export type SqlParam = string | number | bigint | null | Uint8Array;

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqlParam[]): { changes: number; lastInsertRowid: number | bigint };
  get<T>(sql: string, params?: readonly SqlParam[]): T | undefined;
  all<T>(sql: string, params?: readonly SqlParam[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}

export interface SqliteOptions {
  readonly path: string;
  /** SQLCipher-Schluessel. Nur wirksam, wenn der Treiber SQLCipher unterstuetzt. */
  readonly encryptionKey?: string | undefined;
}

export class SqliteDb implements Db {
  private readonly db: DatabaseSync;
  private txDepth = 0;

  constructor(opts: SqliteOptions) {
    if (opts.path !== ':memory:') {
      mkdirSync(dirname(opts.path), { recursive: true });
    }
    this.db = new DatabaseSync(opts.path);

    if (opts.encryptionKey !== undefined && opts.encryptionKey.length > 0) {
      // Nur mit einem SQLCipher-faehigen Build wirksam. Schlaegt der PRAGMA
      // fehl, brechen wir ab statt unverschluesselt weiterzuarbeiten.
      try {
        this.db.exec(`PRAGMA key = '${opts.encryptionKey.replace(/'/g, "''")}'`);
        this.db.exec('SELECT count(*) FROM sqlite_master');
      } catch (err) {
        this.db.close();
        throw new Error(
          'Datenbankverschluesselung angefordert, aber der SQLite-Treiber unterstuetzt SQLCipher nicht. ' +
            'Abbruch, damit keine unverschluesselte Datei entsteht. Details: ' +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    // WAL: gleichzeitiges Lesen waehrend eines Schreibvorgangs, und ein
    // abgebrochener Prozess laesst die Datei nicht kaputt zurueck.
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA busy_timeout = 5000');
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: readonly SqlParam[] = []): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(sql);
    const r = stmt.run(...(params as SqlParam[]));
    return { changes: Number(r.changes), lastInsertRowid: r.lastInsertRowid };
  }

  get<T>(sql: string, params: readonly SqlParam[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...(params as SqlParam[])) as T | undefined;
  }

  all<T>(sql: string, params: readonly SqlParam[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params as SqlParam[])) as T[];
  }

  /** Verschachtelte Aufrufe nutzen SAVEPOINTs, damit sie sich nicht ins Gehege kommen. */
  transaction<T>(fn: () => T): T {
    const name = `sp_${this.txDepth}`;
    const outer = this.txDepth === 0;
    this.db.exec(outer ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
    this.txDepth += 1;
    try {
      const result = fn();
      this.txDepth -= 1;
      this.db.exec(outer ? 'COMMIT' : `RELEASE ${name}`);
      return result;
    } catch (err) {
      this.txDepth -= 1;
      try {
        this.db.exec(outer ? 'ROLLBACK' : `ROLLBACK TO ${name}`);
        if (!outer) this.db.exec(`RELEASE ${name}`);
      } catch {
        /* Rollback-Fehler darf den Originalfehler nicht verdecken */
      }
      throw err;
    }
  }

  close(): void {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* egal beim Schliessen */
    }
    this.db.close();
  }
}

export function openDatabase(opts: SqliteOptions): Db {
  return new SqliteDb(opts);
}

export function openMemoryDatabase(): Db {
  return new SqliteDb({ path: ':memory:' });
}

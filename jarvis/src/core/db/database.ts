/**
 * Thin SQLite wrapper.
 *
 * Two drivers are supported and probed in this order:
 *   1. `better-sqlite3` — used when installed (fastest, works on any Node ABI
 *      once rebuilt for Electron).
 *   2. `node:sqlite`    — built into Node 22.5+ and into Electron 35+, so the
 *      app runs with zero native dependencies out of the box.
 *
 * Both drivers speak the same synchronous prepare/run/get/all API, so the
 * adapter below is deliberately small. Only positional `?` parameters are used
 * because named-parameter syntax differs between the two.
 */
import { createRequire } from 'node:module';

// The main process is bundled to CommonJS while the tests run as ESM, so the
// base for `createRequire` has to be resolved from whichever is present.
const require_ = createRequire(
  typeof __filename === 'string' ? __filename : import.meta.url,
);

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  run(...params: SqlValue[]): RunResult;
  get<T = Record<string, unknown>>(...params: SqlValue[]): T | undefined;
  all<T = Record<string, unknown>>(...params: SqlValue[]): T[];
}

export interface Database {
  readonly driver: 'better-sqlite3' | 'node:sqlite';
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): T;
  pragma(statement: string): void;
  close(): void;
}

interface RawStatement {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface RawDatabase {
  exec(sql: string): void;
  prepare(sql: string): RawStatement;
  close(): void;
}

function toNumber(value: number | bigint): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function wrap(raw: RawDatabase, driver: Database['driver']): Database {
  // Statements are re-used across calls; SQLite caching matters for the
  // send-desk query which runs on every UI refresh.
  const cache = new Map<string, RawStatement>();

  const prepareRaw = (sql: string): RawStatement => {
    let stmt = cache.get(sql);
    if (!stmt) {
      stmt = raw.prepare(sql);
      cache.set(sql, stmt);
    }
    return stmt;
  };

  let depth = 0;

  const db: Database = {
    driver,
    exec(sql) {
      raw.exec(sql);
    },
    prepare(sql) {
      const stmt = prepareRaw(sql);
      return {
        run(...params) {
          const res = stmt.run(...params);
          return {
            changes: toNumber(res.changes),
            lastInsertRowid: toNumber(res.lastInsertRowid),
          };
        },
        get<T>(...params: SqlValue[]) {
          return stmt.get(...params) as T | undefined;
        },
        all<T>(...params: SqlValue[]) {
          return stmt.all(...params) as T[];
        },
      };
    },
    transaction<T>(fn: () => T): T {
      // Nested transactions use savepoints so an inner rollback does not tear
      // down the outer one.
      if (depth > 0) {
        const name = `sp_${depth}`;
        depth += 1;
        raw.exec(`SAVEPOINT ${name}`);
        try {
          const value = fn();
          raw.exec(`RELEASE ${name}`);
          return value;
        } catch (error) {
          raw.exec(`ROLLBACK TO ${name}`);
          raw.exec(`RELEASE ${name}`);
          throw error;
        } finally {
          depth -= 1;
        }
      }
      depth = 1;
      raw.exec('BEGIN');
      try {
        const value = fn();
        raw.exec('COMMIT');
        return value;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      } finally {
        depth = 0;
      }
    },
    pragma(statement) {
      raw.exec(`PRAGMA ${statement}`);
    },
    close() {
      cache.clear();
      raw.close();
    },
  };

  return db;
}

export function openDatabase(file: string): Database {
  try {
    const BetterSqlite3 = require_('better-sqlite3') as new (path: string) => RawDatabase;
    const raw = new BetterSqlite3(file);
    return configure(wrap(raw, 'better-sqlite3'));
  } catch {
    // Not installed — fall through to the built-in driver.
  }

  const { DatabaseSync } = require_('node:sqlite') as {
    DatabaseSync: new (path: string, options?: Record<string, unknown>) => RawDatabase;
  };
  const raw = new DatabaseSync(file);
  return configure(wrap(raw, 'node:sqlite'));
}

function configure(db: Database): Database {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

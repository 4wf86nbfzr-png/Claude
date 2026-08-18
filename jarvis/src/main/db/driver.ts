/**
 * Dünne SQLite-Schicht.
 *
 * Standard ist `node:sqlite` — das steckt seit Node 22.5 in der Laufzeit und
 * braucht daher weder Kompilierung noch `electron-rebuild`. Wenn eine Umgebung
 * das Modul nicht mitbringt, wird `better-sqlite3` genutzt, sofern installiert.
 * Beide sprechen dieselbe schmale Schnittstelle, die hier definiert ist.
 */
import { createRequire } from 'node:module'

export type SqlValue = string | number | bigint | null | Uint8Array

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

export interface SqlStatement {
  run(...params: unknown[]): RunResult
  get<T = Record<string, unknown>>(...params: unknown[]): T | undefined
  all<T = Record<string, unknown>>(...params: unknown[]): T[]
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement
  exec(sql: string): void
  close(): void
  /** Führt fn in einer Transaktion aus und rollt bei Fehlern zurück. */
  transaction<T>(fn: () => T): T
  readonly driver: 'node:sqlite' | 'better-sqlite3'
}

/**
 * SQLite kennt kein boolean und kein undefined. Werte werden hier
 * einheitlich übersetzt, damit Aufrufer nicht jedes Mal daran denken müssen.
 */
export function toSqlValue(value: unknown): SqlValue {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value
  if (value instanceof Uint8Array) return value
  // Objekte und Arrays werden als JSON abgelegt.
  return JSON.stringify(value)
}

/** node:sqlite liefert Objekte ohne Prototyp — die reisen schlecht durch IPC. */
function plain<T>(row: unknown): T {
  return { ...(row as Record<string, unknown>) } as T
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string, options?: { open?: boolean }) => {
    prepare(sql: string): {
      run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
      get(...params: SqlValue[]): unknown
      all(...params: SqlValue[]): unknown[]
    }
    exec(sql: string): void
    close(): void
  }
}

function wrapNodeSqlite(mod: NodeSqliteModule, file: string): SqlDatabase {
  const db = new mod.DatabaseSync(file)

  const wrap = (sql: string): SqlStatement => {
    const stmt = db.prepare(sql)
    return {
      run(...params: unknown[]): RunResult {
        const r = stmt.run(...params.map(toSqlValue))
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
      },
      get<T>(...params: unknown[]): T | undefined {
        const row = stmt.get(...params.map(toSqlValue))
        return row === undefined || row === null ? undefined : plain<T>(row)
      },
      all<T>(...params: unknown[]): T[] {
        return stmt.all(...params.map(toSqlValue)).map((r) => plain<T>(r))
      }
    }
  }

  return {
    driver: 'node:sqlite',
    prepare: wrap,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN')
      try {
        const out = fn()
        db.exec('COMMIT')
        return out
      } catch (err) {
        try {
          db.exec('ROLLBACK')
        } catch {
          /* Rollback nach hartem Fehler darf selbst scheitern. */
        }
        throw err
      }
    }
  }
}

interface BetterSqliteStatement {
  run(...params: SqlValue[]): { changes: number; lastInsertRowid: number | bigint }
  get(...params: SqlValue[]): unknown
  all(...params: SqlValue[]): unknown[]
}

function wrapBetterSqlite(Ctor: new (file: string) => {
  prepare(sql: string): BetterSqliteStatement
  exec(sql: string): void
  close(): void
}, file: string): SqlDatabase {
  const db = new Ctor(file)

  const wrap = (sql: string): SqlStatement => {
    const stmt = db.prepare(sql)
    return {
      run(...params: unknown[]): RunResult {
        const r = stmt.run(...params.map(toSqlValue))
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }
      },
      get<T>(...params: unknown[]): T | undefined {
        const row = stmt.get(...params.map(toSqlValue))
        return row === undefined || row === null ? undefined : plain<T>(row)
      },
      all<T>(...params: unknown[]): T[] {
        return stmt.all(...params.map(toSqlValue)).map((r) => plain<T>(r))
      }
    }
  }

  return {
    driver: 'better-sqlite3',
    prepare: wrap,
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
    transaction<T>(fn: () => T): T {
      db.exec('BEGIN')
      try {
        const out = fn()
        db.exec('COMMIT')
        return out
      } catch (err) {
        try {
          db.exec('ROLLBACK')
        } catch {
          /* siehe oben */
        }
        throw err
      }
    }
  }
}

export function openDatabase(file: string): SqlDatabase {
  const require = createRequire(import.meta.url)

  try {
    const mod = require('node:sqlite') as NodeSqliteModule
    if (mod?.DatabaseSync) return wrapNodeSqlite(mod, file)
  } catch {
    /* Fällt unten auf better-sqlite3 zurück. */
  }

  try {
    const better = require('better-sqlite3') as new (file: string) => {
      prepare(sql: string): BetterSqliteStatement
      exec(sql: string): void
      close(): void
    }
    return wrapBetterSqlite(better, file)
  } catch {
    throw new Error(
      'Keine SQLite-Anbindung gefunden. Erwartet wird Node >= 22.5 (Modul "node:sqlite") ' +
        'oder das Paket "better-sqlite3". Bitte Node aktualisieren oder `npm i better-sqlite3` ausführen.'
    )
  }
}

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openDatabase, type SqlDatabase } from './driver'
import { MIGRATIONS } from './schema'

let instance: SqlDatabase | null = null

/** Wendet alle noch fehlenden Migrationen an. */
export function migrate(db: SqlDatabase): void {
  const row = db.prepare('PRAGMA user_version').get<{ user_version: number }>()
  const current = Number(row?.user_version ?? 0)

  for (let version = current; version < MIGRATIONS.length; version++) {
    const sql = MIGRATIONS[version]
    db.transaction(() => {
      db.exec(sql)
      // PRAGMA nimmt keine Platzhalter entgegen; die Zahl kommt aus dem Code,
      // nicht aus einer Eingabe.
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })
  }
}

export function openJarvisDatabase(file: string): SqlDatabase {
  mkdirSync(dirname(file), { recursive: true })
  const db = openDatabase(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  migrate(db)
  return db
}

export function setDb(db: SqlDatabase): void {
  instance = db
}

export function getDb(): SqlDatabase {
  if (!instance) throw new Error('Datenbank ist noch nicht geöffnet (setDb fehlt).')
  return instance
}

export function closeDb(): void {
  instance?.close()
  instance = null
}

export type { SqlDatabase }

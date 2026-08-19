import Database from 'better-sqlite3';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS, type EingebauteMigration } from './migrations.generated.js';

export type Db = Database.Database;

export interface OpenDbOptions {
  file: string;
  readonly?: boolean;
  /** Nur fuer Tests: ausfuehrliches SQL-Logging. */
  verbose?: (message?: unknown, ...rest: unknown[]) => void;
  /**
   * Migrationen aus diesem Ordner lesen statt der eingebauten.
   * Nur noetig, wenn jemand Migrationen nachtraegt, ohne neu zu bauen.
   */
  migrationsDir?: string;
}

export function openDatabase(options: OpenDbOptions): Db {
  const db = new Database(options.file, {
    readonly: options.readonly ?? false,
    ...(options.verbose ? { verbose: options.verbose } : {}),
  });

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  migrate(db, options.migrationsDir);
  return db;
}

/**
 * Woher kommen die Migrationen?
 *
 * Standardmaessig aus dem Code (src/db/migrations.generated.ts, erzeugt aus
 * den .sql-Dateien). Das ist Absicht: der Kern wird fuer den Electron-
 * Hauptprozess gebuendelt, und in einem Buendel gibt es keinen verlaesslichen
 * Weg, eine Datei "neben dem Modul" zu finden. Eingebettet funktioniert es in
 * Tests, in der Konsole, im Entwicklungsmodus und in der gepackten App gleich.
 *
 * Ein Ordner (Parameter oder JARVIS_MIGRATIONS_DIR) hat Vorrang -- damit lassen
 * sich Migrationen nachreichen, ohne neu zu bauen.
 */
export function ladeMigrationen(dirOverride?: string): EingebauteMigration[] {
  const dir = dirOverride ?? process.env.JARVIS_MIGRATIONS_DIR;
  if (!dir) return MIGRATIONS;

  if (!existsSync(dir)) {
    throw new Error(
      `Der angegebene Migrationsordner existiert nicht: ${dir}\n` +
        'JARVIS_MIGRATIONS_DIR korrigieren oder die Variable entfernen (dann werden die eingebauten Migrationen benutzt).',
    );
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((version) => ({ version, sql: readFileSync(join(dir, version), 'utf8') }));
}

/** Wendet alle noch nicht eingespielten Migrationen der Reihe nach an. */
export function migrate(db: Db, dirOverride?: string): string[] {
  const migrationen = ladeMigrationen(dirOverride);

  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((r) => (r as { version: string }).version),
  );

  const done: string[] = [];
  for (const migration of migrationen) {
    if (applied.has(migration.version)) continue;
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
    });
    run();
    done.push(migration.version);
  }
  return done;
}

/** Hilfsfunktion: Transaktion um eine beliebige Funktion. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  return db.transaction(fn)();
}

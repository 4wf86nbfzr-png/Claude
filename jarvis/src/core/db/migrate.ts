import type { Database } from './database.js';
import { MIGRATIONS, SCHEMA_SQL, SCHEMA_VERSION } from './schema.js';

/**
 * Brings a database up to the current schema version. Safe to call on every
 * start: the base script is idempotent and numbered migrations are guarded by
 * `user_version`.
 */
export function migrate(db: Database): { from: number; to: number } {
  const row = db.prepare('PRAGMA user_version').get<{ user_version: number }>();
  const current = row?.user_version ?? 0;

  db.exec(SCHEMA_SQL);

  for (const migration of MIGRATIONS) {
    if (migration.version > current) {
      db.transaction(() => {
        db.exec(migration.sql);
      });
    }
  }

  if (current !== SCHEMA_VERSION) {
    // PRAGMA does not accept bound parameters; the value is a module constant.
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  return { from: current, to: SCHEMA_VERSION };
}

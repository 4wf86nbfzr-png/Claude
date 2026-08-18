import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../src/db/migrations.generated.js';
import { migrate } from '../src/db/database.js';
import { makeTestDb } from './helpers.js';

const ordner = resolve(import.meta.dirname, '../src/db/migrations');

/**
 * Die Migrationen liegen doppelt vor: als lesbare .sql-Datei und eingebettet
 * im Code (damit sie auch im Electron-Bündel gefunden werden). Dieser Test
 * stellt sicher, dass beides nicht auseinanderläuft -- wer eine .sql-Datei
 * ändert und `npm run migrations` vergisst, sieht es hier sofort.
 */
describe('Eingebettete Migrationen', () => {
  it('stimmen mit den .sql-Dateien überein', () => {
    const dateien = readdirSync(ordner).filter((f) => f.endsWith('.sql')).sort();

    expect(
      MIGRATIONS.map((m) => m.version),
      'Anzahl oder Namen weichen ab — bitte `npm run migrations` ausführen.',
    ).toEqual(dateien);

    for (const datei of dateien) {
      const ausDatei = readFileSync(resolve(ordner, datei), 'utf8');
      const eingebettet = MIGRATIONS.find((m) => m.version === datei)?.sql;
      expect(eingebettet, `${datei} fehlt in der eingebetteten Fassung.`).toBe(ausDatei);
    }
  });

  it('lassen sich zweimal anwenden, ohne Schaden anzurichten', () => {
    const env = makeTestDb();
    try {
      const angewendet = env.repos.db
        .prepare('SELECT version FROM schema_migrations ORDER BY version')
        .all()
        .map((r) => (r as { version: string }).version);
      expect(angewendet).toEqual(MIGRATIONS.map((m) => m.version));

      // Erneutes Migrieren darf nichts mehr tun.
      expect(migrate(env.repos.db)).toEqual([]);
    } finally {
      env.dispose();
    }
  });
});

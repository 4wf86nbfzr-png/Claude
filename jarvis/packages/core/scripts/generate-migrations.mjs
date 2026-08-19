/**
 * Erzeugt src/db/migrations.generated.ts aus den .sql-Dateien.
 *
 * Warum: der Kern wird für den Electron-Hauptprozess gebündelt. In einem
 * Bündel gibt es keinen zuverlässigen Weg, eine Datei "neben dem Modul" zu
 * finden -- weder im Entwicklungsmodus noch in der gepackten App. Die
 * Migrationen sind deshalb Teil des Codes; die .sql-Dateien bleiben die
 * lesbare Quelle, aus der dieser Code entsteht.
 *
 * Aufruf: node scripts/generate-migrations.mjs   (läuft in `npm run build`)
 * Ein Test prüft, dass die erzeugte Datei zu den .sql-Dateien passt.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const quellordner = resolve(here, '../src/db/migrations');
const ziel = resolve(here, '../src/db/migrations.generated.ts');

export function baueInhalt(ordner = quellordner) {
  const dateien = readdirSync(ordner)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const eintraege = dateien
    .map((datei) => {
      const sql = readFileSync(join(ordner, datei), 'utf8');
      // Backticks und ${ maskieren, damit das Template-Literal hält.
      const sicher = sql.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      return `  {\n    version: ${JSON.stringify(datei)},\n    sql: \`${sicher}\`,\n  },`;
    })
    .join('\n');

  return `/**
 * ERZEUGTE DATEI -- nicht von Hand ändern.
 *
 * Quelle: src/db/migrations/*.sql
 * Neu erzeugen: node scripts/generate-migrations.mjs (Teil von \`npm run build\`)
 */

export interface EingebauteMigration {
  version: string;
  sql: string;
}

export const MIGRATIONS: EingebauteMigration[] = [
${eintraege}
];
`;
}

const inhalt = baueInhalt();
writeFileSync(ziel, inhalt, 'utf8');
console.log(`[core] Migrationen eingebettet -> ${ziel}`);

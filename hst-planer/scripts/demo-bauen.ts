/**
 * Buendelt die reine Fachlogik fuer die Demo-Datei.
 *
 *   npx tsx scripts/demo-bauen.ts
 *
 * Es wird nichts nachgebaut oder vereinfacht: dieselben Module, die der
 * Server benutzt, laufen danach auch in demo/index.html. Module mit
 * Server-Bezug (Datenbank, Dateisystem, E-Mail-Versand) sind bewusst nicht
 * dabei – sie gehoeren nicht in eine Datei, die man doppelklickt.
 */
import { build } from 'esbuild';
import { stat } from 'node:fs/promises';

async function main() {
  await build({
    entryPoints: ['demo/quelle.ts'],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    outfile: 'demo/hst-logik.js',
    minify: false,          // lesbar lassen: wer nachsehen will, soll nachsehen koennen
    sourcemap: false,
    legalComments: 'none',
    // exceljs wird nur vom XLSX-Leser gebraucht und in der Demo nie aufgerufen.
    external: ['exceljs', 'node:*', 'server-only'],
    banner: { js: '/* HST Planer – Fachlogik aus src/lib, gebuendelt fuer die Demo. */' },
  });

  const info = await stat('demo/hst-logik.js');
  console.log(`demo/hst-logik.js erzeugt (${Math.round(info.size / 1024)} KB)`);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

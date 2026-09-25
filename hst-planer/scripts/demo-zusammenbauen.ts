/**
 * Setzt demo/index.html aus den Bausteinen zusammen.
 *
 *   npx tsx scripts/demo-zusammenbauen.ts
 *
 * Die drei Bausteine liegen unter demo/teile/. Dazwischen wird das
 * Bilderverzeichnis eingesetzt, das scripts/demo-bilder.ts erzeugt hat –
 * so bleibt die Galerie automatisch auf dem Stand der Aufnahmen.
 */
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const teile = await Promise.all(
    ['kopf.html', 'rumpf.html', 'steuerung.html'].map((datei) =>
      readFile(path.resolve('demo/teile', datei), 'utf8'),
    ),
  );
  const verzeichnis = JSON.parse(await readFile('demo/bilder/verzeichnis.json', 'utf8'));
  const bilderSkript = `<script>window.HST_BILDER = ${JSON.stringify(verzeichnis)};</script>\n`;

  const [kopf = '', rumpf = '', steuerung = ''] = teile;
  const seite = kopf + rumpf + bilderSkript + steuerung;
  await writeFile('demo/index.html', seite, 'utf8');

  const info = await stat('demo/index.html');
  console.log(`demo/index.html erzeugt (${Math.round(info.size / 1024)} KB, ${verzeichnis.length} Bilder)`);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

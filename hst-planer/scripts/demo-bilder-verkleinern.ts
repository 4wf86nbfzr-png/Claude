/**
 * Verkleinert die Demo-Bilder auf eine repofreundliche Groesse.
 *
 *   npx tsx scripts/demo-bilder-verkleinern.ts
 *
 * Aufgenommen wird mit doppelter Aufloesung (gute Schaerfe), abgelegt wird
 * mit anderthalbfacher – das bleibt auf hochaufloesenden Bildschirmen
 * scharf und spart rund zwei Drittel Speicher.
 */
import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ORDNER = path.resolve('demo/bilder');
const ZIELBREITE_ANTEIL = 0.72; // von 2fach auf ~1,44fach

async function main() {
  const dateien = (await readdir(ORDNER)).filter((d) => d.endsWith('.png'));
  let vorher = 0;
  let nachher = 0;

  for (const datei of dateien) {
    const pfad = path.join(ORDNER, datei);
    vorher += (await stat(pfad)).size;

    const bild = sharp(pfad);
    const info = await bild.metadata();
    const breite = Math.round((info.width ?? 1400) * ZIELBREITE_ANTEIL);

    const daten = await sharp(pfad)
      .resize({ width: breite, withoutEnlargement: true })
      // Oberflaechen haben wenige Farben – eine Palette spart viel und
      // bleibt bei Text verlustfrei genug.
      .png({ compressionLevel: 9, palette: true, quality: 92, effort: 9 })
      .toBuffer();

    await writeFile(pfad, daten);
    nachher += daten.length;
  }

  console.log(
    `${dateien.length} Bilder: ${Math.round(vorher / 1024 / 1024 * 10) / 10} MB → ` +
    `${Math.round(nachher / 1024 / 1024 * 10) / 10} MB`,
  );
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

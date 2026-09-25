/**
 * Baut die Demo als EINE Datei, die sich doppelklicken lässt.
 *
 *   npx tsx scripts/demo-einzeldatei.ts
 *
 * `demo/index.html` braucht den Ordner daneben (Bilder und Skript). Wer
 * nur die eine Datei herunterlädt, sieht dann eine kaputte Seite. Diese
 * Fassung trägt alles in sich: das Skript eingebettet, die Bilder als
 * WebP-Datenadressen.
 *
 * WebP statt PNG, weil es bei Bildschirmfotos rund zwei Drittel spart –
 * und Base64 macht ohnehin noch einmal ein Drittel obendrauf. Eine
 * 25-MB-Datei schickt man niemandem.
 */
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ZIEL = 'demo/hst-planer-demo.html';

interface Bild { datei: string; titel: string; geraet: string; thema: string; pfad: string }

async function main() {
  const seite = await readFile('demo/index.html', 'utf8');
  const skript = await readFile('demo/hst-logik.js', 'utf8');
  const verzeichnis: Bild[] = JSON.parse(await readFile('demo/bilder/verzeichnis.json', 'utf8'));

  // --- Bilder einbetten ---------------------------------------------------
  const adressen = new Map<string, string>();
  let roh = 0;
  for (const bild of verzeichnis) {
    const pfad = path.join('demo/bilder', bild.datei);
    roh += (await stat(pfad)).size;
    const webp = await sharp(pfad).webp({ quality: 82, effort: 6 }).toBuffer();
    adressen.set(bild.datei, `data:image/webp;base64,${webp.toString('base64')}`);
  }

  let ergebnis = seite;

  // Der Verweis auf das Skript wird durch das Skript selbst ersetzt.
  // Ein </script> im Quelltext würde den Block sonst vorzeitig schließen.
  ergebnis = ergebnis.replace(
    '<script src="hst-logik.js"></script>',
    `<script>\n${skript.replace(/<\/script>/gi, '<\\/script>')}\n</script>`,
  );
  if (ergebnis.includes('hst-logik.js"')) throw new Error('Der Skriptverweis wurde nicht ersetzt.');

  // Im Bilderverzeichnis steht statt des Dateinamens die Datenadresse.
  // Die Galerie baut daraus <img src="bilder/…"> – deshalb wird dort der
  // Präfix entfernt, sobald eine Datenadresse drinsteht.
  const mitAdressen = verzeichnis.map((b) => ({ ...b, datei: adressen.get(b.datei) ?? b.datei }));
  ergebnis = ergebnis.replace(
    /<script>window\.HST_BILDER = .*?;<\/script>/s,
    `<script>window.HST_BILDER = ${JSON.stringify(mitAdressen)};</script>`,
  );
  if (!ergebnis.includes('data:image/webp')) throw new Error('Die Bilder wurden nicht eingebettet.');

  // Der Bildpfad wird in der Steuerung zusammengesetzt; bei einer
  // Datenadresse darf kein Ordner davor stehen.
  ergebnis = ergebnis.replace(
    'src="bilder/${text(bild.datei)}"',
    'src="${bild.datei.startsWith(\'data:\') ? bild.datei : `bilder/${text(bild.datei)}`}"',
  );

  // Ein Hinweis im Kopf, damit klar ist, welche Fassung man vor sich hat.
  ergebnis = ergebnis.replace(
    '<title>',
    '<!-- Eigenständige Fassung: Skript und Bilder sind eingebettet. -->\n<title>',
  );

  await writeFile(ZIEL, ergebnis, 'utf8');
  const info = await stat(ZIEL);
  console.log(
    `${ZIEL} erzeugt: ${Math.round(info.size / 1024 / 1024 * 10) / 10} MB, `
    + `${verzeichnis.length} Bilder eingebettet (aus ${Math.round(roh / 1024 / 1024 * 10) / 10} MB PNG).`,
  );
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

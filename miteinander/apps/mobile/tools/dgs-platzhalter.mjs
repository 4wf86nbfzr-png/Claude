/**
 * Baut die gekennzeichneten Platzhalter fuer die Gebaerdensprach-Videos.
 *
 * Warum es die gibt: solange die echten Aufnahmen fehlen, laesst sich sonst
 * nicht pruefen, ob der Abspieler taugt -- Untertitel, Geschwindigkeit,
 * Vollbild, Fokus, Screenreader. Die Platzhalter sind als solche
 * gekennzeichnet, im Bild und in der Oberflaeche. Der Status der Inhalte
 * bleibt "placeholder"; die Abdeckung im Adminbereich zeigt weiterhin 0.
 *
 * Erzeugt je Kernablauf:
 *   assets/dgs/<schluessel>.webm    Video mit der Laufzeit der Untertitel
 *   assets/dgs/<schluessel>.vtt     Untertitel als WebVTT
 * sowie src/inhalte/dgs-videos.ts mit der Zuordnung fuer Metro.
 *
 * Aufruf:  node --experimental-strip-types tools/dgs-platzhalter.mjs
 * Braucht: ffmpeg (VP8/WebM) und Python mit Pillow.
 *
 * Ersetzen durch echte Aufnahmen: Dateien in assets/dgs/ austauschen und
 * im Adminbereich freigeben. Das Skript muss dafuer nicht laufen.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const appWurzel = path.resolve(hier, '..');
const kern = path.resolve(appWurzel, '../../packages/core/src/content');

// Nur Module ohne Querverweise -- Node loest die endungslosen Importe des
// Monorepos nicht auf (siehe DECISIONS.md, E-20).
const { DGS_SKRIPTE, DGS_TITEL, REQUIRED_DGS_KEYS, SEKUNDEN_PRO_SATZ } = await import(
  path.join(kern, 'dgs-skripte.ts')
);
const { zeilenAusSaetzen, zuWebVtt } = await import(path.join(kern, 'untertitel.ts'));

const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const zielVerzeichnis = path.join(appWurzel, 'assets', 'dgs');
const arbeitsVerzeichnis = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'dgs-'));

fs.mkdirSync(zielVerzeichnis, { recursive: true });

// 1. Standbilder zeichnen lassen
const auftrag = REQUIRED_DGS_KEYS.map((key) => ({
  titel: DGS_TITEL[key],
  ziel: path.join(arbeitsVerzeichnis, `${key}.jpg`),
}));

const python = spawnSync('python3', [path.join(hier, 'platzhalter-karte.py')], {
  input: JSON.stringify(auftrag),
  encoding: 'utf8',
});
if (python.status !== 0) {
  console.error(python.stderr);
  throw new Error('Die Standbilder konnten nicht gezeichnet werden. Ist Pillow installiert?');
}
console.log(python.stderr.trim());

// 2. Videos und Untertitel schreiben
const BILDER_PRO_SEKUNDE = 2;

/**
 * Standbild zu Video.
 *
 * Der ffmpeg-Bau dieser Umgebung bringt weder den image2-Demuxer noch einen
 * PNG-Decoder mit. Deshalb wird dasselbe JPEG als Bildfolge ueber die
 * Standardeingabe gereicht -- das kann jeder ffmpeg-Bau.
 */
function kodiere(bild, sekunden, ziel) {
  const einzelbild = fs.readFileSync(bild);
  const anzahl = Math.max(1, Math.round(sekunden * BILDER_PRO_SEKUNDE));

  return new Promise((fertig, fehler) => {
    const lauf = spawn(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'image2pipe', '-c:v', 'mjpeg',
      '-framerate', String(BILDER_PRO_SEKUNDE),
      '-i', 'pipe:0',
      '-c:v', 'libvpx', '-b:v', '60k', '-crf', '40',
      '-pix_fmt', 'yuv420p',
      '-an',
      ziel,
    ]);
    let meldung = '';
    lauf.stderr.on('data', (d) => (meldung += d));
    lauf.on('close', (code) => (code === 0 ? fertig() : fehler(new Error(meldung))));
    lauf.stdin.on('error', () => {
      /* ffmpeg hat vorzeitig geschlossen -- der Fehler kommt ueber close. */
    });
    for (let i = 0; i < anzahl; i++) lauf.stdin.write(einzelbild);
    lauf.stdin.end();
  });
}

let gesamt = 0;
for (const key of REQUIRED_DGS_KEYS) {
  const zeilen = zeilenAusSaetzen(DGS_SKRIPTE[key], SEKUNDEN_PRO_SATZ);
  const dauer = zeilen.length * SEKUNDEN_PRO_SATZ;

  const videoZiel = path.join(zielVerzeichnis, `${key}.webm`);
  await kodiere(path.join(arbeitsVerzeichnis, `${key}.jpg`), dauer, videoZiel);
  fs.writeFileSync(path.join(zielVerzeichnis, `${key}.vtt`), zuWebVtt(zeilen));

  const kb = fs.statSync(videoZiel).size / 1024;
  gesamt += kb;
  console.log(`${key.padEnd(30)} ${dauer}s  ${kb.toFixed(0)} KB`);
}
console.log(`Gesamt: ${(gesamt / 1024).toFixed(2)} MB`);

// 3. Zuordnung fuer Metro schreiben -- require() braucht feste Pfade.
const eintraege = REQUIRED_DGS_KEYS.map(
  (key) => `  '${key}': require('../../assets/dgs/${key}.webm') as number,`,
).join('\n');

fs.writeFileSync(
  path.join(appWurzel, 'src', 'inhalte', 'dgs-videos.ts'),
  `/**
 * Zuordnung Kernablauf -> Videodatei.
 *
 * ERZEUGT von tools/dgs-platzhalter.mjs -- nicht von Hand aendern.
 *
 * Es sind gekennzeichnete Platzhalter, keine Gebärdensprach-Aufnahmen.
 * Sobald echte Videos vorliegen, werden die Dateien in assets/dgs/
 * ersetzt und im Adminbereich freigegeben; diese Datei bleibt gleich.
 */
export const DGS_VIDEOS: Record<string, number> = {
${eintraege}
};

/** Ist für diesen Ablauf überhaupt eine Datei hinterlegt? */
export function dgsVideoQuelle(key: string): number | undefined {
  return DGS_VIDEOS[key];
}
`,
);

fs.rmSync(arbeitsVerzeichnis, { recursive: true, force: true });
console.log('Zuordnung geschrieben: src/inhalte/dgs-videos.ts');

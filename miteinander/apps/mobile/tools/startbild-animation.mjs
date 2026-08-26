/**
 * Setzt die Bewegtbild-Fassung des Startbildes zusammen.
 *
 *   FFMPEG_PATH=... node tools/startbild-animation.mjs
 *
 * Erzeugt:
 *   assets/bilder/startbild.webm   die Animation
 *   assets/bilder/startbild.jpg    das Standbild am Ende (Poster)
 *
 * Das Poster ist bewusst das ENDE der Animation, nicht ihr Anfang: Wer
 * "Bewegung reduzieren" eingeschaltet hat, sieht sofort das fertige Bild
 * mit Logo und verpasst nichts.
 *
 * Braucht: ffmpeg (VP8/WebM) und Python mit Pillow.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const appWurzel = path.resolve(hier, '..');
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
const skript = path.join(hier, 'startbild-animation.py');

const poster = path.join(appWurzel, 'assets', 'bilder', 'startbild.jpg');
const video = path.join(appWurzel, 'assets', 'bilder', 'startbild.webm');

// 1. Poster
const posterLauf = spawnSync('python3', [skript, '--poster', poster], {
  cwd: appWurzel,
  encoding: 'utf8',
});
if (posterLauf.status !== 0) {
  console.error(posterLauf.stderr);
  throw new Error('Das Poster konnte nicht erzeugt werden. Ist Pillow installiert?');
}

// 2. Animation: Python liefert die Einzelbilder, ffmpeg setzt sie zusammen.
const bilder = spawn('python3', [skript], { cwd: appWurzel });
const kodierer = spawn(ffmpeg, [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '12', '-i', 'pipe:0',
  '-c:v', 'libvpx', '-b:v', '420k', '-crf', '32',
  '-pix_fmt', 'yuv420p', '-an',
  video,
]);

bilder.stdout.pipe(kodierer.stdin);
bilder.stderr.on('data', (d) => process.stderr.write(d));
let meldung = '';
kodierer.stderr.on('data', (d) => (meldung += d));

await new Promise((fertig, fehler) => {
  kodierer.on('close', (code) => (code === 0 ? fertig() : fehler(new Error(meldung))));
});

for (const datei of [poster, video]) {
  console.log(`${path.basename(datei)}  ${(fs.statSync(datei).size / 1024).toFixed(0)} KB`);
}

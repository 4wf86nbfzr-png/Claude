/* Baut den Platzhalter-Imagefilm neu.
 *
 *     node tools/film-bauen.js
 *
 * Der Film ist kein gedrehtes Material, sondern ein Schnitt aus neun der
 * vorhandenen Fotos: neun Szenen à fünf Sekunden, jede mit einer langsamen
 * Kamerafahrt, dazu ein Lichtabfall am Rand. Die Musik liegt fertig vor und
 * wird unverändert übernommen.
 *
 * Warum das Skript so aussieht, wie es aussieht:
 *
 * 1. **Bild für Bild statt Bildschirmaufnahme.** Die erste Fassung wurde mit
 *    Playwrights `recordVideo` in Echtzeit mitgeschnitten. Das kostet
 *    Auflösung (fest 1280 × 720), es lässt sich weder Bitrate noch Codec
 *    wählen, die Länge schwankt um bis zu zwei Sekunden — und Ton nimmt es
 *    gar nicht auf. Hier wird stattdessen jedes einzelne Bild angefordert:
 *    Die CSS-Animationen stehen still, das Skript setzt ihre Zeit selbst und
 *    macht dann eine Aufnahme. Das Ergebnis ist bildgenau reproduzierbar.
 *
 * 2. **Die ersten 0,8 s bleiben schwarz.** Nicht aus Absicht, sondern weil
 *    die ausgelieferte Fassung so aussah — Untertitelzeiten und Musik hängen
 *    daran. Wer den Vorlauf ändert, muss `imagefilm-de.vtt` nachziehen.
 *
 * 3. **Gesamtlänge = Länge der Musik.** Die Tonspur ist 45,01 s lang; das
 *    Bild wird auf dieselbe Länge geschnitten. Die neunte Szene ist dadurch
 *    knapp eine Sekunde kürzer als die anderen — genau wie bisher.
 *
 * Voraussetzungen: Playwright und ein ffmpeg. Beides wird unten gesucht.
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright fehlt. Einmalig: npm i -D playwright');
  console.error('Der Browser ist in dieser Umgebung schon da; ein Download ist nicht noetig:');
  console.error('  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright');
  process.exit(1);
}
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const WURZEL = path.dirname(__dirname);
const IMG = path.join(WURZEL, 'assets/img');
const VIDEO = path.join(WURZEL, 'assets/video');

const BREITE = 1920, HOEHE = 1080, BILDRATE = 25;
const VORLAUF = 0.8;          // Sekunden Schwarz am Anfang
const DAUER = 5;              // Sekunden je Szene

/* Welches Foto in welcher Szene, und wie die Kamera darüber fährt.
   Der Ausschnitt ist 16:9 aus der Bildmitte, senkrecht wie im Original. */
const SZENEN = [
  { foto: 'halle45',          fahrt: 'zoomIn',   y: 0.625 },
  { foto: 'promotion',        fahrt: 'panRight', y: 0.313 },
  { foto: 'gastro-detail',    fahrt: 'zoomOut',  y: 0.250 },
  { foto: 'sicherheit',       fahrt: 'panLeft',  y: 0.374 },
  { foto: 'promotion-messe',  fahrt: 'zoomIn',   y: 0.250 },
  { foto: 'logistik-detail',  fahrt: 'zoomOut',  y: 0.500 },
  { foto: 'fahrservice-door', fahrt: 'panRight', y: 0.500 },
  { foto: 'gastro',           fahrt: 'zoomIn',   y: 0.500 },
  { foto: 'team-herm',        fahrt: 'zoomOut',  y: 0.000 },
];

const BROWSER = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                 '/opt/pw-browsers/chromium/chrome'].find(p => fs.existsSync(p));

function ffmpeg() {
  try {
    return require('child_process')
      .execSync('python3 -c "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"')
      .toString().trim();
  } catch { return 'ffmpeg'; }
}

const b64 = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');

function seite() {
  const bilder = SZENEN.map(s => b64(path.join(os.tmpdir(), 'film-' + s.foto + '.jpg')));
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#000;overflow:hidden}
  *{animation-play-state:paused !important}
  .buehne{position:fixed;inset:0}
  .szene{position:absolute;inset:0;opacity:0;animation:ein ${DAUER}s linear forwards}
  .szene img{width:100%;height:100%;object-fit:cover;transform-origin:center;
    animation:var(--fahrt) ${DAUER + 0.6}s linear forwards}
  @keyframes ein{0%{opacity:0}6%{opacity:1}94%{opacity:1}100%{opacity:0}}
  @keyframes zoomIn {from{transform:scale(1.02)}to{transform:scale(1.16)}}
  @keyframes zoomOut{from{transform:scale(1.16)}to{transform:scale(1.02)}}
  @keyframes panLeft {from{transform:scale(1.14) translateX(2.5%)}to{transform:scale(1.14) translateX(-2.5%)}}
  @keyframes panRight{from{transform:scale(1.14) translateX(-2.5%)}to{transform:scale(1.14) translateX(2.5%)}}
  .vig{position:fixed;inset:0;pointer-events:none;
    background:radial-gradient(120% 80% at 50% 45%,transparent 40%,rgba(0,0,0,.5) 100%),
               linear-gradient(180deg,rgba(0,0,0,.28) 0%,transparent 18%,transparent 62%,rgba(0,0,0,.55) 100%)}
</style><body><div class="buehne">
${SZENEN.map((s, i) => `<div class="szene" style="animation-delay:${i * DAUER}s">
  <img src="${bilder[i]}" style="--fahrt:${s.fahrt};animation-delay:${i * DAUER}s">
</div>`).join('\n')}
</div><div class="vig"></div>`;
}

(async () => {
  const FF = ffmpeg();

  /* --- 1) Ausschnitte in Filmgröße vorbereiten -------------------------- */
  // Das macht Python mit Pillow — dieselbe Lanczos-Skalierung und
  // Nachschärfung wie bei den grossen Bildern der Website.
  const py = SZENEN.map(s => `${s.foto}:${s.y}`).join(',');
  require('child_process').execSync(`python3 - <<'PY'
from PIL import Image, ImageFilter
import os, tempfile
for teil in "${py}".split(","):
    name, y = teil.split(":")
    im = Image.open(os.path.join("${IMG}", name + ".jpg")).convert("RGB")
    b, h = im.size
    if b / h > 16 / 9: sh, sb = h, round(h * 16 / 9)
    else:              sb, sh = b, round(b * 9 / 16)
    x0 = (b - sb) // 2
    y0 = min(max(0, round((h - sh) * float(y))), h - sh)
    aus = im.crop((x0, y0, x0 + sb, y0 + sh)).resize((${BREITE}, ${HOEHE}), Image.LANCZOS)
    aus = aus.filter(ImageFilter.UnsharpMask(radius=1.6, percent=52, threshold=3))
    aus.save(os.path.join(tempfile.gettempdir(), "film-" + name + ".jpg"), "JPEG", quality=93, subsampling=1)
PY`, { stdio: 'inherit' });

  /* --- 2) Länge aus der Tonspur nehmen ---------------------------------- */
  // Die Musik steckt in der bisherigen Fassung. Sie wird ohne Neukodierung
  // herausgeloest, zwischengelegt und spaeter unveraendert wieder eingebaut —
  // deshalb liegt keine zweite Tondatei im Projekt herum.
  const ton = path.join(os.tmpdir(), 'imagefilm-ton.webm');
  const bisher = path.join(VIDEO, 'imagefilm.webm');
  if (!fs.existsSync(ton)) {
    if (!fs.existsSync(bisher)) {
      console.error('Weder Tonspur noch bisherige Fassung gefunden.');
      process.exit(1);
    }
    require('child_process').execSync(
      `"${FF}" -y -v error -i "${bisher}" -vn -c:a copy "${ton}"`, { stdio: 'inherit' });
  }
  const info = require('child_process').execSync(`${FF} -hide_banner -i "${ton}" 2>&1 || true`).toString();
  const m = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
  const laenge = m ? (+m[1] * 3600 + +m[2] * 60 + +m[3]) : 45.01;
  const bilder = Math.round(laenge * BILDRATE);
  console.log(`Tonspur ${laenge.toFixed(2)} s  ->  ${bilder} Einzelbilder`);

  /* --- 3) Bild für Bild aufnehmen und direkt in ffmpeg schieben --------- */
  const ziel = path.join(VIDEO, 'imagefilm.webm');
  const ff = spawn(FF, [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(BILDRATE), '-i', '-',
    '-i', ton,
    '-c:v', 'libvpx-vp9', '-crf', '31', '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-shortest',
    ziel,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const br = await chromium.launch({ executablePath: BROWSER });
  const p = await br.newPage({ viewport: { width: BREITE, height: HOEHE } });
  await p.setContent(seite());
  await p.evaluate(() => Promise.all([...document.images].map(i => i.decode())));

  for (let i = 0; i < bilder; i++) {
    const t = Math.max(0, i / BILDRATE - VORLAUF);
    await p.evaluate(ms => document.getAnimations().forEach(a => { a.currentTime = ms; }), t * 1000);
    const png = await p.screenshot({ type: 'png' });
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 125 === 0) process.stdout.write(`\r  ${i}/${bilder} Bilder`);
  }
  process.stdout.write(`\r  ${bilder}/${bilder} Bilder\n`);
  await br.close();

  ff.stdin.end();
  await new Promise((ok, weg) => ff.on('close', c => c === 0 ? ok() : weg(new Error('ffmpeg ' + c))));
  console.log('Fertig:', path.relative(WURZEL, ziel),
              (fs.statSync(ziel).size / 1024 / 1024).toFixed(1), 'MB');
})();

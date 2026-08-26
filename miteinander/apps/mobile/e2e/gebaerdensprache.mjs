/**
 * End-to-End-Test im echten Browser: Startbild, Gebärdensprache und
 * Untertitel.
 *
 * Ablauf:
 *   1. npm run web:export
 *   2. CHROMIUM_PATH=... node e2e/gebaerdensprache.mjs
 *
 * Diese Tests ersetzen keine manuellen Tests mit Screenreader oder mit
 * gehörlosen Menschen -- siehe TESTPLAN.md.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.WEB_DIST ?? 'dist');
const typen = {
  '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.webm': 'video/webm',
};
const server = http.createServer((req, res) => {
  let datei = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(datei) || fs.statSync(datei).isDirectory()) datei = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': typen[path.extname(datei)] ?? 'application/octet-stream' });
  fs.createReadStream(datei).pipe(res);
});
await new Promise((r) => server.listen(4190, r));
const adresse = 'http://localhost:4190/';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 900 } });
const fehler = [];
/**
 * Eine Meldung des Browsers, die kein Fehler der App ist: Wird beim
 * Verlassen der Startseite die Startanimation aus der Seite genommen,
 * bevor sie fertig geladen hat, bricht der Browser den Abspielwunsch ab.
 * expo-video faengt die Absage nicht ab, deshalb steht sie in der Konsole.
 * Sichtbar ist davon nichts. Alle anderen Konsolenfehler zaehlen weiter.
 */
const bekannteBrowsermeldung = (t) => t.includes('play() request was interrupted');
page.on('pageerror', (e) => { if (!bekannteBrowsermeldung(String(e))) fehler.push(String(e).slice(0, 200)); });
page.on('console', (m) => { if (m.type() === 'error' && !bekannteBrowsermeldung(m.text())) fehler.push(m.text().slice(0, 200)); });

let offen = 0;
const pruef = (label, ok) => { if (!ok) offen++; console.log(`${ok ? 'OK  ' : 'FEHLER'}  ${label}`); };

const start = async () => {
  await page.goto(adresse, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
};

// ---------------------------------------------------------------- Startbild
await start();

const bild = await page.evaluate(() => {
  // Auf der Startseite laeuft die Animation. Sie sitzt in einem Rahmen, der
  // die Bildbeschreibung traegt -- react-native-web macht daraus aria-label.
  const beschriftung = (el) => el.getAttribute('aria-label') || el.getAttribute('alt') || '';
  const rahmen = [...document.querySelectorAll('[aria-label], img')]
    .find((x) => beschriftung(x).includes('tanzen'));
  if (!rahmen) return null;
  const r = rahmen.getBoundingClientRect();
  const video = rahmen.querySelector('video');
  const img = rahmen.tagName === 'IMG' ? rahmen : rahmen.querySelector('img');
  return {
    breite: Math.round(r.width), hoehe: Math.round(r.height), links: Math.round(r.left),
    alt: beschriftung(rahmen),
    video: video !== null,
    // Bewegtes Bild: laeuft es? Standbild: ist es geladen?
    geladen: video ? video.readyState > 0 : !!img && img.complete && img.naturalWidth > 0,
    schleife: video ? video.loop : false,
    stumm: video ? video.muted : true,
  };
});
pruef('Startbild vorhanden', bild !== null);
pruef('Randlos über die volle Breite', bild !== null && bild.links === 0 && bild.breite >= 410);
pruef('Große Bühne statt Briefmarke', bild !== null && bild.hoehe >= 200);
pruef('Bild geladen', bild?.geladen === true);
pruef('Startbild ist eine Animation', bild?.video === true);
pruef('Animation läuft nicht endlos', bild?.schleife === false);
pruef('Animation ist stumm', bild?.stumm === true);
pruef('Bildbeschreibung vorhanden', (bild?.alt.length ?? 0) > 60);

// --------------------------------------------------------- Gebärdensprache
let text = await page.innerText('body');
pruef('Einstieg auf der Startseite', text.includes('In Gebärdensprache ansehen'));

await page.getByRole('button', { name: 'In Gebärdensprache ansehen' }).first().click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Ehrlicher Hinweis zum Stand', text.includes('Noch kein geprüftes Video'));
pruef('Abspielen vorhanden', text.includes('Abspielen'));
pruef('Geschwindigkeit einstellbar', /Tempo .*-fach/.test(text));
pruef('Untertitel schaltbar', /Untertitel (an|aus)/.test(text));
pruef('Vollbild vorhanden', text.includes('Vollbild'));
pruef('Text zum Video erreichbar', text.includes('Text zum Video anzeigen'));

const video = await page.evaluate(() => {
  const v = document.querySelector('video');
  return v ? { quelle: (v.currentSrc || v.src || '').length, dauer: v.duration, bereit: v.readyState } : null;
});
pruef('Videoelement mit Quelle', (video?.quelle ?? 0) > 0);
pruef('Video ist abspielbereit', (video?.bereit ?? 0) >= 1 && (video?.dauer ?? 0) > 0);

/** Die eingeblendete Untertitelzeile samt gerenderter Schriftgröße. */
const untertitel = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) =>
        d.children.length === 0 &&
        d.textContent &&
        /^(Sie haben drei|Erstens:|Zweitens:|Drittens:|Sie können Ihre Wahl)/.test(d.textContent.trim()),
    );
    return el ? { text: el.textContent.trim(), groesse: parseFloat(getComputedStyle(el).fontSize) } : null;
  });

await page.getByRole('button', { name: 'Abspielen' }).first().click();
await page.waitForTimeout(1200);
const ersteZeile = await untertitel();
pruef('Untertitel wird eingeblendet', ersteZeile !== null);
pruef('Wiedergabezeit läuft', /0:0[1-9]|0:1[0-9]/.test(await page.innerText('body')));

await page.waitForTimeout(3200);
const zweiteZeile = await untertitel();
pruef('Untertitel wechselt mit der Zeit', !!ersteZeile && !!zweiteZeile && ersteZeile.text !== zweiteZeile.text);

await page.getByRole('button', { name: 'Text zum Video anzeigen' }).first().click();
await page.waitForTimeout(600);
pruef('Transkript lesbar', (await page.innerText('body')).includes('Sie können Ihre Wahl später ändern'));

// --------------------- Einstellungen bleiben, Untertitel folgen der Schrift
// Zwei Dinge in einem Durchgang:
//  1. Bedieneinstellungen müssen einen Neustart überleben. Wer große
//     Schrift braucht, darf sie nicht jedes Mal neu einstellen müssen.
//  2. Die Untertitel folgen dieser Einstellung -- der Grund, warum die App
//     sie selbst zeichnet statt sie ins Video zu brennen.
await start();
await page.getByRole('button', { name: 'Bedienung einstellen' }).click();
await page.waitForTimeout(1200);
pruef('Gebärdensprache auch auf anderen Bildschirmen', (await page.innerText('body')).includes('In Gebärdensprache ansehen'));

for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: 'Größer' }).click();
  await page.waitForTimeout(250);
}
const eingestellt = (await page.innerText('body')).match(/Schriftgröße: (\d+) Prozent/)?.[1];

// Vollständiger Neustart der App
await start();
await page.getByRole('button', { name: 'Bedienung einstellen' }).click();
await page.waitForTimeout(1200);
const nachNeustart = (await page.innerText('body')).match(/Schriftgröße: (\d+) Prozent/)?.[1];
pruef(
  `Bedieneinstellung überlebt den Neustart (${eingestellt} % → ${nachNeustart} %)`,
  !!eingestellt && eingestellt === nachNeustart && Number(eingestellt) > 100,
);

await start();
await page.getByRole('button', { name: 'In Gebärdensprache ansehen' }).first().click();
await page.waitForTimeout(1200);
await page.getByRole('button', { name: 'Abspielen' }).first().click();
await page.waitForTimeout(1200);
const grossZeile = await untertitel();
pruef(
  `Untertitel wächst mit der Schrift (${ersteZeile?.groesse} → ${grossZeile?.groesse})`,
  !!ersteZeile && !!grossZeile && grossZeile.groesse > ersteZeile.groesse,
);
await page.screenshot({ path: process.env.SCREENSHOT_GROSS ?? '/dev/null' }).catch(() => {});

console.log('---');
console.log('Seitenfehler:', fehler.length === 0 ? 'keine' : fehler.slice(0, 4));
await browser.close();
server.close();
if (fehler.length > 0 || offen > 0) process.exitCode = 1;

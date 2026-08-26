/**
 * End-to-End-Test im echten Browser: Bedienhilfen, Einfach-Modus,
 * Schriftskalierung, Tippflächen und Fehlermeldungen am Feld.
 *
 * Ablauf:
 *   1. npm run web:export   (erzeugt dist/ mit der Web-Fassung)
 *   2. node e2e/<datei>.mjs
 *
 * Voraussetzung: playwright ist installiert und ein Chromium vorhanden.
 * Der Pfad zum Browser kann ueber CHROMIUM_PATH gesetzt werden.
 *
 * Diese Tests ersetzen keine manuellen Tests mit VoiceOver, TalkBack oder
 * Switch Control -- siehe TESTPLAN.md.
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.WEB_DIST ?? 'dist');
const types = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.json':'application/json', '.css':'text/css' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4173, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
/**
 * Eine Meldung des Browsers, die kein Fehler der App ist: Wird beim
 * Verlassen der Startseite die Startanimation aus der Seite genommen,
 * bevor sie fertig geladen hat, bricht der Browser den Abspielwunsch ab.
 * expo-video faengt die Absage nicht ab, deshalb steht sie in der Konsole.
 * Sichtbar ist davon nichts. Alle anderen Konsolenfehler zaehlen weiter.
 */
const bekannteBrowsermeldung = (t) => t.includes('play() request was interrupted');
page.on('pageerror', (e) => { if (!bekannteBrowsermeldung(String(e))) errors.push(String(e)); });
page.on('console', (m) => { if (m.type() === 'error' && !bekannteBrowsermeldung(m.text())) errors.push(m.text()); });

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const steps = [];
const seen = async (label) => {
  const text = await page.innerText('body');
  steps.push(`${label}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
  return text;
};

let body = await seen('Start');

// 1. Startbildschirm
console.log('Produktname sichtbar:', body.includes('Helpmate'));
console.log('Drei Zugänge:', ['Ich suche Unterstützung','Ich biete Unterstützung an','Ich bin verantwortlich für eine Person'].every(t => body.includes(t)));
console.log('Notfallhinweis:', body.includes('kein Notruf') && body.includes('112'));

// 2. Bedienhilfen
await page.getByRole('button', { name: 'Bedienung einstellen' }).click();
await page.waitForTimeout(1200);
body = await seen('Bedienhilfen');
console.log('Bedienhilfen geöffnet:', body.includes('Bedienmodus') && body.includes('Einfach'));

// Einfach-Modus einschalten und prüfen, dass Leichte Sprache greift
await page.getByTestId('mode-einfach').click();
await page.waitForTimeout(800);
body = await page.innerText('body');
console.log('Einfach-Modus aktiv (Leichte Sprache im Text):', body.includes('Sehr große Knöpfe'));

// Schriftgröße messen
const measure = () => page.evaluate(() => {
  // Gemessen wird eine Theme-Komponente im Seiteninhalt, nicht die
  // Kopfzeile der Navigation -- die kommt von expo-router.
  const el = [...document.querySelectorAll('[role="heading"], [aria-level]')]
    .find(e => e.textContent?.trim() === 'Bedienmodus')
    ?? [...document.querySelectorAll('div,span')].find(e => e.textContent?.trim() === 'Bedienmodus');
  return el ? parseFloat(getComputedStyle(el).fontSize) : null;
});
const before = await measure();
await page.getByRole('button', { name: 'Größer' }).click();
await page.waitForTimeout(600);
const after = await measure();
console.log(`Schrift wächst: ${before} -> ${after}`, after > before);

// Tippflächen messen
const smallTargets = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('[role="button"]')];
  return nodes.filter(n => { const r = n.getBoundingClientRect(); return r.height > 0 && r.height < 48; }).length;
});
console.log('Bedienelemente unter 48 dp:', smallTargets);

// 3. Zurück zum Start und Anfrage-Assistent durchlaufen
await page.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.getByTestId('choice-seek').click();
await page.waitForTimeout(1500);
body = await seen('Assistent');
console.log('Assistent Schritt 1:', body.includes('Schritt 1 von 5'));

// Ohne Auswahl weiter -> Fehler am Feld
await page.getByRole('button', { name: 'Weiter', exact: true }).click();
await page.waitForTimeout(600);
body = await page.innerText('body');
console.log('Fehlermeldung statt stillem Weiter:', body.includes('noch nicht ausgewählt'));

await page.getByTestId('cat-einkaufen').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Weiter', exact: true }).click();
await page.waitForTimeout(800);
body = await page.innerText('body');
console.log('Assistent Schritt 2:', body.includes('Schritt 2 von 5'));

console.log('---');
console.log('Seitenfehler:', errors.length === 0 ? 'keine' : errors.slice(0, 5));


await browser.close();
server.close();
if (errors.length > 0) process.exitCode = 1;

/**
 * End-to-End-Test im echten Browser: die Begleitung durch die App und der
 * Planer mit Kalenderanbindung.
 *
 *   1. npm run web:export
 *   2. CHROMIUM_PATH=... node e2e/begleiter-planer.mjs
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
await new Promise((r) => server.listen(4195, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const kontext = await browser.newContext({ viewport: { width: 414, height: 900 }, acceptDownloads: true });
const page = await kontext.newPage();
const fehler = [];
page.on('pageerror', (e) => fehler.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text().slice(0, 200)); });

let offen = 0;
const pruef = (label, ok) => { if (!ok) offen++; console.log(`${ok ? 'OK  ' : 'FEHLER'}  ${label}`); };
const start = async () => {
  await page.goto('http://localhost:4195/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
};

// -------------------------------------------------------------- Begleitung
await start();
let text = await page.innerText('body');
pruef('Begleitung ist auf der Startseite erreichbar', text.includes('Mika fragen'));

await page.getByRole('button', { name: /Mika fragen/ }).first().click();
await page.waitForTimeout(1200);
text = await page.innerText('body');
pruef('Begleitung stellt sich vor', text.includes('Mika – Ihre Begleitung durch die App'));
pruef('Sagt selbst, dass sie kein Mensch ist', text.includes('kein Mensch'));
pruef('Erklärt, wo man ist', text.includes('Wo Sie gerade sind'));
pruef('Erklärt, was man tun kann', text.includes('Das können Sie hier tun'));
pruef('Erklärt, was danach passiert', text.includes('Was danach passiert'));
pruef('Behauptet nicht, selbst zu gebärden', text.includes('Ich gebärde nicht selbst'));
pruef('Bietet Gebärdensprache an', text.includes('In Gebärdensprache ansehen'));
pruef('Bietet Rückfragen an', text.includes('Sie können mich das fragen'));
await page.screenshot({ path: process.env.SHOT_BEGLEITER ?? '/dev/null' }).catch(() => {});

await page.getByRole('button', { name: 'Wer sieht meine Daten?' }).click();
await page.waitForTimeout(600);
text = await page.innerText('body');
pruef('Antwortet auf eine Rückfrage', text.includes('Ihre genaue Adresse und Ihre Telefonnummer'));
pruef('Antwort ist vorlesbar', text.includes('Antwort vorlesen'));

await page.getByRole('button', { name: 'Ich brauche sofort Hilfe.' }).click();
await page.waitForTimeout(600);
pruef('Verweist im Notfall auf 112', (await page.innerText('body')).includes('112'));

// Begleitung führt weiter
await page.getByRole('button', { name: 'Ich suche Unterstützung', exact: true }).last().click();
await page.waitForTimeout(1800);
text = await page.innerText('body');
pruef('Begleitung führt zum nächsten Schritt', text.includes('Schritt 1 von 5'));

await page.getByRole('button', { name: /Mika fragen/ }).first().click();
await page.waitForTimeout(1000);
text = await page.innerText('body');
pruef('Begleitung kennt den Assistenten-Schritt', text.includes('Sie sind bei Schritt 1 von 5'));
pruef('Erklärt die Fachkraft-Regel', text.includes('nur für geprüfte Fachkräfte'));

// ------------------------------------------------------------------ Planer
await start();
await page.getByTestId('choice-offer').click();
await page.waitForTimeout(1800);
// Ueber die Oberflaeche statt ueber die Adresse: wer schon ein Profil hat,
// muss nicht noch einmal durch die Einrichtung.
await page.getByRole('button', { name: /Ich habe schon ein Profil/ }).click();
await page.waitForTimeout(2000);
text = await page.innerText('body');
pruef('Planer öffnet sich', text.includes('Mein Planer'));
pruef('Zeigt eine Woche', /Woche ab \d+\./.test(text));
pruef('Wochen sind blätterbar', text.includes('Woche zurück') && text.includes('Woche vor'));
pruef('Sagt, was im Kalender steht', text.includes('Was im Kalender steht'));
pruef('Nennt, was nicht im Kalender steht', text.includes('Genaue Adresse'));
await page.screenshot({ path: process.env.SHOT_PLANER ?? '/dev/null', fullPage: true }).catch(() => {});

await page.getByRole('button', { name: 'Kalender verbinden' }).click();
await page.waitForTimeout(900);
text = await page.innerText('body');
pruef('Abo-Adresse wird gezeigt', text.includes('webcal://'));
pruef('Warnt vor der Weitergabe des Links', text.includes('wie ein Schlüssel'));
pruef('Link lässt sich zurückziehen', text.includes('Neuen Link erzeugen'));

const alt = (await page.innerText('body')).match(/webcal:\/\/\S+/)?.[0];
await page.getByRole('button', { name: 'Neuen Link erzeugen' }).click();
await page.waitForTimeout(800);
const neu = (await page.innerText('body')).match(/webcal:\/\/\S+/)?.[0];
pruef('Neuer Link ersetzt den alten', !!alt && !!neu && alt !== neu);

// ------------------------------------------------- Kalenderdatei erzeugen
const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
await page.getByRole('button', { name: 'Alle Einsätze als Datei teilen' }).click();
const datei = await download;
pruef('Kalenderdatei wird erzeugt', datei !== null);
if (datei) {
  const ziel = path.join(process.env.TMPDIR ?? '/tmp', 'planer.ics');
  await datei.saveAs(ziel);
  const inhalt = fs.readFileSync(ziel, 'utf8');
  pruef('Datei ist ein gültiger Kalender', inhalt.startsWith('BEGIN:VCALENDAR'));
  pruef('Enthält keine Namen', !/Kessler|Naumann|Jonas/.test(inhalt));
  pruef('Enthält keine Wohnadresse', !inhalt.includes('Beispielweg'));
}

console.log('---');
console.log('Seitenfehler:', fehler.length === 0 ? 'keine' : fehler.slice(0, 4));
await browser.close();
server.close();
if (fehler.length > 0 || offen > 0) process.exitCode = 1;

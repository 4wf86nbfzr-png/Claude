/**
 * End-to-End-Test im echten Browser: die drei Zugänge auf der Startseite
 * und der Ablauf für verantwortliche Personen.
 *
 *   1. npm run web:export
 *   2. CHROMIUM_PATH=... node e2e/verantwortliche.mjs
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
await new Promise((r) => server.listen(4193, r));

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
  await page.goto('http://localhost:4193/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
};

// ------------------------------------------------- Drei Zugänge, Reihenfolge
await start();
const reihenfolge = await page.evaluate(() =>
  ['choice-seek', 'choice-offer', 'choice-responsible'].map((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    return el ? Math.round(el.getBoundingClientRect().top) : -1;
  }),
);
pruef('Alle drei Zugänge vorhanden', reihenfolge.every((y) => y > 0));
pruef('Hilfesuchende stehen oben', reihenfolge[0] < reihenfolge[1] && reihenfolge[1] < reihenfolge[2]);

let text = await page.innerText('body');
pruef('Zugang für Dienstleister', text.includes('Ich biete Unterstützung an'));
pruef('Zugang für Verantwortliche', text.includes('Ich bin verantwortlich für eine Person'));
pruef('Bedienhilfe bleibt als Nebenweg erreichbar', text.includes('Jemand hilft mir beim Bedienen'));
await page.screenshot({ path: process.env.SHOT_START ?? '/dev/null' }).catch(() => {});

// --------------------------------------------------- Bereich Verantwortliche
await page.getByTestId('choice-responsible').click();
await page.waitForTimeout(2000);
text = await page.innerText('body');
pruef('Übersicht öffnet sich', text.includes('Meine Verantwortung'));
pruef('Offene Freigabe wird angezeigt', /Wartet auf Sie|Überfällig/.test(text));
pruef('Klient wird genannt', text.includes('Herr Naumann (Demo)'));
pruef('Stufe wird benannt', text.includes('Verantwortung und geben frei'));
pruef('Kein heimlicher Einblick', text.includes('Die Person entscheidet mit'));
await page.screenshot({ path: process.env.SHOT_UEBERSICHT ?? '/dev/null' }).catch(() => {});

// ---------------------------------------------------------- Entscheiden
await page.getByRole('button', { name: 'Ansehen und entscheiden' }).first().click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Worum es geht steht da', text.includes('Worum es geht'));
pruef('Ohne Antwort passiert nichts', text.includes('Antworten Sie gar nicht, passiert nichts'));

// Ablehnen verlangt eine Begründung
await page.getByRole('button', { name: 'Nein, ich stimme nicht zu' }).click();
await page.waitForTimeout(600);
const gesperrt = await page
  .getByRole('button', { name: 'Nein, mit dieser Begründung ablehnen' })
  .getAttribute('disabled');
pruef('Ablehnen ohne Begründung ist gesperrt', gesperrt !== null);

await page.getByLabel('Warum stimmen Sie nicht zu?').fill('An dem Tag ist schon ein Arzttermin.');
await page.waitForTimeout(400);
const frei = await page
  .getByRole('button', { name: 'Nein, mit dieser Begründung ablehnen' })
  .getAttribute('disabled');
pruef('Mit Begründung wird das Ablehnen möglich', frei === null);
await page.screenshot({ path: process.env.SHOT_FREIGABE ?? '/dev/null' }).catch(() => {});

// Wir stimmen stattdessen zu -- der freundlichere Weg für den Test
await page.getByRole('button', { name: 'Ja, ich stimme zu' }).click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Zustimmung wird bestätigt', text.includes('Ihre Antwort ist raus'));
pruef('Entscheidet nicht an ihrer Stelle', text.includes('kann jetzt weitermachen'));

await page.getByRole('button', { name: 'Zur Übersicht' }).click();
await page.waitForTimeout(1500);
pruef('Übersicht ist danach leer', (await page.innerText('body')).includes('Gerade wartet nichts auf Sie'));

// ------------------------------------------- Einrichtung schützt die Person
await page.getByRole('button', { name: 'Eine Person neu einrichten' }).click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Einrichtung nur gemeinsam', text.includes('Nicht ohne die Person'));

await page.getByLabel('Konto-Kennung der Person').fill('u_seeker_2');
await page.getByRole('button', { name: 'Weiter', exact: true }).click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'Weiter', exact: true }).click();
await page.waitForTimeout(600);
text = await page.innerText('body');
pruef('Begleitung ist die Voreinstellung', text.includes('Sie entscheiden nichts'));

await page.getByRole('button', { name: /^Verantwortung\./ }).first().click().catch(async () => {
  await page.getByText('Verantwortung', { exact: true }).first().click();
});
await page.waitForTimeout(800);
text = await page.innerText('body');
pruef('Warnung vor dem Eingriff', text.includes('Das ist ein Eingriff'));

// Die Rechtsgrundlage wird erst gefragt, wenn wirklich etwas freigegeben
// werden soll -- vorher gibt es nichts zu begründen.
pruef('Ohne gewählte Freigabe keine Grundlagenfrage', !text.includes('Gerichtlicher Einwilligungsvorbehalt'));
await page.getByText('Verbindliche Termine', { exact: true }).first().click();
await page.waitForTimeout(800);
text = await page.innerText('body');
pruef('Rechtsgrundlage wird abgefragt', text.includes('Gerichtlicher Einwilligungsvorbehalt'));
pruef('Eigener Wunsch ist widerrufbar', text.includes('jederzeit allein wieder beenden'));

console.log('---');
console.log('Seitenfehler:', fehler.length === 0 ? 'keine' : fehler.slice(0, 4));
await browser.close();
server.close();
if (fehler.length > 0 || offen > 0) process.exitCode = 1;

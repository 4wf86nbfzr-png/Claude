/**
 * End-to-End-Test im echten Browser: die Sprachfuehrung und die
 * Verstaendigung fuer Menschen, die nicht sprechen koennen.
 *
 *   1. npm run web:export
 *   2. CHROMIUM_PATH=... node e2e/mika-sprache.mjs
 *
 * Zuhoeren selbst laesst sich hier nicht pruefen: Chromium liefert die Web
 * Speech API im Test nicht aus. Geprueft wird deshalb der Weg, der auf
 * jedem Geraet funktioniert -- tippen und auswaehlen. Genau das ist der
 * Grund, warum dieser Weg ueberhaupt gleichberechtigt gebaut ist.
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
await new Promise((r) => server.listen(4196, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const kontext = await browser.newContext({ viewport: { width: 414, height: 900 } });
const page = await kontext.newPage();
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
  await page.goto('http://localhost:4196/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
};

// ------------------------------------------------------------- Startseite
await start();
let text = await page.innerText('body');
pruef('Startseite bietet die Sprachführung an', text.includes('Sagen Sie einfach, was Sie brauchen'));
pruef('Startseite bietet die Verständigung an', text.includes('Ich kann nicht sprechen'));
pruef('Die drei Zugänge bleiben erhalten', text.includes('Ich suche Unterstützung')
  && text.includes('Ich biete Unterstützung an')
  && text.includes('Ich bin verantwortlich für eine Person'));

// ---------------------------------------------------------- Sprachführung
await page.getByTestId('choice-mika').click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Mika begrüßt und stellt die Frage', text.includes('Was kann ich für Sie tun?'));
pruef('Mika sagt im selben Zug, dass sie kein Mensch ist', text.includes('kein Mensch'));
pruef('Tippen steht gleichberechtigt daneben', text.includes('Oder tippen Sie es'));
pruef('Beispielsätze stehen als Knöpfe bereit', text.includes('Ich möchte zum Arzt begleitet werden.'));
pruef('Sagt, was sie nicht tut', text.includes('Was ich nicht tue'));
pruef('Bietet Rückfragen an', text.includes('Verstehst du mich falsch?'));
pruef('Bucht nichts auf Zuruf', text.includes('nie'));

// Ein getippter Satz muss denselben Weg gehen wie ein gesprochener.
await page.getByTestId('feld-wunsch').fill('Ich möchte einen begleiteten Arztbesuch');
await page.getByTestId('wunsch-auswerten').click();
await page.waitForTimeout(1000);
text = await page.innerText('body');
pruef('Zeigt wörtlich, was verstanden wurde', text.includes('Ich möchte einen begleiteten Arztbesuch'));
pruef('Benennt die erkannte Leistung', text.includes('Begleitung zu Terminen'));
pruef('Fragt vor dem Weitergehen nach', text.includes('Ja, bringen Sie mich zur Anfrage'));
pruef('Lässt sich widersprechen', text.includes('Nein, das war nicht richtig'));

// Ein unverständlicher Satz darf nicht geraten werden.
await page.getByRole('button', { name: 'Nein, das war nicht richtig' }).click();
await page.waitForTimeout(500);
await page.getByTestId('feld-wunsch').fill('Blauer Montag Fahrrad');
await page.getByTestId('wunsch-auswerten').click();
await page.waitForTimeout(800);
text = await page.innerText('body');
pruef('Rät nicht, wenn nichts erkennbar ist', !text.includes('Ja, bringen Sie mich'));
pruef('Sagt offen, dass sie nichts damit anfangen kann', text.includes('weiß damit aber noch nichts anzufangen'));

// Notruf schlägt jede Kategorie.
await page.getByTestId('feld-wunsch').fill('Ich brauche einen Notruf, mein Arzt ist nicht da');
await page.getByTestId('wunsch-auswerten').click();
await page.waitForTimeout(800);
text = await page.innerText('body');
pruef('Notfall geht vor jeder Buchung', text.includes('112'));
pruef('Sagt, dass die App kein Notruf ist', text.includes('kein Notruf'));

// ------------------------------------- Führung füllt die Anfrage schon aus
await page.getByTestId('feld-wunsch').fill('Ich brauche Hilfe beim Einkaufen');
await page.getByTestId('wunsch-auswerten').click();
await page.waitForTimeout(800);
await page.getByTestId('wunsch-weiter').click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Führt in die Anfrage', text.includes('Wobei brauchen Sie Hilfe?'));
pruef('Zeigt, woher die Vorauswahl kommt', text.includes('Aus Ihrem Satz'));
const einkauf = await page.getByTestId('cat-einkaufen').innerText();
const spazieren = await page.getByTestId('cat-spaziergang').innerText();
pruef('Hat die erkannte Kategorie schon angekreuzt', einkauf.includes('✓'));
pruef('Kreuzt nichts an, was nicht gesagt wurde', !spazieren.includes('✓'));
pruef('Ist noch nichts abgeschickt', !text.includes('Ihre Anfrage ist unterwegs'));

// ------------------------------------------------------- Verständigung
await start();
await page.getByTestId('zu-mika-verstaendigung').click();
await page.waitForTimeout(1500);
text = await page.innerText('body');
pruef('Verständigung öffnet sich', text.includes('Was ich sagen möchte'));
pruef('Sagt, dass es kein Gebärdensprach-Übersetzer ist',
  text.includes('Das ist kein Gebärdensprach-Übersetzer'));
pruef('Nennt Gebärdensprache als eigene Sprache', text.includes('eigene Sprache'));
pruef('Verweist für Wichtiges auf dolmetschende Personen', text.includes('dolmetschende Person'));
pruef('Hat eine Karte für "Ich kann nicht sprechen"', text.includes('Ich kann nicht sprechen'));
pruef('Hat Karten für Grenzen', text.includes('Bitte nicht anfassen'));
pruef('Beantwortet die Frage nach Gebärdensprache offen', text.includes('Ist das Gebärdensprache?'));

// Aus Karten wird ein Satz.
await page.getByTestId('karte-nicht_verstanden').click();
await page.waitForTimeout(300);
await page.getByTestId('karte-langsamer').click();
await page.waitForTimeout(400);
const satz = await page.getByTestId('mika-satz').innerText();
pruef('Karten ergeben einen Satz',
  satz.includes('Ich habe das nicht verstanden') && satz.includes('langsamer'));

await page.getByTestId('mika-freitext').fill('Ich heiße Anna');
await page.waitForTimeout(400);
pruef('Getippter Text hängt sich an',
  (await page.getByTestId('mika-satz').innerText()).includes('Ich heiße Anna'));

await page.getByTestId('mika-sprechen').click();
await page.waitForTimeout(800);
text = await page.innerText('body');
pruef('Gesagtes steht im Gespräch', text.includes('Das Gespräch') && text.includes('Ich heiße Anna'));
pruef('Der Satz ist danach leer',
  (await page.getByTestId('mika-satz').innerText()).includes('Noch nichts ausgewählt'));

// Die andere Seite antwortet.
await page.getByTestId('antwort-verstanden').click();
await page.waitForTimeout(600);
text = await page.innerText('body');
pruef('Antwort des Gegenübers erscheint', text.includes('Mein Gegenüber'));
pruef('Gespräch bleibt auf dem Gerät', text.includes('nicht gespeichert'));

await page.getByTestId('mika-verlauf-loeschen').click();
await page.waitForTimeout(600);
text = await page.innerText('body');
pruef('Gespräch lässt sich löschen', !text.includes('Mein Gegenüber'));

// Ehrlichkeit über die Wege zur Gebärdensprache.
await page.getByRole('button', { name: 'Welche Wege gibt es noch?' }).click();
await page.waitForTimeout(600);
text = await page.innerText('body');
pruef('Nennt genau einen Weg, der heute läuft', text.includes('✓ Läuft heute'));
pruef('Nennt Ferndolmetschen als offenen Schritt', text.includes('Ferndolmetsch'));
pruef('Verspricht keine Gebärdenerkennung', text.includes('gibt es hier nicht'));

console.log('---');
console.log('Seitenfehler:', fehler.length === 0 ? 'keine' : fehler.slice(0, 4));
await browser.close();
server.close();
if (fehler.length > 0 || offen > 0) process.exitCode = 1;

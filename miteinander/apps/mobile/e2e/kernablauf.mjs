/**
 * End-to-End-Test im echten Browser: Kernablauf von der Anfrage bis zur
 * Buchungsbestätigung.
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
const types = { '.html':'text/html', '.js':'text/javascript', '.png':'image/png', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let file = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4174, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 414, height: 900 } });
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

let failed = 0;
const check = (label, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}`);
};
const weiter = async () => { await page.getByRole('button', { name: 'Weiter', exact: true }).click(); await page.waitForTimeout(700); };

await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

await page.getByTestId('choice-seek').click();
await page.waitForTimeout(1500);

// Schritt 1: Wobei
await page.getByTestId('cat-begleitung_termine').click();
await page.waitForTimeout(300);
await weiter();

// Schritt 2: Wann
await page.getByTestId('feld-zeitpunkt').fill('2026-09-04T10:00:00.000Z');
await page.getByRole('button', { name: '1.5 Std.', exact: true }).click().catch(async () => {
  await page.getByRole('button', { name: '2 Std.', exact: true }).click();
});
await page.waitForTimeout(300);
await weiter();
let body = await page.innerText('body');
check('Schritt 3 erreicht (Ort)', body.includes('Schritt 3 von 5'));

// Schritt 3: Wo
await page.getByTestId('feld-ort').fill('Hamburg');
await page.getByTestId('feld-postleitzahl').fill('221');
await page.waitForTimeout(300);
await weiter();

// Schritt 4: Wichtig
body = await page.innerText('body');
check('Schritt 4 erreicht (Was ist wichtig)', body.includes('Schritt 4 von 5'));
await page.getByRole('button', { name: 'Rollator', exact: true }).click();
await page.waitForTimeout(300);
await weiter();

// Schritt 5: Zusammenfassung
body = await page.innerText('body');
check('Zusammenfassung sichtbar', body.includes('Schritt 5 von 5') && body.includes('Wobei brauchen Sie Hilfe'));
check('Leichte Sprache in der Zusammenfassung', body.includes('In Leichter Sprache'));
check('"Was passiert jetzt?" erklärt', body.includes('Was passiert jetzt?'));
check('Adresse bleibt geheim wird zugesagt', body.includes('Adresse und Ihre Telefonnummer bleiben geheim'));

// Absenden -> Vorschläge
await page.getByRole('button', { name: 'Anfrage jetzt absenden' }).click();
await page.waitForTimeout(2000);
body = await page.innerText('body');
check('Vorschläge werden angezeigt', body.includes('Diese Menschen passen zu Ihnen'));
check('Fachkraft vorgeschlagen', body.includes('Meike (Demo)'));
check('Begründung sichtbar', body.includes('Warum wir diese Person vorschlagen'));
check('Entfernung nur grob', /etwa \d+ km entfernt|in Ihrer Nähe/.test(body) && !/\d+\.\d+ km/.test(body));
check('Preis genannt', body.includes('Euro pro Stunde') || body.includes('ehrenamtlich'));


// Profil öffnen
await page.getByRole('button', { name: 'Profil ansehen' }).first().click();
await page.waitForTimeout(1500);
body = await page.innerText('body');
check('Profil zeigt geprüfte Nachweise', body.includes('Das wurde geprüft'));
check('Profil zeigt, was NICHT angeboten wird', body.includes('ausdrücklich nicht'));
check('Keine pauschale Vertrauensaussage', body.includes('kein allgemeines Versprechen'));
check('Ungeprüfte DGS-Angabe gekennzeichnet', body.includes('Noch nicht geprüft'));


// Nachricht schreiben -> Chat -> Termin vorschlagen -> Buchung
await page.getByRole('button', { name: 'Nachricht schreiben' }).click();
await page.waitForTimeout(1500);
body = await page.innerText('body');
check('Chat geöffnet', body.includes('Nachrichten'));
check('Sprachnachricht verlangt Text', body.includes('Text zur Sprachnachricht'));

await page.getByRole('button', { name: 'Termin vorschlagen' }).click();
await page.waitForTimeout(2000);
body = await page.innerText('body');
check('Buchungszusammenfassung erscheint', body.includes('Bitte prüfen Sie Ihre Buchung'));
check('Kosten stehen drin', body.includes('Kosten'));
check('Absage-Regel steht drin', body.includes('Wenn Sie absagen'));
check('Bestätigen erst nach Lesebestätigung', body.includes('Ich habe alles gelesen'));


// Verbindlich buchen ist gesperrt, solange nicht gelesen
const disabledBefore = await page.getByRole('button', { name: 'Ja, Termin verbindlich buchen' }).getAttribute('disabled');
check('Buchen gesperrt vor Lesebestätigung', disabledBefore !== null);

await page.getByRole('button', { name: 'Ich habe alles gelesen' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Ja, Termin verbindlich buchen' }).click();
await page.waitForTimeout(1500);
body = await page.innerText('body');
check('Nur eine Bestätigung reicht nicht', body.includes('Jetzt fehlt noch die Bestätigung der anderen Person'));

console.log('---');
console.log('Seitenfehler:', errors.length === 0 ? 'keine' : errors.slice(0, 5));
await browser.close();
server.close();
if (errors.length > 0 || failed > 0) process.exitCode = 1;

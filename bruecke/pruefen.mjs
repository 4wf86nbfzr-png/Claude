#!/usr/bin/env node
/* ============================================================
   Selbsttest — laeuft hier alles?
   ------------------------------------------------------------
   Geht der Reihe nach durch, was fuer den taeglichen Betrieb
   gebraucht wird, und sagt bei jedem Punkt, was zu tun ist,
   wenn er fehlt. Nichts davon aendert etwas.

       npm run pruefen
   ============================================================ */
import { readFile, writeFile, unlink, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { konfigLaden, HIER } from './konfig.mjs';

const zeilen = [];
let schlimm = 0, mittel = 0;

function gut(was, mehr)   { zeilen.push(['  ✓', was, mehr || '']); }
function warn(was, tun)   { mittel++; zeilen.push(['  !', was, tun || '']); }
function schlecht(was, tun) { schlimm++; zeilen.push(['  ✗', was, tun || '']); }

function portBelegt(port, host = '127.0.0.1') {
  return new Promise((fertig) => {
    const draht = createConnection({ port, host });
    const schliessen = (ergebnis) => { draht.destroy(); fertig(ergebnis); };
    draht.setTimeout(700);
    draht.on('connect', () => schliessen(true));
    draht.on('timeout', () => schliessen(false));
    draht.on('error', () => schliessen(false));
  });
}

async function paketDa(name) {
  try { await import(name); return true; } catch (f) { return false; }
}

const konfig = await konfigLaden().catch((f) => {
  console.error('\n  konfig.json ist unbrauchbar: ' + f.message + '\n');
  process.exit(1);
});

/* ---- 1 Grundlagen ---- */
const knoten = Number(process.versions.node.split('.')[0]);
if (knoten >= 20) gut('Node ' + process.versions.node);
else schlecht('Node ' + process.versions.node + ' ist zu alt', 'Node 20 oder neuer installieren');

if (existsSync(path.join(HIER, 'konfig.json'))) gut('konfig.json vorhanden');
else warn('konfig.json fehlt', 'cp konfig.beispiel.json konfig.json');

try {
  const probe = path.join(konfig.ordner.daten, '.schreibprobe');
  await writeFile(probe, 'x');
  await unlink(probe);
  gut('daten/ ist beschreibbar', konfig.ordner.daten);
} catch (f) {
  schlecht('daten/ ist nicht beschreibbar', f.message);
}

if (konfig.token) gut('Schluessel vorhanden', 'daten/token.txt');
else schlecht('kein Schluessel', 'einmal "npm start" ausfuehren');

/* ---- 2 Bruecke ---- */
if (await portBelegt(konfig.port)) gut('Bruecke laeuft auf Port ' + konfig.port);
else warn('Bruecke laeuft nicht', 'npm start');

if (konfig.host === '0.0.0.0') gut('im Bueronetz erreichbar (host 0.0.0.0)', 'nur hinter Firewall/VPN betreiben');
else gut('nur auf diesem Rechner erreichbar', 'fuer Kollegen: "host": "0.0.0.0" in konfig.json');

/* ---- 3 Zusatzpakete ---- */
const playwright = await paketDa('playwright');
const tesseract  = await paketDa('tesseract.js');
const nodemailer = await paketDa('nodemailer');

if (playwright) {
  gut('Playwright installiert');
  try {
    const { chromium } = await import('playwright');
    const pfad = konfig.secplan.browserPfad || process.env.HST_BROWSER || '';
    const browser = await chromium.launch(pfad ? { executablePath: pfad } : {});
    await browser.close();
    gut('Browser startet');
  } catch (f) {
    schlecht('Browser startet nicht', 'npx playwright install chromium');
  }
} else {
  warn('Playwright fehlt', 'npm install playwright && npx playwright install chromium — ohne das traegt niemand die Zeiten in secplan ein');
}

if (tesseract) {
  gut('Texterkennung installiert');
  const sprachdaten = konfig.ocr.datenPfad || konfig.ocr.zwischenlager;
  const datei = path.join(sprachdaten, (konfig.ocr.sprache || 'deu') + '.traineddata' + (konfig.ocr.gepackt === false ? '' : '.gz'));
  if (existsSync(datei)) gut('Sprachdaten liegen bereit', datei);
  else warn('Sprachdaten noch nicht geholt', 'werden beim ersten Foto aus dem Netz geladen');
} else {
  warn('Texterkennung fehlt', 'npm install tesseract.js — nur noetig fuer getippte Listen als Foto');
}

if (konfig.mail.aktiv) {
  if (nodemailer && konfig.mail.an.length) gut('Morgenmail eingerichtet', konfig.mail.an.join(', '));
  else if (!nodemailer) schlecht('Morgenmail an, aber nodemailer fehlt', 'npm install nodemailer');
  else schlecht('Morgenmail an, aber kein Empfaenger', 'mail.an in konfig.json fuellen');
} else {
  gut('Morgenmail aus', 'einschalten in konfig.json unter mail.aktiv');
}

/* ---- 4 Beispieldateien und Einzeldatei ---- */
for (const [datei, was] of [
  ['beispiel/abgleichliste-beispiel.pdf', 'Beispiel-Abgleichliste'],
  ['beispiel/stundenzettel-beispiel.csv', 'Beispiel-Stundenzettel']
]) {
  if (existsSync(path.join(HIER, datei))) gut(was + ' vorhanden');
  else warn(was + ' fehlt', 'npm run beispiele');
}
if (existsSync(path.join(konfig.wurzel, 'Schichtabgleich.html'))) gut('Einzeldatei zum Weitergeben vorhanden');
else warn('Einzeldatei fehlt', 'npm run bauen');

/* ---- 5 secplan ---- */
if (konfig.modus !== 'browser') {
  gut('Modus "' + konfig.modus + '"', 'zum Selbst-Eintragen: npm run einrichten');
} else if (!konfig.secplan.planAdresse) {
  schlecht('Modus browser, aber keine Adresse des Tagesplans', 'npm run einrichten');
} else if (!playwright) {
  schlecht('Modus browser, aber Playwright fehlt', 'npm install playwright');
} else {
  const hatZugang = !!(konfig.zugang.benutzer && konfig.zugang.passwort);
  const hatSitzung = existsSync(path.join(konfig.ordner.daten, 'sitzung.json'));
  if (hatZugang) gut('Zugangsdaten in .env hinterlegt');
  else if (hatSitzung) gut('gespeicherte Sitzung vorhanden', 'daten/sitzung.json');
  else schlecht('weder Zugangsdaten noch Sitzung', '.env fuellen oder "npm run anmeldung"');

  if (hatZugang || hatSitzung) {
    process.stdout.write('  … verbinde mit secplan, das dauert einen Moment');
    try {
      const secplan = await import('./secplan.mjs');
      const heute = new Date().toISOString().slice(0, 10);
      const teile = await secplan.werkzeug.angemeldetOeffnen(
        konfig, secplan.werkzeug.planAdresseFuer(konfig, heute));
      try {
        const angemeldet = !(await secplan.werkzeug.anmeldemaskeDa(teile.seite));
        process.stdout.write('\r' + ' '.repeat(60) + '\r');
        if (angemeldet) gut('bei secplan angemeldet');
        else schlecht('secplan zeigt die Anmeldung', 'npm run anmeldung');

        const zaehler = await teile.seite.evaluate(() => {
          const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          let n = 0;
          for (const el of document.querySelectorAll('tr, li, [role="row"]')) {
            if (!sichtbar(el)) continue;
            const text = (el.innerText || '').replace(/\s+/g, ' ');
            if (text.length < 500 && (text.match(/\b\d{1,2}[:.]\d{2}\b/g) || []).length >= 2) n++;
          }
          return n;
        });
        if (zaehler) gut('Tagesplan lesbar', zaehler + ' Schichtzeilen fuer heute');
        else warn('heute keine Schichtzeilen gefunden', 'entweder steht heute nichts an, oder die Adresse stimmt nicht — npm run einrichten');
      } finally {
        await teile.browser.close();
      }
    } catch (f) {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      schlecht('secplan nicht erreichbar', String(f.message).split('\n')[0].slice(0, 120));
    }
  }
  if (konfig.probelauf) warn('Probelauf ist an', 'es wird nichts in secplan geschrieben — "probelauf": false, wenn es stimmt');
  else gut('Probelauf ist aus', 'Freigaben werden wirklich eingetragen');
}

/* ---- Ausgabe ---- */
console.log('\n  Selbsttest\n  ' + '─'.repeat(66));
const breite = Math.max(...zeilen.map((z) => z[1].length));
for (const [zeichen, was, mehr] of zeilen) {
  console.log(zeichen + ' ' + was.padEnd(breite + 2) + (mehr ? '· ' + mehr : ''));
}
console.log('  ' + '─'.repeat(66));
if (schlimm) console.log(`  ${schlimm} Sache${schlimm === 1 ? '' : 'n'} fehlt, ${mittel} Hinweis${mittel === 1 ? '' : 'e'}.`);
else if (mittel) console.log(`  Alles Noetige da, ${mittel} Hinweis${mittel === 1 ? '' : 'e'}.`);
else console.log('  Alles in Ordnung.');
console.log('');
process.exit(schlimm ? 1 : 0);

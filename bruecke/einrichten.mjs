#!/usr/bin/env node
/* ============================================================
   Einrichten: die Bruecke lernt den Weg zu secplan
   ------------------------------------------------------------
   Einmalig, dauert ein paar Minuten:

       npm run einrichten

   Es oeffnet sich ein Browserfenster. Dort anmelden (auch mit
   Zwei-Faktor, Cookie-Hinweis, Mandantenwahl), den Tagesplan
   eines Tages oeffnen, an dem Schichten stehen — und hier Enter
   druecken. Den Rest findet die Bruecke selbst: die Adresse des
   Tagesplans mit dem Datum als Platzhalter, und ob sie auf der
   Seite Schichtzeilen erkennt.

   Nichts wird dabei geaendert. Der erste richtige Lauf ist ein
   Probelauf; erst wenn der stimmt, wird geschrieben.

   Nicht interaktiv (fuer den zweiten Rechner, wenn die Adresse
   schon bekannt ist):

       node einrichten.mjs --plan "https://…/plan?tag=2026-09-08"
   ============================================================ */
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { konfigLaden, HIER } from './konfig.mjs';
import { werkzeug } from './secplan.mjs';

const argumente = process.argv.slice(2);
function argument(name) {
  const i = argumente.indexOf('--' + name);
  return i >= 0 ? (argumente[i + 1] || true) : null;
}

/* Die Tastatur wird erst geholt, wenn wirklich gefragt wird — sonst
   haengt schon das blosse Einbinden dieser Datei an der Eingabe. */
let leser = null;
function tastatur() {
  if (!leser) leser = readline.createInterface({ input: process.stdin, output: process.stdout });
  return leser;
}

function frage(text, vorgabe) {
  if (!process.stdin.isTTY) return Promise.resolve(vorgabe || '');
  return new Promise((fertig) => {
    tastatur().question(text + (vorgabe ? ` [${vorgabe}] ` : ' '), (a) => fertig((a || '').trim() || vorgabe || ''));
  });
}

/* Aus einer Adresse mit Datum eine Vorlage machen:
   …/plan?tag=2026-09-08  ->  …/plan?tag={datum} */
export function adresseZurVorlage(adresse) {
  let vorlage = adresse;
  let gefunden = null;
  vorlage = vorlage.replace(/\d{4}-\d{2}-\d{2}/, (t) => { gefunden = t; return '{datum}'; });
  if (!gefunden) {
    vorlage = vorlage.replace(/\d{1,2}\.\d{1,2}\.\d{4}/, (t) => { gefunden = t; return '{datum_de}'; });
  }
  if (!gefunden) {
    // Manche Anwendungen zaehlen in Tagen oder benutzen JJJJMMTT.
    vorlage = vorlage.replace(/\b(20\d{2})(\d{2})(\d{2})\b/, (t, j, m, d) => {
      gefunden = `${j}-${m}-${d}`; return '{datum_kompakt}';
    });
  }
  return { vorlage, datum: gefunden };
}

/* Wie viele Zeilen mit zwei Uhrzeiten stehen auf der Seite?
   Das ist die Probe, ob die Adresse wirklich ein Tagesplan ist. */
const ZEILEN_ZAEHLEN = () => {
  const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const zeit = /\b\d{1,2}[:.]\d{2}\b/g;
  const treffer = [];
  for (const el of document.querySelectorAll('tr, li, [role="row"]')) {
    if (!sichtbar(el)) continue;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    if (text.length > 500) continue;
    const zeiten = text.match(zeit) || [];
    if (zeiten.length >= 2) treffer.push(text.slice(0, 120));
  }
  return treffer.slice(0, 8);
};

async function konfigDateiLaden() {
  const ziel = path.join(HIER, 'konfig.json');
  if (!existsSync(ziel)) {
    await copyFile(path.join(HIER, 'konfig.beispiel.json'), ziel);
    console.log('konfig.json aus der Vorlage angelegt.');
  }
  return { ziel, inhalt: JSON.parse(await readFile(ziel, 'utf8')) };
}

async function los() {
  const konfig = await konfigLaden();
  const { ziel, inhalt } = await konfigDateiLaden();

  console.log('\n  Einrichtung der Bruecke zu secplan');
  console.log('  ---------------------------------------------');

  const start = await frage('Adresse von secplan:', inhalt.secplan.adresse || 'https://www.secplan.net/');
  konfig.secplan.adresse = start;

  let planAdresse = argument('plan');
  // Nur wenn wirklich jemand davor sitzt, wird ein Fenster geoeffnet.
  konfig.secplan.kopfmodus = !planAdresse && !argument('unsichtbar');
  let seite, browser, kontext;

  if (!planAdresse) {
    console.log('\n  Es oeffnet sich gleich ein Fenster.');
    if (konfig.zugang.benutzer) console.log('  Die Anmeldung wird versucht; falls etwas fehlt, bitte im Fenster ergaenzen.');
    else console.log('  Bitte dort anmelden (die Zugangsdaten koennen auch in bruecke/.env stehen).');

    const teile = await werkzeug.browserOeffnen(konfig, { sichtbar: true });
    ({ browser, kontext, seite } = teile);
    await seite.goto(start, { waitUntil: 'domcontentloaded' });

    if (konfig.zugang.benutzer && await werkzeug.anmeldemaskeDa(seite)) {
      try { await werkzeug.anmeldungAusfuehren(konfig, seite); }
      catch (f) { console.log('  (' + f.message + ')'); }
    }

    await frage('\n  Jetzt in secplan den TAGESPLAN eines Tages mit Schichten oeffnen.\n' +
                '  Fertig? Dann hier Enter druecken.');
    planAdresse = seite.url();
  }

  const { vorlage, datum } = adresseZurVorlage(planAdresse);
  console.log('\n  Tagesplan:  ' + planAdresse);
  if (datum) {
    console.log('  Vorlage:    ' + vorlage + '   (Datum erkannt: ' + datum + ')');
  } else {
    console.log('  In dieser Adresse steckt kein Datum. Die Bruecke wird immer dieselbe Seite');
    console.log('  oeffnen — das geht, wenn secplan sich den Tag merkt, sonst bitte in');
    console.log('  konfig.json bei "planAdresse" von Hand {datum} eintragen.');
  }
  konfig.secplan.planAdresse = vorlage;

  // Probe: genau so, wie es der taegliche Lauf machen wuerde —
  // inklusive Anmeldung, falls die Sitzung nicht mehr traegt.
  if (!browser) {
    const still = { ...konfig, secplan: { ...konfig.secplan, kopfmodus: false } };
    try {
      const teile = await werkzeug.angemeldetOeffnen(still, werkzeug.planAdresseFuer(still, datum || ''));
      ({ browser, kontext, seite } = teile);
    } catch (f) {
      console.log('\n  Die Anmeldung hat nicht geklappt: ' + f.message);
      console.log('  Entweder SECPLAN_BENUTZER / SECPLAN_PASSWORT in bruecke/.env eintragen');
      console.log('  oder einmal "npm run anmeldung" ausfuehren.');
      const teile = await werkzeug.browserOeffnen(still, { sichtbar: false });
      ({ browser, kontext, seite } = teile);
    }
  }
  await werkzeug.planOeffnen(konfig, seite, datum || '');
  if (await werkzeug.anmeldemaskeDa(seite)) {
    console.log('\n  Achtung: unter dieser Adresse landet man auf der Anmeldung.');
    console.log('  Bitte "npm run anmeldung" ausfuehren, damit die Sitzung gespeichert wird.');
  }

  const zeilen = await seite.evaluate(ZEILEN_ZAEHLEN);
  console.log('\n  Erkannte Schichtzeilen: ' + zeilen.length);
  zeilen.slice(0, 5).forEach((z) => console.log('    · ' + z));
  if (!zeilen.length) {
    console.log('    Keine gefunden. Entweder standen an dem Tag keine Schichten,');
    console.log('    oder die Adresse zeigt nicht auf den Tagesplan.');
  }

  await kontext.storageState({ path: werkzeug.sitzungsdatei(konfig) });
  await browser.close();

  inhalt.secplan.adresse = start;
  inhalt.secplan.planAdresse = vorlage;
  inhalt.modus = 'browser';
  inhalt.probelauf = true;
  await writeFile(ziel, JSON.stringify(inhalt, null, 2) + '\n', 'utf8');

  console.log('\n  Gespeichert in konfig.json:');
  console.log('    modus     = browser');
  console.log('    probelauf = true   (es wird noch nichts geschrieben)');
  console.log('\n  So geht es weiter:');
  console.log('    1. npm start, einen Tag abgleichen und freigeben.');
  console.log('       Der Probelauf sagt, was er getan haette — und legt es in daten/ausgang/ ab.');
  console.log('    2. Stimmt das, in konfig.json "probelauf": false setzen.');
  console.log('       Ab dann traegt die Bruecke die Zeiten selbst in secplan ein.\n');

  if (leser) leser.close();
}

const direkt = process.argv[1] && process.argv[1].endsWith('einrichten.mjs');
if (direkt) {
  los().catch((f) => {
    console.error('\n  Abgebrochen: ' + f.message + '\n');
    process.exit(1);
  });
}

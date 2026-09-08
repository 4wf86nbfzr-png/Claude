/* ============================================================
   Konfiguration der Bruecke
   ------------------------------------------------------------
   Zwei Quellen, bewusst getrennt:
     konfig.json  — Einstellungen, darf ins Repository
     .env         — Zugangsdaten, darf es nicht
   ============================================================ */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HIER = path.dirname(fileURLToPath(import.meta.url));
export const WURZEL = path.resolve(HIER, '..');

const STANDARD = {
  port: 8770,
  host: '127.0.0.1',
  modus: 'dateien',          // 'dateien' | 'browser'
  probelauf: true,           // nichts schreiben, nur berichten
  tagesversatz: -1,          // welcher Tag morgens abgeglichen wird
  morgenlauf: '07:00',
  wochentage: [1, 2, 3, 4, 5, 6, 0],
  aufbewahrungTage: 400,     // Tagespakete aelter als das werden geloescht
  ordner: { daten: 'daten', eingang: 'daten/eingang', ausgang: 'daten/ausgang' },
  secplan: {
    adresse: 'https://www.secplan.net/',
    planAdresse: '',          // Tagesplan, mit {datum} oder {datum_de} an der Stelle des Datums
    schichtAdresse: '',
    browserPfad: '',          // eigener Chrome/Chromium statt des mitgelieferten
    kopfmodus: false,         // true: Browser sichtbar mitlaufen lassen
    wartenMs: 1500,           // Ruhe nach jedem Seitenwechsel
    fristMs: 20000,           // wie lange auf ein Element gewartet wird
    langsamMs: 0,             // Zeitlupe zum Zusehen
    nurAenderungen: true,     // planmaessige Schichten nicht anfassen
    abgleichKlicken: true,    // nach dem Speichern "Abgleichen" druecken, wenn es das gibt
    hoechstensProLauf: 250,
    abbruchNachFehlern: 3,
    selektoren: {
      benutzerfeld: '', passwortfeld: '', anmeldeknopf: '', angemeldetErkennenAn: '',
      planZeile: '', spalteId: '', spalteName: '', spalteNummer: '',
      spalteBeginn: '', spalteEnde: '', spaltePause: '', spalteEinsatz: '',
      schichtOeffnen: '', feldBeginn: '', feldEnde: '', feldPause: '',
      speichern: '', gespeichertErkennenAn: ''
    }
  },
  // Die Ergebnisdatei. secplan kann CSV importieren; welche Spalten
  // in welcher Reihenfolge die eigene Installation erwartet, weiss
  // nur sie selbst — deshalb ist die Spaltenfolge hier einstellbar.
  // Moegliche Felder: aenderung, datum, datum_iso, mitarbeiter,
  // vorname_nachname, personalnummer, planung, funktion, soll_von,
  // soll_bis, soll_pause, neu_von, neu_bis, pause, stunden,
  // stunden_punkt, minuten, differenz, format, status, notiz, hinweis
  export: { trenner: ';', nurAenderungen: false, spalten: [] },
  ocr: { sprache: 'deu', datenPfad: '', gepackt: true, zwischenlager: '',
         seitenmodus: 3, startFrist: 60, leseFrist: 120 },
  mail: { aktiv: false, an: [], von: '', betreff: 'Schichtabgleich {datum}', smtp: {} },
  webhook: ''
};

function verschmelzen(ziel, quelle) {
  const aus = Array.isArray(ziel) ? ziel.slice() : { ...ziel };
  for (const [k, v] of Object.entries(quelle || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && ziel && typeof ziel[k] === 'object') {
      aus[k] = verschmelzen(ziel[k], v);
    } else if (v !== undefined) {
      aus[k] = v;
    }
  }
  return aus;
}

export async function umgebungLaden() {
  const datei = path.join(HIER, '.env');
  if (!existsSync(datei)) return;
  const text = await readFile(datei, 'utf8');
  for (const zeile of text.split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const name = t.slice(0, i).trim();
    let wert = t.slice(i + 1).trim();
    if (/^".*"$/.test(wert) || /^'.*'$/.test(wert)) wert = wert.slice(1, -1);
    if (process.env[name] === undefined) process.env[name] = wert;
  }
}

export async function konfigLaden() {
  await umgebungLaden();
  let eigen = {};
  // HST_KONFIG erlaubt eine zweite Konfiguration neben der echten —
  // die Vorfuehrung benutzt das, damit sie nichts anfassen kann.
  const datei = process.env.HST_KONFIG
    ? (path.isAbsolute(process.env.HST_KONFIG)
        ? process.env.HST_KONFIG : path.join(HIER, process.env.HST_KONFIG))
    : path.join(HIER, 'konfig.json');
  if (existsSync(datei)) {
    try {
      eigen = JSON.parse(await readFile(datei, 'utf8'));
    } catch (f) {
      throw new Error('konfig.json ist kein gueltiges JSON: ' + f.message);
    }
  }
  const k = verschmelzen(STANDARD, eigen);

  // Ordner absolut machen und anlegen.
  for (const [name, wert] of Object.entries(k.ordner)) {
    k.ordner[name] = path.isAbsolute(wert) ? wert : path.join(HIER, wert);
    await mkdir(k.ordner[name], { recursive: true });
  }

  // Sprachdaten der Texterkennung: liegen unter daten/tessdata, damit sie
  // nur einmal geholt werden und beim Aufraeumen nicht mit verschwinden.
  k.ocr = k.ocr || {};
  k.ocr.zwischenlager = k.ocr.zwischenlager
    ? (path.isAbsolute(k.ocr.zwischenlager) ? k.ocr.zwischenlager : path.join(HIER, k.ocr.zwischenlager))
    : path.join(k.ordner.daten, 'tessdata');
  await mkdir(k.ocr.zwischenlager, { recursive: true });
  if (k.ocr.datenPfad && !/^https?:/.test(k.ocr.datenPfad)) {
    k.ocr.datenPfad = path.isAbsolute(k.ocr.datenPfad) ? k.ocr.datenPfad : path.join(HIER, k.ocr.datenPfad);
  }

  k.token = process.env.BRUECKE_TOKEN || await tokenHolen(k.ordner.daten);
  k.zugang = {
    benutzer: process.env.SECPLAN_BENUTZER || '',
    passwort: process.env.SECPLAN_PASSWORT || ''
  };
  k.wurzel = WURZEL;
  return k;
}

/* Der Schluessel, ohne den die Bruecke nichts herausgibt. Wird beim
   ersten Start erzeugt und liegt danach in daten/token.txt. */
async function tokenHolen(datenOrdner) {
  const datei = path.join(datenOrdner, 'token.txt');
  if (existsSync(datei)) {
    const t = (await readFile(datei, 'utf8')).trim();
    if (t) return t;
  }
  const neu = randomBytes(18).toString('base64url');
  await writeFile(datei, neu + '\n', { mode: 0o600 });
  return neu;
}

export function tagesdatum(versatz = 0, ab = new Date()) {
  const d = new Date(ab);
  d.setDate(d.getDate() + versatz);
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

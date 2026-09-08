/* ============================================================
   Adapter zu secplan.net
   ------------------------------------------------------------
   secplan.net veroeffentlicht keine Programmierschnittstelle.
   Deshalb zwei Wege, die sich in der Konfiguration umschalten
   lassen — und die dieselbe Schnittstelle nach innen haben:

   modus "dateien"  (Standard, funktioniert sofort)
     Lesen:    Dienstplan-Export als CSV in  daten/eingang/
     Schreiben: fertige Datei in  daten/ausgang/, die in secplan
               importiert oder an die Lohnbuchhaltung gegeben wird.
     Nichts kann schiefgehen, nichts braucht Zugangsdaten.

   modus "browser"  (die eigentliche Bruecke)
     Meldet sich einmal mit dem hinterlegten Konto an, liest den
     Dienstplan des Tages und traegt die freigegebenen Zeiten
     wieder ein. Weil niemand von aussen weiss, wie die Seite
     aufgebaut ist, stehen alle Zugriffspunkte als CSS-Selektoren
     in konfig.json. Wie man sie in zwanzig Minuten einmalig
     ermittelt, steht in README.md unter "Browser-Modus".

   Beide Wege laufen auf demselben Rechner wie die Bruecke. Es
   gehen keine Daten an Dritte.
   ============================================================ */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import '../assets/js/intern/kern.js';

const K = globalThis.HSTAbgleich;

/* ============================================================
   Nach aussen
   ============================================================ */

export async function sollHolen(konfig, datum) {
  return konfig.modus === 'browser'
    ? sollAusBrowser(konfig, datum)
    : sollAusDateien(konfig, datum);
}

export async function uebertragen(konfig, paket) {
  if (konfig.probelauf) {
    const datei = await ausgangSchreiben(konfig, paket, 'probelauf');
    return {
      probelauf: true, weg: konfig.modus, uebertragen: paket.schichten.length,
      fehler: [], datei,
      hinweis: 'Probelauf: nichts in secplan geaendert. In konfig.json "probelauf": false setzen.'
    };
  }
  return konfig.modus === 'browser'
    ? uebertragenPerBrowser(konfig, paket)
    : uebertragenPerDatei(konfig, paket);
}

/* ============================================================
   Weg 1 — Dateien
   ============================================================ */

async function sollAusDateien(konfig, datum) {
  const ordner = konfig.ordner.eingang;
  if (!existsSync(ordner)) return [];
  const dateien = (await readdir(ordner))
    .filter((n) => /\.(csv|txt|tsv)$/i.test(n))
    .sort();

  // Bevorzugt eine Datei, die den Tag im Namen traegt.
  const passend = dateien.filter((n) => n.includes(datum) || n.includes(datum.split('-').reverse().join('.')));
  const zuLesen = passend.length ? passend : dateien.slice(-1);
  if (!zuLesen.length) return [];

  let alle = [];
  for (const name of zuLesen) {
    const text = await readFile(path.join(ordner, name), 'utf8');
    alle = alle.concat(K.sollAusCsv(entferneBom(text)));
  }

  // Wenn die Datei mehrere Tage enthaelt, bleibt nur der gesuchte.
  const mitDatum = alle.filter((s) => s.datum);
  if (mitDatum.length && mitDatum.some((s) => s.datum === datum)) {
    return alle.filter((s) => s.datum === datum);
  }
  return alle.map((s) => ({ ...s, datum: s.datum || datum }));
}

function entferneBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function uebertragenPerDatei(konfig, paket) {
  const datei = await ausgangSchreiben(konfig, paket, 'freigabe');
  return {
    probelauf: false, weg: 'datei', uebertragen: paket.schichten.length, fehler: [], datei,
    hinweis: 'Datei geschrieben. In secplan unter Import einlesen.'
  };
}

async function ausgangSchreiben(konfig, paket, art) {
  const zeilen = paket.schichten.map((s) => ({
    datum: s.datum, name: s.name, person: { personalnummer: s.personalnummer },
    einsatz: s.einsatz, schichtId: s.schichtId, status: s.status, notiz: s.notiz,
    vorschlag: {
      beginn: K.minutenAusZeit(s.beginn), ende: K.minutenAusZeit(s.ende), pause: s.pause
    },
    freigegeben: true
  }));
  const csv = K.csvSchreiben(zeilen);
  const stamm = `${art}-${paket.datum}`;
  const zielCsv = path.join(konfig.ordner.ausgang, stamm + '.csv');
  const zielJson = path.join(konfig.ordner.ausgang, stamm + '.json');
  await writeFile(zielCsv, '﻿' + csv, 'utf8');
  await writeFile(zielJson, JSON.stringify(paket, null, 2), 'utf8');
  return zielCsv;
}

/* ============================================================
   Weg 2 — Browser
   ============================================================ */

async function playwrightHolen() {
  try {
    return await import('playwright');
  } catch (f) {
    throw new Error('Fuer den Browser-Modus fehlt Playwright. Im Ordner bruecke/ einmal:  ' +
      'npm install playwright && npx playwright install chromium');
  }
}

function selektorenPruefen(konfig, gebraucht) {
  const s = konfig.secplan.selektoren || {};
  const fehlen = gebraucht.filter((n) => !s[n]);
  if (fehlen.length) {
    throw new Error(
      'Im Browser-Modus fehlen Angaben in konfig.json unter secplan.selektoren: ' +
      fehlen.join(', ') + '. Wie man sie ermittelt, steht in bruecke/README.md ' +
      'unter "Browser-Modus einrichten". Solange laeuft der Datei-Modus weiter.');
  }
  return s;
}

function sitzungsdatei(konfig) {
  return path.join(konfig.ordner.daten, 'sitzung.json');
}

async function browserOeffnen(konfig, { sichtbar = false } = {}) {
  const { chromium } = await playwrightHolen();
  const browser = await chromium.launch({ headless: !sichtbar && !konfig.secplan.kopfmodus });
  const sitzung = sitzungsdatei(konfig);
  const kontext = await browser.newContext(
    existsSync(sitzung) ? { storageState: sitzung } : {}
  );
  const seite = await kontext.newPage();
  return { browser, kontext, seite };
}

/* Einmalige Anmeldung. Laeuft mit sichtbarem Fenster, damit auch
   eine Zwei-Faktor-Abfrage oder ein Cookie-Banner durchkommt. Die
   Sitzung wird danach gespeichert; das Passwort bleibt in .env. */
export async function anmelden(konfig, { interaktiv = true } = {}) {
  const s = konfig.secplan.selektoren || {};
  const { browser, kontext, seite } = await browserOeffnen(konfig, { sichtbar: interaktiv });
  try {
    await seite.goto(konfig.secplan.adresse, { waitUntil: 'domcontentloaded' });

    if (konfig.zugang.benutzer && s.benutzerfeld && s.passwortfeld) {
      const vorhanden = await seite.locator(s.benutzerfeld).count();
      if (vorhanden) {
        await seite.fill(s.benutzerfeld, konfig.zugang.benutzer);
        await seite.fill(s.passwortfeld, konfig.zugang.passwort);
        if (s.anmeldeknopf) await seite.click(s.anmeldeknopf);
      }
    }

    if (interaktiv) {
      console.log('\nFenster ist offen. Bitte die Anmeldung dort abschliessen');
      console.log('(Zwei-Faktor, Cookie-Hinweis, Mandantenwahl) und dann hier Enter druecken.');
      await new Promise((fertig) => process.stdin.once('data', fertig));
    } else if (s.angemeldetErkennenAn) {
      await seite.waitForSelector(s.angemeldetErkennenAn, { timeout: 30000 });
    }

    await kontext.storageState({ path: sitzungsdatei(konfig) });
    console.log('Sitzung gespeichert: ' + sitzungsdatei(konfig));
    console.log('Die Datei ersetzt ab jetzt die taegliche Anmeldung. Sie gehoert nicht ins Repository.');
  } finally {
    await browser.close();
  }
}

async function angemeldetOeffnen(konfig) {
  const s = konfig.secplan.selektoren;
  const teile = await browserOeffnen(konfig);
  const { seite } = teile;
  const ziel = (konfig.secplan.planAdresse || konfig.secplan.adresse);
  await seite.goto(ziel, { waitUntil: 'domcontentloaded' });

  // Sitzung abgelaufen? Dann einmal mit den Zugangsdaten anmelden.
  const brauchtAnmeldung = s.benutzerfeld && await seite.locator(s.benutzerfeld).count();
  if (brauchtAnmeldung) {
    if (!konfig.zugang.benutzer) {
      await teile.browser.close();
      throw new Error('Die gespeicherte Sitzung ist abgelaufen und in bruecke/.env stehen keine ' +
        'Zugangsdaten. Einmal "npm run anmeldung" ausfuehren.');
    }
    await seite.fill(s.benutzerfeld, konfig.zugang.benutzer);
    await seite.fill(s.passwortfeld, konfig.zugang.passwort);
    if (s.anmeldeknopf) await seite.click(s.anmeldeknopf);
    if (s.angemeldetErkennenAn) await seite.waitForSelector(s.angemeldetErkennenAn, { timeout: 30000 });
    await teile.kontext.storageState({ path: sitzungsdatei(konfig) });
  }
  return teile;
}

async function sollAusBrowser(konfig, datum) {
  const s = selektorenPruefen(konfig, ['planZeile', 'spalteName', 'spalteBeginn', 'spalteEnde']);
  const teile = await angemeldetOeffnen(konfig);
  const { browser, seite } = teile;
  try {
    if (konfig.secplan.planAdresse) {
      await seite.goto(konfig.secplan.planAdresse.replace('{datum}', datum), { waitUntil: 'domcontentloaded' });
    }
    await seite.waitForTimeout(konfig.secplan.wartenMs || 2000);
    await seite.waitForSelector(s.planZeile, { timeout: 20000 });

    const roh = await seite.$$eval(s.planZeile, (zeilen, aus) => {
      const text = (wurzel, wahl) => {
        if (!wahl) return '';
        const el = wurzel.querySelector(wahl);
        return el ? (el.value !== undefined && el.value !== '' ? el.value : el.textContent).trim() : '';
      };
      return zeilen.map((zeile) => ({
        id: aus.spalteId ? text(zeile, aus.spalteId) : (zeile.getAttribute('data-id') || zeile.id || ''),
        name: text(zeile, aus.spalteName),
        beginn: text(zeile, aus.spalteBeginn),
        ende: text(zeile, aus.spalteEnde),
        pause: text(zeile, aus.spaltePause),
        einsatz: text(zeile, aus.spalteEinsatz),
        nummer: text(zeile, aus.spalteNummer)
      }));
    }, s);

    return roh
      .filter((r) => r.name && K.minutenAusZeit(r.beginn) !== null && K.minutenAusZeit(r.ende) !== null)
      .map((r, i) => ({
        id: r.id || 'b' + i,
        datum,
        einsatz: r.einsatz || '',
        mitarbeiter: {
          id: r.nummer || 'p' + K.normalisiere(r.name).replace(/ /g, '-'),
          name: r.name,
          personalnummer: r.nummer || ''
        },
        beginn: K.minutenAusZeit(r.beginn),
        ende: K.minutenAusZeit(r.ende),
        pause: parseInt(r.pause, 10) || 0
      }));
  } finally {
    await browser.close();
  }
}

async function uebertragenPerBrowser(konfig, paket) {
  const s = selektorenPruefen(konfig, ['feldBeginn', 'feldEnde', 'speichern']);
  const teile = await angemeldetOeffnen(konfig);
  const { browser, seite } = teile;
  const fehler = [];
  let gezaehlt = 0;

  try {
    for (const schicht of paket.schichten) {
      try {
        if (!schicht.schichtId) {
          fehler.push({ name: schicht.name, grund: 'ohne Schicht-Nummer — in secplan neu anlegen' });
          continue;
        }
        if (konfig.secplan.schichtAdresse) {
          await seite.goto(konfig.secplan.schichtAdresse.replace('{id}', encodeURIComponent(schicht.schichtId)),
            { waitUntil: 'domcontentloaded' });
        } else if (s.schichtOeffnen) {
          await seite.click(s.schichtOeffnen.replace('{id}', schicht.schichtId));
        }
        await seite.waitForSelector(s.feldBeginn, { timeout: 15000 });

        await seite.fill(s.feldBeginn, schicht.beginn);
        await seite.fill(s.feldEnde, schicht.ende);
        if (s.feldPause) await seite.fill(s.feldPause, String(schicht.pause || 0));
        await seite.click(s.speichern);

        if (s.gespeichertErkennenAn) {
          await seite.waitForSelector(s.gespeichertErkennenAn, { timeout: 15000 });
        } else {
          await seite.waitForTimeout(konfig.secplan.wartenMs || 1500);
        }
        gezaehlt++;
      } catch (f) {
        fehler.push({ name: schicht.name, grund: kurz(f.message) });
      }
    }
  } finally {
    await browser.close();
  }

  // Egal wie es lief: die Datei entsteht immer, damit nichts verloren geht.
  const datei = await ausgangSchreiben(konfig, paket, 'freigabe');
  return { probelauf: false, weg: 'browser', uebertragen: gezaehlt, fehler, datei };
}

function kurz(text) {
  return String(text || '').split('\n')[0].slice(0, 180);
}

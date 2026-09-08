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
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
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
   ------------------------------------------------------------
   Die Bruecke bedient secplan wie ein Mensch: anmelden, Tagesplan
   oeffnen, die Zeile der Person suchen, Zeiten eintragen, speichern,
   nachsehen ob es angekommen ist.

   Gefunden wird ueber den *Inhalt*, nicht ueber den Aufbau der
   Seite: die Zeile an Name und Personalnummer, die Zeitfelder an
   den geplanten Zeiten, die daringestehen. Das ist der Grund, warum
   hier keine Liste von CSS-Selektoren gepflegt werden muss und warum
   ein Update von secplan die Bruecke nicht sofort lahmlegt. Wo es
   doch klemmt, kann man in konfig.json nachhelfen — muss aber nicht.

   Sicherheitsnetz, in dieser Reihenfolge:
     - Probelauf: es wird nichts geschrieben, nur berichtet
     - jede Zeile muss eindeutig gefunden werden, sonst uebersprungen
     - nach dem Speichern wird zurueckgelesen und verglichen
     - bei drei Fehlern hintereinander bricht der Lauf ab
     - von jedem Fehler liegt ein Bildschirmfoto in daten/bilder/
   ============================================================ */

async function playwrightHolen() {
  try {
    return await import('playwright');
  } catch (f) {
    throw new Error('Fuer den Browser-Modus fehlt Playwright. Im Ordner bruecke/ einmal:  ' +
      'npm install playwright && npx playwright install chromium');
  }
}

function sitzungsdatei(konfig) {
  return path.join(konfig.ordner.daten, 'sitzung.json');
}

async function browserOeffnen(konfig, { sichtbar = false } = {}) {
  const { chromium } = await playwrightHolen();
  // browserPfad erlaubt es, einen schon vorhandenen Chrome/Chromium zu
  // benutzen, statt Playwright einen eigenen herunterladen zu lassen —
  // in manchen Firmennetzen ist das der einzige Weg.
  const pfad = konfig.secplan.browserPfad || process.env.HST_BROWSER || '';
  const browser = await chromium.launch({
    headless: !sichtbar && !konfig.secplan.kopfmodus,
    slowMo: konfig.secplan.langsamMs || 0,
    ...(pfad ? { executablePath: pfad } : {})
  });
  const sitzung = sitzungsdatei(konfig);
  const kontext = await browser.newContext({
    ...(existsSync(sitzung) ? { storageState: sitzung } : {}),
    locale: 'de-DE',
    viewport: { width: 1400, height: 950 }
  });
  kontext.setDefaultTimeout(konfig.secplan.fristMs || 20000);
  const seite = await kontext.newPage();
  return { browser, kontext, seite };
}

/* ---- Anmeldung ------------------------------------------------
   Das Passwortfeld ist der verlaessliche Anker: davor steht das
   Feld fuer die Kennung, darunter der Knopf. Selektoren aus der
   Konfiguration gehen vor, wenn jemand welche eingetragen hat. */
const ANMELDEN_IM_BROWSER = () => {
  const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  document.querySelectorAll('[data-hst]').forEach((e) => e.removeAttribute('data-hst'));

  const passwort = [...document.querySelectorAll('input[type="password"]')].filter(sichtbar)[0];
  if (!passwort) return { gefunden: false };
  passwort.setAttribute('data-hst', 'passwort');

  const alle = [...document.querySelectorAll('input')].filter(sichtbar);
  const vorher = alle.slice(0, alle.indexOf(passwort)).reverse();
  const kennung = vorher.find((el) => ['text', 'email', 'tel', ''].includes((el.type || '').toLowerCase()));
  if (kennung) kennung.setAttribute('data-hst', 'kennung');

  const form = passwort.closest('form') || document;
  const knopf = [...form.querySelectorAll('button, input[type="submit"]')]
    .filter(sichtbar)
    .find((el) => /anmeld|login|einlogg|weiter|senden|sign in/i.test((el.textContent || el.value || '')));
  if (knopf) knopf.setAttribute('data-hst', 'anmelden');

  return { gefunden: true, kennung: !!kennung, knopf: !!knopf };
};

async function anmeldemaskeDa(seite) {
  return (await seite.locator('input[type="password"]').count()) > 0;
}

async function anmeldungAusfuehren(konfig, seite) {
  const s = konfig.secplan.selektoren || {};
  if (!konfig.zugang.benutzer || !konfig.zugang.passwort) {
    throw new Error('In bruecke/.env stehen keine Zugangsdaten (SECPLAN_BENUTZER / SECPLAN_PASSWORT). ' +
      'Alternativ einmal "npm run anmeldung" ausfuehren — dann merkt sich die Bruecke die Sitzung.');
  }

  if (s.benutzerfeld && s.passwortfeld) {
    await seite.fill(s.benutzerfeld, konfig.zugang.benutzer);
    await seite.fill(s.passwortfeld, konfig.zugang.passwort);
    if (s.anmeldeknopf) await seite.click(s.anmeldeknopf);
    else await seite.keyboard.press('Enter');
  } else {
    const gefunden = await seite.evaluate(ANMELDEN_IM_BROWSER);
    if (!gefunden.gefunden) throw new Error('Auf der Seite ist kein Anmeldeformular zu finden.');
    if (gefunden.kennung) await seite.fill('[data-hst="kennung"]', konfig.zugang.benutzer);
    await seite.fill('[data-hst="passwort"]', konfig.zugang.passwort);
    if (gefunden.knopf) await seite.click('[data-hst="anmelden"]');
    else await seite.keyboard.press('Enter');
  }

  await seite.waitForLoadState('domcontentloaded');
  await seite.waitForTimeout(konfig.secplan.wartenMs || 1500);

  if (await anmeldemaskeDa(seite)) {
    throw new Error('Die Anmeldung wurde nicht angenommen. Zugangsdaten pruefen — oder, wenn secplan ' +
      'einen zweiten Faktor verlangt, einmal "npm run anmeldung" ausfuehren.');
  }
}

/* Einmalige Anmeldung von Hand. Laeuft mit sichtbarem Fenster, damit
   auch Zwei-Faktor-Abfrage, Cookie-Banner und Mandantenwahl durchkommen.
   Die Sitzung wird gespeichert; das Passwort bleibt in .env. */
export async function anmelden(konfig, { interaktiv = true } = {}) {
  const { browser, kontext, seite } = await browserOeffnen(konfig, { sichtbar: interaktiv });
  try {
    await seite.goto(konfig.secplan.adresse, { waitUntil: 'domcontentloaded' });

    if (konfig.zugang.benutzer && await anmeldemaskeDa(seite)) {
      try { await anmeldungAusfuehren(konfig, seite); } catch (f) { console.log(String(f.message)); }
    }

    if (interaktiv) {
      console.log('\nFenster ist offen. Bitte die Anmeldung dort abschliessen');
      console.log('(Zwei-Faktor, Cookie-Hinweis, Mandantenwahl) und hier Enter druecken.');
      await new Promise((fertig) => process.stdin.once('data', fertig));
    }

    await kontext.storageState({ path: sitzungsdatei(konfig) });
    console.log('Sitzung gespeichert: ' + sitzungsdatei(konfig));
    console.log('Sie ersetzt ab jetzt die taegliche Anmeldung und gehoert nicht ins Repository.');
  } finally {
    await browser.close();
  }
}

async function angemeldetOeffnen(konfig, ziel) {
  const teile = await browserOeffnen(konfig);
  const { seite } = teile;
  await seite.goto(ziel || konfig.secplan.planAdresse || konfig.secplan.adresse,
    { waitUntil: 'domcontentloaded' });

  if (await anmeldemaskeDa(seite)) {
    try {
      await anmeldungAusfuehren(konfig, teile.seite);
      await teile.kontext.storageState({ path: sitzungsdatei(konfig) });
      if (ziel) await seite.goto(ziel, { waitUntil: 'domcontentloaded' });
    } catch (f) {
      await teile.browser.close();
      throw f;
    }
  }
  return teile;
}

/* ---- Tagesplan ------------------------------------------------ */
function planAdresseFuer(konfig, datum) {
  const vorlage = konfig.secplan.planAdresse;
  if (!vorlage) return null;
  const deutsch = datum ? datum.split('-').reverse().join('.') : '';
  return vorlage.replace(/\{datum\}/g, datum || '').replace(/\{datum_de\}/g, deutsch);
}

async function planOeffnen(konfig, seite, datum) {
  const ziel = planAdresseFuer(konfig, datum);
  if (!ziel) {
    throw new Error('In konfig.json fehlt secplan.planAdresse — die Adresse des Tagesplans, ' +
      'mit {datum} an der Stelle des Datums. "npm run einrichten" traegt sie ein.');
  }
  await seite.goto(ziel, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(konfig.secplan.wartenMs || 1200);
}

/* ---- Die Zeile der Person finden ------------------------------
   Gesucht wird das kleinste Element, das Name (oder Personalnummer)
   und die geplante Anfangszeit zugleich enthaelt. Kleinste heisst:
   das mit dem wenigsten Text — sonst gewinnt immer <body>. */
const ZEILE_IM_BROWSER = ({ nummer, teile, von, bis }) => {
  document.querySelectorAll('[data-hst]').forEach((e) => e.removeAttribute('data-hst'));
  const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const ziffern = (t) => (t || '').replace(/[^0-9]/g, '');
  const klein = (t) => (t || '').toLowerCase();

  const zeitDrin = (text) => {
    const z = ziffern(von);
    if (!z) return true;
    return (text.match(/\d{1,2}\s*[:.]\s*\d{2}/g) || []).some((t) => ziffern(t) === z ||
      ziffern(t) === z.padStart(4, '0'));
  };
  const nameDrin = (text) => {
    const t = klein(text);
    if (nummer && t.includes(String(nummer))) return true;
    return teile.length > 0 && teile.every((n) => t.includes(klein(n)));
  };

  let bester = null;
  for (const el of document.querySelectorAll('tr, li, [role="row"], div, section, article, a')) {
    if (!sichtbar(el)) continue;
    const text = el.innerText || el.textContent || '';
    if (text.length > 3000) continue;
    if (!nameDrin(text) || !zeitDrin(text)) continue;
    if (!bester || text.length < bester.text.length) bester = { el, text };
  }
  if (!bester) return { gefunden: false };

  bester.el.setAttribute('data-hst', 'zeile');

  // Womit man die Zeile aufmacht: ein Link oder Knopf darin.
  const oeffner = [...bester.el.querySelectorAll('a[href], button, [role="button"], [onclick]')]
    .filter(sichtbar)
    .filter((el) => !/löschen|entfernen|delete|storn/i.test(el.textContent || ''))[0];
  if (oeffner) oeffner.setAttribute('data-hst', 'oeffnen');
  else if (bester.el.tagName === 'A' || bester.el.hasAttribute('onclick')) {
    bester.el.setAttribute('data-hst', 'oeffnen');
  }

  return { gefunden: true, oeffner: !!document.querySelector('[data-hst="oeffnen"]'),
           text: bester.text.replace(/\s+/g, ' ').trim().slice(0, 200) };
};

function namensteile(schicht) {
  return String(schicht.nameSecplan || schicht.name || '')
    .replace(/\(.*?\)/g, ' ')
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 3);
}

/* ---- Die Zeitfelder finden ------------------------------------
   Erst am Wert (dort steht die geplante Zeit), dann an der
   Beschriftung, zuletzt an einem Selektor aus der Konfiguration. */
const FELDER_IM_BROWSER = ({ von, bis, pause, selektoren }) => {
  document.querySelectorAll('[data-hst-feld]').forEach((e) => e.removeAttribute('data-hst-feld'));
  const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const ziffern = (t) => String(t == null ? '' : t).replace(/[^0-9]/g, '');
  const felder = [...document.querySelectorAll('input:not([type="hidden"]), select, textarea')]
    .filter(sichtbar).filter((el) => !el.disabled && !el.readOnly);

  const beschriftung = (el) => {
    let t = '';
    if (el.id) {
      const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (l) t += ' ' + l.textContent;
    }
    const eltern = el.closest('label');
    if (eltern) t += ' ' + eltern.textContent;
    t += ' ' + (el.name || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '');
    return t.toLowerCase();
  };

  const setzen = (el, rolle) => { if (el && !el.getAttribute('data-hst-feld')) el.setAttribute('data-hst-feld', rolle); };

  // 1 — am Wert
  const nachWert = (wert) => {
    const z = ziffern(wert);
    if (!z) return null;
    return felder.filter((el) => ziffern(el.value) === z && !el.getAttribute('data-hst-feld'))[0] || null;
  };
  setzen(nachWert(von), 'beginn');
  setzen(nachWert(bis), 'ende');

  // 2 — an der Beschriftung
  if (!document.querySelector('[data-hst-feld="beginn"]')) {
    setzen(felder.find((el) => /beginn|von|start|kommt|ab\b/.test(beschriftung(el))), 'beginn');
  }
  if (!document.querySelector('[data-hst-feld="ende"]')) {
    setzen(felder.find((el) => /ende|bis|schluss|geht/.test(beschriftung(el))), 'ende');
  }
  setzen(felder.find((el) => /pause|unterbrech/.test(beschriftung(el))), 'pause');

  // 3 — was in der Konfiguration steht, gewinnt
  for (const [rolle, wahl] of Object.entries(selektoren || {})) {
    if (!wahl) continue;
    const el = document.querySelector(wahl);
    if (el) {
      document.querySelectorAll('[data-hst-feld="' + rolle + '"]').forEach((e) => e.removeAttribute('data-hst-feld'));
      el.setAttribute('data-hst-feld', rolle);
    }
  }

  const holen = (r) => {
    const el = document.querySelector('[data-hst-feld="' + r + '"]');
    return el ? { da: true, wert: el.value } : { da: false };
  };
  return { beginn: holen('beginn'), ende: holen('ende'), pause: holen('pause'), anzahl: felder.length };
};

/* ---- Knoepfe --------------------------------------------------- */
const KNOPF_IM_BROWSER = ({ muster, marke }) => {
  document.querySelectorAll('[data-hst-knopf="' + marke + '"]').forEach((e) => e.removeAttribute('data-hst-knopf'));
  const sichtbar = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  const re = new RegExp(muster, 'i');
  const knopf = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')]
    .filter(sichtbar)
    .filter((el) => !el.disabled)
    .find((el) => re.test(((el.textContent || '') + ' ' + (el.value || '')).trim()));
  if (!knopf) return { gefunden: false };
  knopf.setAttribute('data-hst-knopf', marke);
  return { gefunden: true, text: ((knopf.textContent || knopf.value || '')).trim().slice(0, 60) };
};

async function knopfKlicken(seite, muster, marke, konfig) {
  const treffer = await seite.evaluate(KNOPF_IM_BROWSER, { muster, marke });
  if (!treffer.gefunden) return null;
  await Promise.all([
    seite.waitForLoadState('domcontentloaded').catch(() => {}),
    seite.click('[data-hst-knopf="' + marke + '"]')
  ]);
  await seite.waitForTimeout(konfig.secplan.wartenMs || 1200);
  return treffer.text;
}

/* ---- Der eigentliche Lauf -------------------------------------- */
async function uebertragenPerBrowser(konfig, paket) {
  const grenze = konfig.secplan.hoechstensProLauf || 250;
  const zuTun = paket.schichten
    .filter((s) => !(konfig.secplan.nurAenderungen && s.unveraendert))
    .slice(0, grenze);

  const teile = await angemeldetOeffnen(konfig);
  const { browser, seite } = teile;
  const bericht = [];
  const fehler = [];
  let gezaehlt = 0, hintereinander = 0, letzterTag = null;

  try {
    for (const schicht of zuTun) {
      const eintrag = { name: schicht.name, datum: schicht.datum,
                        von: schicht.beginn, bis: schicht.ende };
      try {
        if (!schicht.datum) throw new Error('ohne Datum');

        if (schicht.datum !== letzterTag) {
          await planOeffnen(konfig, seite, schicht.datum);
          letzterTag = schicht.datum;
        } else {
          await planOeffnen(konfig, seite, schicht.datum);
        }

        const zeile = await seite.evaluate(ZEILE_IM_BROWSER, {
          nummer: schicht.personalnummer, teile: namensteile(schicht),
          von: schicht.geplantBeginn, bis: schicht.geplantEnde
        });
        if (!zeile.gefunden) throw new Error('im Tagesplan nicht gefunden (Name oder geplante Zeit weichen ab)');

        if (zeile.oeffner) {
          await Promise.all([
            seite.waitForLoadState('domcontentloaded').catch(() => {}),
            seite.click('[data-hst="oeffnen"]')
          ]);
          await seite.waitForTimeout(konfig.secplan.wartenMs || 1200);
        }

        const felder = await seite.evaluate(FELDER_IM_BROWSER, {
          von: schicht.geplantBeginn, bis: schicht.geplantEnde, pause: schicht.geplantPause,
          selektoren: {
            beginn: konfig.secplan.selektoren.feldBeginn,
            ende: konfig.secplan.selektoren.feldEnde,
            pause: konfig.secplan.selektoren.feldPause
          }
        });
        if (!felder.beginn.da || !felder.ende.da) {
          throw new Error('Zeitfelder nicht gefunden (' + felder.anzahl + ' Felder auf der Maske)');
        }

        await seite.fill('[data-hst-feld="beginn"]', schicht.beginn);
        await seite.fill('[data-hst-feld="ende"]', schicht.ende);
        if (felder.pause.da && (schicht.pause || 0) !== (schicht.geplantPause || 0)) {
          await seite.fill('[data-hst-feld="pause"]', String(schicht.pause || 0));
        }

        const gespeichert = await knopfKlicken(seite,
          '^\\s*(speichern|sichern|\\u00fcbernehmen|save|ok)\\s*$', 'speichern', konfig);
        if (!gespeichert) throw new Error('kein Speichern-Knopf gefunden');
        eintrag.knopf = gespeichert;

        const kontrolle = await seite.evaluate(FELDER_IM_BROWSER, {
          von: schicht.beginn, bis: schicht.ende, pause: schicht.pause, selektoren: {}
        });
        const stimmt = kontrolle.beginn.da && kontrolle.ende.da &&
          gleicheZeit(kontrolle.beginn.wert, schicht.beginn) &&
          gleicheZeit(kontrolle.ende.wert, schicht.ende);
        if (!stimmt) throw new Error('gespeichert, aber die Zeiten stehen danach nicht so da — nicht gezaehlt');
        eintrag.geprueft = true;

        if (konfig.secplan.abgleichKlicken !== false) {
          const geklickt = await knopfKlicken(seite,
            '^\\s*(abgleichen|abgleich|best\\u00e4tigen|freigeben)\\s*$', 'abgleich', konfig);
          if (geklickt) eintrag.abgeglichen = geklickt;
        }

        gezaehlt++;
        hintereinander = 0;
        eintrag.erfolg = true;
      } catch (f) {
        eintrag.erfolg = false;
        eintrag.grund = kurz(f.message);
        eintrag.bild = await bildschirmfoto(konfig, seite, schicht);
        fehler.push({ name: schicht.name, grund: eintrag.grund, bild: eintrag.bild });
        hintereinander++;
        if (hintereinander >= (konfig.secplan.abbruchNachFehlern || 3)) {
          fehler.push({ name: '—', grund: hintereinander + ' Fehler hintereinander: Lauf abgebrochen. ' +
            'Meist stimmt die Adresse des Tagesplans nicht mehr oder die Sitzung ist abgelaufen.' });
          bericht.push(eintrag);
          break;
        }
      }
      bericht.push(eintrag);
    }
  } finally {
    await browser.close();
  }

  const datei = await ausgangSchreiben(konfig, paket, 'freigabe');
  return { probelauf: false, weg: 'browser', uebertragen: gezaehlt,
           offen: zuTun.length - gezaehlt, fehler, bericht, datei };
}

function gleicheZeit(a, b) {
  const z = (t) => String(t == null ? '' : t).replace(/[^0-9]/g, '').padStart(4, '0');
  return z(a) === z(b);
}

async function bildschirmfoto(konfig, seite, schicht) {
  try {
    const ordner = path.join(konfig.ordner.daten, 'bilder');
    await mkdir(ordner, { recursive: true });
    const name = `fehler-${schicht.datum || 'ohne'}-${String(schicht.personalnummer || schicht.name)
      .replace(/[^A-Za-z0-9]+/g, '-')}-${Date.now()}.png`;
    const ziel = path.join(ordner, name);
    await seite.screenshot({ path: ziel, fullPage: true });
    return ziel;
  } catch (f) {
    return '';
  }
}

/* ---- Tagesplan lesen (fuer den Morgenlauf) --------------------- */
async function sollAusBrowser(konfig, datum) {
  const s = konfig.secplan.selektoren || {};
  if (!s.planZeile || !s.spalteName) {
    throw new Error('Zum Auslesen des Dienstplans fehlen secplan.selektoren.planZeile und .spalteName. ' +
      'Ohne sie geht der Weg ueber die Abgleichliste: in secplan als PDF ausgeben und in der ' +
      'Oberflaeche ablegen — dafuer ist nichts einzurichten.');
  }
  const teile = await angemeldetOeffnen(konfig, planAdresseFuer(konfig, datum));
  const { browser, seite } = teile;
  try {
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
      .map((r, i) => {
        const person = K.personAusSecplan(r.nummer ? `${r.name} (${r.nummer})` : r.name);
        return {
          id: r.id || 'b' + i,
          datum,
          einsatz: r.einsatz || '',
          mitarbeiter: {
            id: person.personalnummer || ('p' + K.normalisiere(person.name).replace(/ /g, '-')),
            name: person.name, nachnameZuerst: person.nachnameZuerst,
            personalnummer: person.personalnummer
          },
          beginn: K.minutenAusZeit(r.beginn),
          ende: K.minutenAusZeit(r.ende),
          pause: parseInt(r.pause, 10) || 0
        };
      });
  } finally {
    await browser.close();
  }
}

function kurz(text) {
  return String(text || '').split('\n')[0].slice(0, 200);
}

/* Nach aussen fuer die Einrichtung. */
export const werkzeug = {
  browserOeffnen, angemeldetOeffnen, anmeldemaskeDa, anmeldungAusfuehren,
  planAdresseFuer, planOeffnen, namensteile, sitzungsdatei,
  ZEILE_IM_BROWSER, FELDER_IM_BROWSER, KNOPF_IM_BROWSER, knopfKlicken, gleicheZeit
};

/* ---- Aufruf von der Kommandozeile: npm run anmeldung ----------- */
const direktAufgerufen = process.argv[1] && process.argv[1].endsWith('secplan.mjs');
if (direktAufgerufen && process.argv[2] === 'anmelden') {
  const { konfigLaden } = await import('./konfig.mjs');
  const konfig = await konfigLaden();
  await anmelden(konfig, { interaktiv: true });
  process.exit(0);
}

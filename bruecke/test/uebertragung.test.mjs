/* ============================================================
   Der Lauf, der die Zeiten selbst eintraegt
   ------------------------------------------------------------
   Getestet gegen das Doppel aus scheinplan.mjs: Anmeldung,
   Tagesplan, Schichtmaske, Speichern, Abgleichen. Die Bruecke
   bekommt dabei nichts vorgegeben ausser der Adresse des
   Tagesplans — Zeile und Felder muss sie selbst finden.

   Laeuft nur, wenn Playwright installiert ist; sonst wird der
   Test uebersprungen statt rot.
   ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { starten, schichtenAnlegen } from './scheinplan.mjs';
import * as secplan from '../secplan.mjs';

/* Diese Faelle brauchen einen echten Browser. Fehlt Playwright oder
   ist das Browser-Paket nicht heruntergeladen, werden sie
   uebersprungen — ein fehlendes Werkzeug ist kein Testfehler. */
let playwrightDa = true;
try {
  const { chromium } = await import('playwright');
  const pfad = process.env.HST_BROWSER || '';
  const browser = await chromium.launch(pfad ? { executablePath: pfad } : {});
  await browser.close();
} catch (f) {
  playwrightDa = false;
  console.log('# uebersprungen: kein Browser fuer Playwright (' + String(f.message).split('\n')[0] + ')');
}

const PORT = 8793;

async function umgebung() {
  const ordner = await mkdtemp(path.join(tmpdir(), 'hst-uebertragung-'));
  const daten = path.join(ordner, 'daten');
  const ausgang = path.join(ordner, 'ausgang');
  const konfig = {
    modus: 'browser',
    probelauf: false,
    ordner: { daten, eingang: path.join(ordner, 'eingang'), ausgang },
    zugang: { benutzer: 'buero', passwort: 'geheim' },
    secplan: {
      browserPfad: process.env.HST_BROWSER || '',
      adresse: `http://127.0.0.1:${PORT}/`,
      planAdresse: `http://127.0.0.1:${PORT}/tagesplan?d={datum}`,
      schichtAdresse: '', kopfmodus: false, wartenMs: 120, fristMs: 8000, langsamMs: 0,
      nurAenderungen: true, abgleichKlicken: true, hoechstensProLauf: 50, abbruchNachFehlern: 3,
      selektoren: { feldBeginn: '', feldEnde: '', feldPause: '' }
    }
  };
  const { mkdir } = await import('node:fs/promises');
  for (const o of Object.values(konfig.ordner)) await mkdir(o, { recursive: true });
  return { ordner, konfig };
}

function paketBauen(schichten) {
  return {
    datum: '2026-09-08', bearbeiter: 'Noah Benkhofer', erzeugt: new Date().toISOString(),
    schichten, ausfaelle: []
  };
}

const RUTH = {
  schichtId: null, personalnummer: '2027', name: 'Ruth Kuehn-Adler',
  nameSecplan: 'Kuehn-Adler, Ruth', datum: '2026-09-08', einsatz: '123 FM - Sicherheit',
  geplantBeginn: '08:30', geplantEnde: '16:00', geplantPause: 0,
  beginn: '08:30', ende: '17:30', pause: 0, unveraendert: false, status: 'abweichung', notiz: ''
};
const LUIS = {
  schichtId: null, personalnummer: '1005', name: 'Luis Sanchez',
  nameSecplan: 'Sanchez, Luis', datum: '2026-09-08', einsatz: '123 FM - Sicherheit',
  geplantBeginn: '19:00', geplantEnde: '02:00', geplantPause: 0,
  beginn: '19:00', ende: '02:00', pause: 0, unveraendert: true, status: 'passt', notiz: ''
};
const EMILY = {
  schichtId: null, personalnummer: '2850', name: 'Emily Fett',
  nameSecplan: 'Fett, Emily', datum: '2026-09-08', einsatz: '125 FM - Hostessen',
  geplantBeginn: '10:30', geplantEnde: '20:00', geplantPause: 0,
  beginn: '10:30', ende: '18:45', pause: 30, unveraendert: false, status: 'abweichung', notiz: ''
};

test('Die Bruecke traegt die Zeiten selbst in secplan ein', { skip: !playwrightDa }, async () => {
  const { ordner, konfig } = await umgebung();
  const { server, schichten } = await starten(PORT, schichtenAnlegen());
  try {
    const ergebnis = await secplan.uebertragen(konfig, paketBauen([RUTH, LUIS, EMILY]));

    assert.equal(ergebnis.weg, 'browser');
    assert.equal(ergebnis.probelauf, false);
    // Luis lief planmaessig — an dem wird nichts angefasst.
    assert.equal(ergebnis.uebertragen, 2);
    assert.deepEqual(ergebnis.fehler, []);

    const ruth = schichten.find((s) => s.id === 'S1');
    assert.equal(ruth.von, '08:30');
    assert.equal(ruth.bis, '17:30');       // aus 16:00 geworden
    assert.equal(ruth.abgeglichen, true);  // und als abgeglichen markiert

    const emily = schichten.find((s) => s.id === 'S3');
    assert.equal(emily.bis, '18:45');
    assert.equal(emily.pause, '30');
    assert.equal(emily.abgeglichen, true);

    const luis = schichten.find((s) => s.id === 'S2');
    assert.equal(luis.bis, '02:00');
    assert.equal(luis.abgeglichen, false); // unangetastet

    // Der Bericht sagt zu jeder Zeile, was passiert ist.
    assert.equal(ergebnis.bericht.length, 2);
    assert.ok(ergebnis.bericht.every((b) => b.erfolg && b.geprueft));
    assert.match(ergebnis.bericht[0].knopf, /Speichern/);
  } finally {
    server.close();
    await rm(ordner, { recursive: true, force: true });
  }
});

test('Probelauf fasst nichts an', { skip: !playwrightDa }, async () => {
  const { ordner, konfig } = await umgebung();
  konfig.probelauf = true;
  const { server, schichten } = await starten(PORT + 1, schichtenAnlegen());
  konfig.secplan.planAdresse = `http://127.0.0.1:${PORT + 1}/tagesplan?d={datum}`;
  try {
    const ergebnis = await secplan.uebertragen(konfig, paketBauen([RUTH]));
    assert.equal(ergebnis.probelauf, true);
    assert.equal(ergebnis.uebertragen, 1);          // so viele waeren es geworden
    assert.equal(schichten.find((s) => s.id === 'S1').bis, '16:00');   // unveraendert
  } finally {
    server.close();
    await rm(ordner, { recursive: true, force: true });
  }
});

test('Wer im Tagesplan fehlt, wird gemeldet statt geraten', { skip: !playwrightDa }, async () => {
  const { ordner, konfig } = await umgebung();
  const { server } = await starten(PORT + 2, schichtenAnlegen());
  konfig.secplan.planAdresse = `http://127.0.0.1:${PORT + 2}/tagesplan?d={datum}`;
  try {
    const fremd = { ...RUTH, personalnummer: '9999', name: 'Ilse Unbekannt',
                    nameSecplan: 'Unbekannt, Ilse' };
    const ergebnis = await secplan.uebertragen(konfig, paketBauen([fremd]));
    assert.equal(ergebnis.uebertragen, 0);
    assert.equal(ergebnis.fehler.length, 1);
    assert.match(ergebnis.fehler[0].grund, /nicht gefunden/);
    // und ein Bildschirmfoto liegt bereit
    const bilder = await readdir(path.join(konfig.ordner.daten, 'bilder'));
    assert.equal(bilder.length, 1);
  } finally {
    server.close();
    await rm(ordner, { recursive: true, force: true });
  }
});

test('Falsche Zugangsdaten werden gesagt, nicht verschluckt', { skip: !playwrightDa }, async () => {
  const { ordner, konfig } = await umgebung();
  konfig.zugang.passwort = 'falsch';
  const { server } = await starten(PORT + 3, schichtenAnlegen());
  konfig.secplan.planAdresse = `http://127.0.0.1:${PORT + 3}/tagesplan?d={datum}`;
  try {
    await assert.rejects(
      () => secplan.uebertragen(konfig, paketBauen([RUTH])),
      /Anmeldung wurde nicht angenommen/
    );
  } finally {
    server.close();
    await rm(ordner, { recursive: true, force: true });
  }
});

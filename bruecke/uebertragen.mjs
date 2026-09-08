#!/usr/bin/env node
/* ============================================================
   Eine gesicherte Freigabe nachtraeglich uebertragen
   ------------------------------------------------------------
   Fuer den Fall, dass die Oberflaeche ohne Bruecke gearbeitet
   hat und eine freigabe-*.json heruntergeladen wurde:

       node uebertragen.mjs ~/Downloads/freigabe-2026-09-07.json
   ============================================================ */
import { readFile } from 'node:fs/promises';
import { konfigLaden } from './konfig.mjs';
import * as secplan from './secplan.mjs';
import * as Paket from './paket.mjs';

const datei = process.argv[2];
if (!datei) {
  console.error('Aufruf: node uebertragen.mjs <freigabe-JJJJ-MM-TT.json>');
  process.exit(1);
}

const konfig = await konfigLaden();
const paket = JSON.parse(await readFile(datei, 'utf8'));
const ergebnis = await secplan.uebertragen(konfig, paket);

await Paket.protokollieren(konfig, {
  art: 'freigabe-nachtraeglich', datum: paket.datum, wer: paket.bearbeiter,
  schichten: paket.schichten.length, uebertragen: ergebnis.uebertragen,
  probelauf: !!ergebnis.probelauf, fehler: ergebnis.fehler, weg: ergebnis.weg
});

console.log(`${ergebnis.uebertragen} von ${paket.schichten.length} Schichten uebertragen` +
  (ergebnis.probelauf ? ' (Probelauf — nichts geaendert)' : '') + '.');
if (ergebnis.fehler?.length) {
  console.log('Nicht uebertragen:');
  ergebnis.fehler.forEach((f) => console.log('  - ' + f.name + ': ' + f.grund));
}
if (ergebnis.datei) console.log('Datei: ' + ergebnis.datei);

#!/usr/bin/env node
/* ============================================================
   Der Morgenlauf
   ------------------------------------------------------------
   Holt den Dienstplan des abzugleichenden Tages, legt ihn als
   Tagespaket ab und sagt dem Buero Bescheid. Laeuft entweder
   von selbst in der Bruecke (server.mjs) oder als eigener
   Aufruf aus einer Zeitsteuerung:

       node morgenlauf.mjs            (Tag aus konfig.tagesversatz)
       node morgenlauf.mjs 2026-09-07 (bestimmter Tag)
   ============================================================ */
import { konfigLaden, tagesdatum } from './konfig.mjs';
import * as secplan from './secplan.mjs';
import * as Paket from './paket.mjs';
import { schicken } from './benachrichtigung.mjs';

export async function morgenlauf(konfig, tag, { stumm = false } = {}) {
  const datum = tag || tagesdatum(konfig.tagesversatz);
  const vorhanden = (await Paket.laden(konfig, datum)) || Paket.leeresPaket(datum);

  let soll = [];
  let hinweis = '';
  try {
    soll = await secplan.sollHolen(konfig, datum);
  } catch (f) {
    // Kein Beinbruch: der uebliche Weg ist die Abgleichliste als PDF.
    // Der Hinweis wandert ins Tagespaket und in die Morgenmail.
    hinweis = f.message;
    console.log('Hinweis zum Dienstplan: ' + f.message);
  }

  vorhanden.soll = soll.length ? soll : vorhanden.soll;
  vorhanden.tag = datum;
  vorhanden.hinweis = hinweis;
  vorhanden.quelle = konfig.modus;
  await Paket.sichern(konfig, vorhanden);

  const adresse = `http://${konfig.host === '0.0.0.0' ? 'localhost' : konfig.host}:${konfig.port}` +
    `/intern/abgleich.html?tag=${datum}&t=${konfig.token}`;

  if (!stumm) await schicken(konfig, vorhanden, adresse);

  const geloescht = await Paket.aufraeumen(konfig);
  if (geloescht) console.log(`${geloescht} alte Tagespakete geloescht (Aufbewahrung: ${konfig.aufbewahrungTage} Tage).`);

  return { tag: datum, schichten: vorhanden.soll.length, adresse, hinweis };
}

const direktAufgerufen = process.argv[1] && process.argv[1].endsWith('morgenlauf.mjs');
if (direktAufgerufen) {
  const konfig = await konfigLaden();
  const tag = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : null;
  const ergebnis = await morgenlauf(konfig, tag);
  console.log(`Tagespaket ${ergebnis.tag}: ${ergebnis.schichten} Schichten.`);
  process.exit(0);
}

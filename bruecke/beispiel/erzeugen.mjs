#!/usr/bin/env node
/* ============================================================
   Beispieldaten erzeugen
   ------------------------------------------------------------
   Baut die zwei Dateien, mit denen sich das Werkzeug vorfuehren
   und pruefen laesst, ohne dass jemand echte Personaldaten
   anfassen muss:

     abgleichliste-beispiel.pdf   wie der Export aus secplan
     stundenzettel-beispiel.csv   wie ein Zettel vom Einsatz

   Alle Namen sind erfunden. Die Leute darin stehen auch im
   secplan-Doppel (test/scheinplan.mjs), damit die Uebertragung
   in der Vorfuehrung wirklich etwas bewirkt.

       node beispiel/erzeugen.mjs
   ============================================================ */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schichtenAnlegen } from '../test/scheinplan.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));

/* Spaltenpositionen wie im echten secplan-Export (A4 quer, TCPDF) */
const X = { planung: 33, mitarbeiter: 93, funktion: 153, datum: 213, von: 273, bis: 333,
            arbeitszeit: 453, status: 573, tarif: 633, anwesend: 753 };

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function deutsch(iso) {
  const [j, m, t] = iso.split('-');
  const d = new Date(+j, +m - 1, +t);
  return `${WOCHENTAG[d.getDay()]}, ${t}.${m}.${j}`;
}

function dauer(von, bis) {
  const min = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
  let d = min(bis) - min(von);
  if (d <= 0) d += 1440;
  return String(Math.floor(d / 60)).padStart(2, '0') + ':' + String(d % 60).padStart(2, '0');
}

/* Lange Eintraege brechen um — genau wie im Original, damit die
   Beispieldatei dieselben Stolpersteine hat wie die echte. */
function umbrechen(text, hoechstens) {
  if (text.length <= hoechstens) return [text, ''];
  const schnitt = text.lastIndexOf(' ', hoechstens);
  if (schnitt > 0) return [text.slice(0, schnitt + 1), text.slice(schnitt + 1)];
  return [text.slice(0, hoechstens), text.slice(hoechstens)];
}

function seiteBauen(zeilen) {
  let inhalt = 'BT /F1 11.000000 Tf ET\n';
  for (const { y, teile } of zeilen) {
    for (const [x, text] of teile) {
      if (!text) continue;
      const sicher = String(text).replace(/([()\\])/g, '\\$1');
      inhalt += `q 0 0 0 rg BT 0 Tr 0 w ET BT ${x}.000000 ${y}.000000 Td [(${sicher})] TJ ET Q\n`;
    }
  }
  return inhalt;
}

function pdfBauen(seiten) {
  let roh = '%PDF-1.7\n';
  seiten.forEach((inhalt, i) => {
    roh += `${i + 1} 0 obj\n<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream\nendobj\n`;
  });
  roh += '%%EOF\n';
  return Buffer.from(roh, 'latin1');
}

const schichten = schichtenAnlegen();

const kopf = { y: 483, teile: [
  [X.planung, ' Planung'], [X.mitarbeiter, ' Mitarbeiter'], [X.funktion, ' Funktion'],
  [X.datum, ' Datum'], [X.von, ' von'], [X.bis, ' bis'], [393, ' Pause / Dauer'],
  [X.arbeitszeit, ' Arbeitszeit'], [513, ' Info'], [X.status, 'Abgleichstatu'],
  [X.tarif, ' Tarif'], [693, ' Schulung'], [X.anwesend, ' Status']
] };

const zeilen = [
  { y: 554, teile: [[28, 'Abgleich 01.09. - 08.09.2026']] },
  { y: 532, teile: [[28, 'Erstellt von: Beispiel, Buero']] },
  { y: 518, teile: [[28, 'Datum: 09.09.2026 07:00']] },
  kopf,
  { y: 473, teile: [[X.status, 's']] }
];

let y = 460;
for (const s of schichten) {
  const [planung1, planung2] = umbrechen(s.planung, 12);
  const [funktion1, funktion2] = umbrechen(s.funktion, 17);
  const [name1, name2] = umbrechen(`${s.name} (${s.nummer}) `, 18);

  zeilen.push({ y, teile: [
    [X.planung, planung1], [X.mitarbeiter, name1], [X.funktion, funktion1],
    [X.datum, deutsch(s.datum) + '  '], [X.von, s.von + '  '], [X.bis, s.bis + '  '],
    [X.arbeitszeit, dauer(s.von, s.bis)], [X.status, 'Nicht'],
    [X.tarif, 'SMA HH gem. '], [X.anwesend, 'anwesend ']
  ] });
  zeilen.push({ y: y - 9, teile: [
    [X.planung, planung2], [X.mitarbeiter, name2], [X.funktion, funktion2],
    [X.status, 'abgeglichen'], [X.tarif, 'BDSW ']
  ] });
  y -= 22;
}
zeilen.push({ y: 14, teile: [[400, 'Seite 1/1']] });

await writeFile(path.join(HIER, 'abgleichliste-beispiel.pdf'), pdfBauen([seiteBauen(zeilen)]));

/* ---- Stundenzettel vom Einsatz -------------------------------
   Absichtlich mit allem, was im Alltag vorkommt: eine Schicht in
   zwei Zeilen nach Format, ein Kuerzel statt des vollen Namens,
   eine Verlaengerung, jemand der gar nicht auftaucht, und eine
   Person, die nicht im Plan stand.                             */
const zettel = [
  'Datum;Name;Beginn;Ende;Unterschrift;Format;Stunden',
  '08.09.26;Ruth Kuehn-Adler;08:30;13:00;;KS;4,5',
  '08.09.26;R. Kuehn-Adler;13:00;17:30;;ML;4,5',
  '08.09.26;Luis Sanchez;19:00;02:00;;KS;7,0',
  '08.09.26;Emily Fett;10:30;18:45;;ML;8,25',
  '08.09.26;Marko Terzic;14:30;23:30;;KS;9,0',
  '08.09.26;Grace Oduya;06:00;12:30;;ML;6,5',
  '08.09.26;Marlene Vogel;17:00;21:00;;KS;4,0',
  '08.09.26;Timo Renner;18:00;23:00;;KS;5,0'
].join('\r\n') + '\r\n';

await writeFile(path.join(HIER, 'stundenzettel-beispiel.csv'), '﻿' + zettel, 'utf8');

console.log('Beispieldateien erzeugt:');
console.log('  beispiel/abgleichliste-beispiel.pdf   (' + schichten.length + ' Schichten)');
console.log('  beispiel/stundenzettel-beispiel.csv');

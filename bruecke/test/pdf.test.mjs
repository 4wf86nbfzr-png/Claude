/* Tests fuer das Lesen der secplan-Abgleichliste.
   ------------------------------------------------------------
   Die echte Liste enthaelt Namen und Personalnummern von
   Kollegen — die gehoeren nicht in ein Repository. Deshalb baut
   dieser Test ein PDF mit demselben Aufbau (dieselben
   Spaltenpositionen, dieselben Umbrueche) und erfundenen Leuten.
   Nachgestellt ist genau das, was in der Praxis Aerger macht:
   Namen ueber zwei Zeilen, ein Bindestrich am Zeilenende, ein
   mitten im Wort umgebrochenes "Sicherheitsmitarbeiter" und
   eine zweite Seite mit wiederholter Kopfzeile. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/js/intern/pdf.js';
import '../../assets/js/intern/kern.js';

const P = globalThis.HSTPdf;
const K = globalThis.HSTAbgleich;

/* Spaltenpositionen wie im echten Export */
const X = { planung: 33, mitarbeiter: 93, funktion: 153, datum: 213, von: 273, bis: 333,
            dauer: 393, arbeitszeit: 453, info: 513, status: 573, tarif: 633,
            schulung: 693, anwesend: 753 };

function seiteBauen(zeilen) {
  let inhalt = 'BT /F1 11.000000 Tf ET\n';
  for (const zeile of zeilen) {
    for (const [x, text] of zeile.teile) {
      inhalt += `q 0 0 0 rg BT 0 Tr 0 w ET BT ${x}.000000 ${zeile.y}.000000 Td [(${text})] TJ ET Q\n`;
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
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes.buffer;
}

const KOPF = { y: 483, teile: [
  [X.planung, ' Planung'], [X.mitarbeiter, ' Mitarbeiter'], [X.funktion, ' Funktion'],
  [X.datum, ' Datum'], [X.von, ' von'], [X.bis, ' bis'], [X.dauer, ' Pause / Dauer'],
  [X.arbeitszeit, ' Arbeitszeit'], [X.info, ' Info'], [X.status, 'Abgleichstatu'],
  [X.tarif, ' Tarif'], [X.schulung, ' Schulung'], [X.anwesend, ' Status']
] };
const KOPF_REST = { y: 473, teile: [[X.status, 's']] };

const seiteEins = seiteBauen([
  { y: 554, teile: [[28, 'Abgleich 01.08. - 08.09.2026']] },
  { y: 532, teile: [[28, 'Erstellt von: Muster, Max']] },
  KOPF, KOPF_REST,
  // ein umgebrochener Doppelname mit Bindestrich
  { y: 460, teile: [[X.planung, '123 FM - '], [X.mitarbeiter, 'Kuehn-'], [X.funktion, 'Sicherheitsmitarb'],
                    [X.datum, 'Di, 08.09.2026  '], [X.von, '08:30  '], [X.bis, '16:00  '],
                    [X.arbeitszeit, '07:30'], [X.status, 'Nicht'], [X.tarif, 'SMA HH gem. '], [X.anwesend, 'anwesend ']] },
  { y: 451, teile: [[X.planung, 'Sicherheit  '], [X.mitarbeiter, 'Adler, Ruth (2027)  '],
                    [X.funktion, 'eiter  '], [X.status, 'abgeglichen'], [X.tarif, 'BDSW ']] },
  // Umlaut, einfacher Name
  { y: 438, teile: [[X.planung, '13 FM - Call'], [X.mitarbeiter, 'Kränke, Corrina'], [X.funktion, 'Call Center'],
                    [X.datum, 'Di, 01.09.2026  '], [X.von, '17:00  '], [X.bis, '21:00  '],
                    [X.arbeitszeit, '04:00'], [X.status, 'Nicht'], [X.tarif, 'Services  '], [X.anwesend, 'anwesend ']] },
  { y: 430, teile: [[X.planung, 'Center  '], [X.mitarbeiter, '(2658)  '], [X.funktion, 'Agency  '], [X.status, 'abgeglichen']] },
  // Nachtschicht ueber Mitternacht
  { y: 417, teile: [[X.planung, '123 FM - '], [X.mitarbeiter, 'Sanchez, Luis'], [X.funktion, 'Teamleiter'],
                    [X.datum, 'Di, 08.09.2026  '], [X.von, '19:00  '], [X.bis, '02:00  '],
                    [X.arbeitszeit, '07:00'], [X.status, 'Nicht'], [X.tarif, 'SMA HH gem. '], [X.anwesend, 'anwesend ']] },
  { y: 408, teile: [[X.planung, 'Sicherheit  '], [X.mitarbeiter, '(1005)  '], [X.funktion, 'Sicherheit  '], [X.status, 'abgeglichen']] },
  { y: 14, teile: [[400, 'Seite 1/2']] }
]);

const seiteZwei = seiteBauen([
  KOPF, KOPF_REST,
  { y: 460, teile: [[X.planung, '125 FM - '], [X.mitarbeiter, 'Fett, Emily'], [X.funktion, 'Hostess'],
                    [X.datum, 'Di, 08.09.2026  '], [X.von, '10:30  '], [X.bis, '20:00  '],
                    [X.arbeitszeit, '09:30'], [X.status, 'Nicht'], [X.tarif, 'Services  '], [X.anwesend, 'anwesend ']] },
  { y: 451, teile: [[X.planung, 'Hostessen  '], [X.mitarbeiter, '(2850)  '], [X.status, 'abgeglichen']] },
  { y: 14, teile: [[400, 'Seite 2/2']] },
  { y: 1, teile: [[400, 'Powered by TCPDF (www.tcpdf.org)']] }
]);

const PDF = pdfBauen([seiteEins, seiteZwei]);

test('PDF wird als PDF erkannt', () => {
  assert.equal(P.istPdf(PDF), true);
  assert.equal(P.istPdf(new Uint8Array([1, 2, 3, 4]).buffer), false);
});

test('Textstuecke behalten Seite und Position', async () => {
  const stuecke = await P.stuecke(PDF);
  assert.ok(stuecke.length > 20);
  const titel = stuecke.filter((s) => s.text.startsWith('Abgleich '))[0];
  assert.equal(titel.seite, 1);
  assert.equal(Math.round(titel.x), 28);
  assert.ok(stuecke.some((s) => s.seite === 2));
});

test('Zeilen fassen zusammen, was auf einer Hoehe steht', async () => {
  const zeilen = P.zeilenAus(await P.stuecke(PDF));
  const kopf = zeilen.filter((z) => z.teile.some((t) => t.text.trim() === 'Mitarbeiter'));
  assert.equal(kopf.length, 2);                       // einmal je Seite
  assert.equal(kopf[0].teile.length, 13);
  assert.deepEqual(kopf[0].teile.map((t) => t.x), kopf[0].teile.map((t) => t.x).slice().sort((a, b) => a - b));
});

test('Abgleichliste wird zu Schichten', async () => {
  const soll = K.secplanAbgleichLesen(P.zeilenAus(await P.stuecke(PDF)));
  assert.equal(soll.length, 4);

  const [kuehn, kraenke, sanchez, fett] = soll;

  // Umbruch mit Bindestrich: der Name muss wieder zusammenwachsen
  assert.equal(kuehn.mitarbeiter.name, 'Ruth Kuehn-Adler');
  assert.equal(kuehn.mitarbeiter.nachnameZuerst, 'Kuehn-Adler, Ruth');
  assert.equal(kuehn.mitarbeiter.personalnummer, '2027');
  // Mitten im Wort umgebrochen — und ein freistehender Bindestrich bleibt frei
  assert.equal(kuehn.funktion, 'Sicherheitsmitarbeiter');
  assert.equal(kuehn.einsatz, '123 FM - Sicherheit');
  assert.equal(kuehn.datum, '2026-09-08');
  assert.equal(kuehn.beginn, 510);
  assert.equal(kuehn.ende, 960);
  assert.equal(kuehn.abgleichstatus, 'Nicht abgeglichen');

  assert.equal(kraenke.mitarbeiter.name, 'Corrina Kränke');   // Umlaut heil
  assert.equal(kraenke.datum, '2026-09-01');
  assert.equal(kraenke.funktion, 'Call Center Agency');

  assert.equal(K.dauer(sanchez.beginn, sanchez.ende), 420);   // 19:00–02:00

  // Seite 2: die wiederholte Kopfzeile darf sich nicht an den
  // letzten Satz der Seite davor haengen
  assert.equal(fett.mitarbeiter.name, 'Emily Fett');
  assert.equal(fett.abgleichstatus, 'Nicht abgeglichen');
  assert.ok(!/s$/.test(sanchez.abgleichstatus.replace('Nicht abgeglichen', '')));
});

test('Namensform aus secplan wird gedreht', () => {
  const p = K.personAusSecplan('Paquete Jordao, Jose Manuel (3252)');
  assert.equal(p.name, 'Jose Manuel Paquete Jordao');
  assert.equal(p.nachnameZuerst, 'Paquete Jordao, Jose Manuel');
  assert.equal(p.personalnummer, '3252');
});

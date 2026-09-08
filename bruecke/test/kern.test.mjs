/* Tests fuer die Abgleich-Logik. Aufrufen mit `npm test` in bruecke/.
   Die Faelle sind aus echten Zeitlisten abgeleitet: Nachtschichten,
   handschriftliche Kuerzel, Listen ohne Kopfzeile. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/js/intern/kern.js';

const K = globalThis.HSTAbgleich;

test('Uhrzeiten in allen Schreibweisen', () => {
  assert.equal(K.minutenAusZeit('18:00'), 1080);
  assert.equal(K.minutenAusZeit('18.00'), 1080);
  assert.equal(K.minutenAusZeit('1800'), 1080);
  assert.equal(K.minutenAusZeit('18'), 1080);
  assert.equal(K.minutenAusZeit('18:00 Uhr'), 1080);
  assert.equal(K.minutenAusZeit('815'), 495);
  assert.equal(K.minutenAusZeit('00:30'), 30);
  assert.equal(K.minutenAusZeit('24:00'), 1440);
  assert.equal(K.minutenAusZeit('25:00'), null);
  assert.equal(K.minutenAusZeit('18:70'), null);
  assert.equal(K.minutenAusZeit(''), null);
  assert.equal(K.zeitAusMinuten(1080), '18:00');
  assert.equal(K.zeitAusMinuten(1500), '01:00');
});

test('Dauer laeuft ueber Mitternacht', () => {
  assert.equal(K.dauer(1080, 1320), 240);          // 18:00 – 22:00
  assert.equal(K.dauer(1080, 120), 480);           // 18:00 – 02:00
  assert.equal(K.dauer(1380, 360), 420);           // 23:00 – 06:00
});

test('Kuerzeste Differenz kennt den Tageswechsel', () => {
  assert.equal(K.kuerzesteDifferenz(15, 1435), 20);   // 00:15 gegen 23:55
  assert.equal(K.kuerzesteDifferenz(1435, 15), -20);
  assert.equal(K.kuerzesteDifferenz(1090, 1080), 10);
});

test('Runden nach Raster und Richtung', () => {
  assert.equal(K.runden(1087, 15, 'kaufmaennisch', 'beginn'), 1080);  // 18:07 -> 18:00
  assert.equal(K.runden(1088, 15, 'kaufmaennisch', 'beginn'), 1095);  // 18:08 -> 18:15
  assert.equal(K.runden(1087, 15, 'mitarbeiter', 'beginn'), 1080);    // zugunsten MA: ab
  assert.equal(K.runden(1087, 15, 'mitarbeiter', 'ende'), 1095);      // zugunsten MA: auf
  assert.equal(K.runden(1087, 15, 'firma', 'beginn'), 1095);
  assert.equal(K.runden(1080, 15, 'kaufmaennisch', 'beginn'), 1080);
});

test('Pause nach ArbZG', () => {
  assert.equal(K.pauseNachGesetz(5 * 60), 0);
  assert.equal(K.pauseNachGesetz(7 * 60), 30);
  assert.equal(K.pauseNachGesetz(10 * 60), 45);
});

test('Nachtanteil', () => {
  assert.equal(K.nachtMinuten(1320, 120, 1380, 360), 180);  // 22:00–02:00, Fenster 23–06
});

test('Namen finden zusammen', () => {
  assert.ok(K.namensAehnlichkeit('Mustermann, Max', 'Max Mustermann') > 0.95);
  assert.ok(K.namensAehnlichkeit('Mustermann, M.', 'Max Mustermann') > 0.85);
  assert.ok(K.namensAehnlichkeit('Musterman Max', 'Max Mustermann') > 0.85);  // Tippfehler
  assert.ok(K.namensAehnlichkeit('Müller', 'Mueller') === 1);
  assert.ok(K.namensAehnlichkeit('Max Mustermann', 'Erika Schmidt') < 0.4);
});

const personen = [
  { id: '1', name: 'Max Mustermann', personalnummer: '1042' },
  { id: '2', name: 'Erika Schmidt', personalnummer: '1051' },
  { id: '3', name: 'Marek Musielak', personalnummer: '1077' }
];

test('Zuordnung: sicher, Alias, Personalnummer, mehrdeutig', () => {
  assert.equal(K.zuordnen('Mustermann, Max', personen).person.id, '1');
  assert.equal(K.zuordnen('1051', personen).grund, 'personalnummer');
  assert.equal(K.zuordnen('Erika S.', personen).person.id, '2');
  assert.equal(K.zuordnen('Kollege Peter', personen).person, null);
  const mitAlias = K.zuordnen('Muse', personen, { 'muse': '3' });
  assert.equal(mitAlias.grund, 'alias');
  assert.equal(mitAlias.person.id, '3');
});

test('Zeitliste mit Kopfzeile und Semikolon', () => {
  const text = [
    'Name;von;bis;Pause;Bemerkung',
    'Mustermann, Max;18:00;02:15;30;Einlass',
    'Schmidt, Erika;17:45;01:00;;Garderobe',
    'Summe;;;;'
  ].join('\n');
  const r = K.zeitlisteLesen(text);
  assert.equal(r.zeilen.length, 2);
  assert.equal(r.zeilen[0].rohname, 'Mustermann, Max');
  assert.equal(r.zeilen[0].beginn, 1080);
  assert.equal(r.zeilen[0].ende, 135);
  assert.equal(r.zeilen[0].pause, 30);
  assert.equal(r.zeilen[1].pause, null);
});

test('Zeitliste ohne Kopfzeile, so wie sie abgetippt wird', () => {
  const text = [
    'Einsatz Halle 45, 07.09.2026',
    '1. Mustermann, Max   18:00 - 02:15   30',
    '2. Schmidt Erika     17:45 – 01:00',
    'Musielak M.          18:00-02:00  30 Ordner',
    'Unterschrift Schichtleiter'
  ].join('\n');
  const r = K.zeitlisteLesen(text);
  assert.equal(r.zeilen.length, 3);
  assert.equal(r.datum, '2026-09-07');
  assert.equal(r.zeilen[0].rohname, 'Mustermann, Max');
  assert.equal(r.zeilen[0].pause, 30);
  assert.equal(r.zeilen[1].beginn, 1065);
  assert.equal(r.zeilen[2].rohname, 'Musielak M.');
});

test('Datum in der Zeile wird nicht als Uhrzeit gelesen', () => {
  const r = K.zeitlisteLesen('Mustermann Max 07.09.2026 18:00 02:00');
  assert.equal(r.zeilen.length, 1);
  assert.equal(r.zeilen[0].beginn, 1080);
  assert.equal(r.zeilen[0].ende, 120);
  assert.equal(r.zeilen[0].datum, '2026-09-07');
});

const soll = [
  { id: 'S1', datum: '2026-09-07', einsatz: 'Halle 45 – Gala', pause: 30,
    mitarbeiter: personen[0], beginn: 1080, ende: 120 },
  { id: 'S2', datum: '2026-09-07', einsatz: 'Halle 45 – Gala', pause: 0,
    mitarbeiter: personen[1], beginn: 1065, ende: 60 },
  { id: 'S3', datum: '2026-09-07', einsatz: 'Halle 45 – Gala', pause: 30,
    mitarbeiter: personen[2], beginn: 1080, ende: 120 }
];

test('Bewertung: innerhalb der Toleranz bleibt der Plan stehen', () => {
  const u = K.bewerten(soll[0], { beginn: 1083, ende: 118 }, {});
  assert.equal(u.status, 'passt');
  assert.equal(u.beginn, 1080);
  assert.equal(u.ende, 120);
  assert.equal(u.diffDauer, 0);
});

test('Bewertung: echte Abweichung wird gerundet uebernommen', () => {
  const u = K.bewerten(soll[0], { beginn: 1080, ende: 200 }, {});   // bis 03:20
  assert.equal(u.status, 'abweichung');
  assert.equal(u.ende, 195);                                        // 03:15
  assert.equal(u.diffEnde, 80);
});

test('Bewertung: Ausreisser landen in der Pruefung', () => {
  const u = K.bewerten(soll[0], { beginn: 600, ende: 120 }, {});    // 10:00 statt 18:00
  assert.equal(u.status, 'pruefen');
});

test('Abgleich einer ganzen Schicht', () => {
  const ist = K.zeitlisteLesen([
    'Name;von;bis;Pause',
    'Mustermann, Max;18:02;02:05;30',
    'Musielak M.;18:00;04:00;30',
    'Fremder Kollege;19:00;23:00;0'
  ].join('\n'), { datum: '2026-09-07' }).zeilen;

  const r = K.abgleichen(soll, ist, personen, {});
  const nach = (s) => r.zeilen.filter((z) => z.status === s);

  assert.equal(nach('passt').length, 1);        // Mustermann
  assert.equal(nach('abweichung').length, 1);   // Musielak, zwei Stunden laenger
  assert.equal(nach('fehlt').length, 1);        // Schmidt hat nicht abgezeichnet
  assert.equal(nach('unklar').length, 1);       // Name nicht in den Stammdaten
  assert.equal(r.kennzahlen.gesamt, 4);
  assert.equal(r.kennzahlen.freigegeben, 1);    // nur „passt" ist vorab freigegeben

  const abw = nach('abweichung')[0];
  assert.equal(K.zeitAusMinuten(abw.vorschlag.ende), '04:00');
  assert.equal(abw.diffDauer, 120);
});

test('Abgleich ordnet bei mehreren Schichten die naechstliegende zu', () => {
  const zweiSchichten = [
    { id: 'A', datum: '2026-09-07', mitarbeiter: personen[0], beginn: 480, ende: 720, pause: 0 },
    { id: 'B', datum: '2026-09-07', mitarbeiter: personen[0], beginn: 1080, ende: 1320, pause: 0 }
  ];
  const ist = [{ rohname: 'Mustermann', beginn: 1085, ende: 1325, datum: '2026-09-07' }];
  const r = K.abgleichen(zweiSchichten, ist, personen, {});
  const zugeordnet = r.zeilen.filter((z) => z.ist)[0];
  assert.equal(zugeordnet.schichtId, 'B');
  assert.equal(zugeordnet.status, 'passt');
});

test('Soll aus einem CSV-Export lesen', () => {
  const csv = [
    'Datum;Mitarbeiter;Personalnummer;Objekt;von;bis;Pause;SchichtID',
    '07.09.2026;Max Mustermann;1042;Halle 45;18:00;02:00;30;S1'
  ].join('\n');
  const s = K.sollAusCsv(csv);
  assert.equal(s.length, 1);
  assert.equal(s[0].datum, '2026-09-07');
  assert.equal(s[0].beginn, 1080);
  assert.equal(s[0].mitarbeiter.personalnummer, '1042');
  assert.equal(s[0].id, 'S1');
});

test('CSV-Ausgabe enthaelt nur Freigegebenes', () => {
  const r = K.abgleichen(soll, [{ rohname: 'Mustermann Max', beginn: 1080, ende: 120, pause: 30, datum: '2026-09-07' }], personen, {});
  const csv = K.csvSchreiben(r.zeilen);
  const zeilen = csv.trim().split('\r\n');
  assert.match(zeilen[0], /^Datum;Personalnummer/);
  assert.equal(zeilen.length, 2);              // Kopf + Mustermann; die zwei „fehlt" bleiben draussen
  assert.match(zeilen[1], /Mustermann/);
  assert.match(zeilen[1], /7,50/);             // 18:00–02:00 abzueglich 30 min
});

test('Freigabepaket traegt nur, was freigegeben wurde', () => {
  const r = K.abgleichen(soll, [{ rohname: 'Mustermann Max', beginn: 1080, ende: 200, datum: '2026-09-07' }], personen, {});
  const abw = r.zeilen.filter((z) => z.status === 'abweichung')[0];
  let paket = K.freigabePaket(r.zeilen, '2026-09-07', 'Noah');
  assert.equal(paket.schichten.length, 0);     // Abweichung ist noch nicht freigegeben
  abw.freigegeben = true;
  paket = K.freigabePaket(r.zeilen, '2026-09-07', 'Noah');
  assert.equal(paket.schichten.length, 1);
  assert.equal(paket.schichten[0].schichtId, 'S1');
  assert.equal(paket.schichten[0].ende, '03:15');
  assert.equal(paket.bearbeiter, 'Noah');
});

test('Text aus der Texterkennung wird gelesen', () => {
  // Wortwoertlich das, was tesseract aus dem Foto einer Zeitliste macht:
  // Spalten stehen mit vielen Leerzeichen da, die Null in Klammern.
  const ausOcr = [
    'Zeitliste Halle 45 - Gala',
    'Datum: 07.09.2026 Schichtleiter: N. Benkhofer',
    '',
    'Name                             von           bis            Pause',
    '',
    'Mustermann, Max      18:00      02:15      30',
    '',
    'Schmidt, Erika           17:45      01:00      [0]',
    '',
    'Musielak, Marek        18:00      04:00      30'
  ].join('\n');

  const r = K.zeitlisteLesen(ausOcr, { quelle: 'ocr' });
  assert.equal(r.zeilen.length, 3);
  assert.equal(r.datum, '2026-09-07');
  assert.equal(r.zeilen[0].rohname, 'Mustermann, Max');
  assert.equal(r.zeilen[0].beginn, 1080);
  assert.equal(r.zeilen[0].ende, 135);
  assert.equal(r.zeilen[0].pause, 30);
  assert.equal(r.zeilen[1].pause, 0);
  assert.equal(r.zeilen[2].ende, 240);
});

test('Datum wird auch spaeter im Text gefunden', () => {
  const r = K.zeitlisteLesen([
    'Halle 45',
    'Mustermann Max 18:00 02:00',
    'Abgezeichnet am 07.09.2026'
  ].join('\n'));
  assert.equal(r.datum, '2026-09-07');
  assert.equal(r.zeilen.length, 1);
});

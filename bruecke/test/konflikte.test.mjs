/* Konflikte und Sprache.
   ------------------------------------------------------------
   Der Abgleich sagt, ob Plan und Zettel zusammenpassen — nicht,
   ob das Ergebnis in Ordnung ist. Jemand kann exakt wie geplant
   vierzehn Stunden gearbeitet haben. Diese Faelle pruefen das
   Ergebnis gegen das Arbeitszeitgesetz und gegen sich selbst. */
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../assets/js/intern/kern.js';

const K = globalThis.HSTAbgleich;

const RUTH = { id: '2027', name: 'Ruth Kuehn-Adler', nachnameZuerst: 'Kuehn-Adler, Ruth', personalnummer: '2027' };
const LUIS = { id: '1005', name: 'Luis Sanchez', nachnameZuerst: 'Sanchez, Luis', personalnummer: '1005' };

function zeile(person, datum, von, bis, pause, id) {
  return {
    id: id || ('z' + von), status: 'abweichung', name: person.name, person: person, datum: datum,
    einsatz: '123 FM - Sicherheit', soll: { beginn: von, ende: bis, pause: pause || 0 },
    ist: null, vorschlag: { beginn: von, ende: bis, pause: pause || 0 },
    diffBeginn: 0, diffEnde: 0, diffDauer: 0, freigegeben: false, notiz: ''
  };
}

test('Hoechstarbeitszeit nach § 3 ArbZG', () => {
  const k = K.konflikte([zeile(RUTH, '2026-09-08', 480, 1200, 30)], {});   // 08:00–20:00, 30 min
  const treffer = k.filter((x) => x.art === 'hoechstarbeitszeit');
  assert.equal(treffer.length, 1);
  assert.equal(treffer[0].paragraf, '§ 3 ArbZG');
  assert.match(treffer[0].text, /11:30 h/);
});

test('Pausen nach § 4 ArbZG', () => {
  const k = K.konflikte([zeile(RUTH, '2026-09-08', 480, 960, 0)], {});     // 8 h ohne Pause
  const p = k.filter((x) => x.art === 'pause');
  assert.equal(p.length, 1);
  assert.match(p[0].text, /Vorgeschrieben sind 30 min/);

  const lang = K.konflikte([zeile(RUTH, '2026-09-08', 480, 1110, 30)], {}); // 10,5 h mit 30 min
  assert.match(lang.filter((x) => x.art === 'pause')[0].text, /45 min/);

  const kurz = K.konflikte([zeile(RUTH, '2026-09-08', 480, 780, 0)], {});   // 5 h
  assert.equal(kurz.filter((x) => x.art === 'pause').length, 0);
});

test('Ueberschneidung zweier Schichten', () => {
  const k = K.konflikte([
    zeile(RUTH, '2026-09-08', 480, 960, 0, 'a'),
    zeile(RUTH, '2026-09-08', 900, 1200, 0, 'b')
  ], {});
  const u = k.filter((x) => x.art === 'ueberschneidung');
  assert.equal(u.length, 1);
  assert.equal(u[0].schwere, 'fehler');
  assert.deepEqual(u[0].zeilen, ['a', 'b']);
});

test('Ruhezeit nach § 5 ArbZG, ueber den Tag hinaus', () => {
  // Dienstagabend bis 02:00, Mittwoch schon um 08:00 wieder da.
  const k = K.konflikte(
    [zeile(RUTH, '2026-09-08', 1140, 120, 0, 'abend')],
    {},
    [{ datum: '2026-09-09', beginn: 480, ende: 960, mitarbeiter: RUTH }]
  );
  const ruhe = k.filter((x) => x.art === 'ruhezeit');
  assert.equal(ruhe.length, 1);
  assert.match(ruhe[0].text, /nur 6:00 h/);
  assert.equal(ruhe[0].paragraf, '§ 5 ArbZG');
});

test('Genug Ruhezeit meldet nichts', () => {
  const k = K.konflikte(
    [zeile(RUTH, '2026-09-08', 480, 960, 30, 'tag')],
    {},
    [{ datum: '2026-09-09', beginn: 480, ende: 960, mitarbeiter: RUTH }]
  );
  assert.equal(k.filter((x) => x.art === 'ruhezeit').length, 0);
});

test('Ausfaelle und unplausible Zeiten', () => {
  const aus = zeile(RUTH, '2026-09-08', 480, 1200, 0, 'x');
  aus.status = 'ausfall';
  assert.equal(K.konflikte([aus], {}).length, 0);      // wer nicht da war, arbeitet nicht zu lang

  const wirr = zeile(LUIS, '2026-09-08', 480, 420, 0, 'y');   // 23 Stunden
  const k = K.konflikte([wirr], {});
  assert.equal(k[0].art, 'unplausibel');
  assert.equal(k[0].schwere, 'fehler');
});

test('Derselbe Zettel zweimal eingelesen', () => {
  const a = zeile(RUTH, '2026-09-08', 600, 1000, 0, 'a');
  const b = zeile(RUTH, '2026-09-08', 600, 1000, 0, 'b');
  a.ist = { beginn: 600, ende: 1000, pause: 0 };
  b.ist = { beginn: 600, ende: 1000, pause: 0 };
  const k = K.konflikte([a, b], {});
  assert.equal(k.filter((x) => x.art === 'doppelt').length, 1);
});

/* ---------------- Sprache ---------------- */

const PERSONEN = [RUTH, LUIS, { id: '2850', name: 'Emily Fett', personalnummer: '2850' }];

test('Zahlwoerter', () => {
  assert.equal(K.zahlAusWort('acht'), 8);
  assert.equal(K.zahlAusWort('dreißig'), 30);
  assert.equal(K.zahlAusWort('fünfundvierzig'), 45);
  assert.equal(K.zahlAusWort('einundzwanzig'), 21);
  assert.equal(K.zahlAusWort('17'), 17);
  assert.equal(K.zahlAusWort('Melone'), null);
});

test('Uhrzeiten aus gesprochenem Deutsch', () => {
  const z = (t) => { const r = K.zeitAusSprache(t); return r && K.zeitAusMinuten(r.minuten); };
  assert.equal(z('acht Uhr dreißig'), '08:30');
  assert.equal(z('achtzehn Uhr fünfundvierzig'), '18:45');
  assert.equal(z('siebzehn Uhr'), '17:00');
  assert.equal(z('halb acht'), '07:30');
  assert.equal(z('18:45'), '18:45');
  assert.equal(z('kein Zeitwort weit und breit'), null);
});

test('Ganze Saetze werden zu Anweisungen', () => {
  const b = K.sprachbefehlLesen('Kuehn-Adler von acht Uhr dreißig bis siebzehn Uhr fünfzehn', PERSONEN);
  assert.equal(b.art, 'zeit');
  assert.equal(b.person.id, '2027');
  assert.equal(K.zeitAusMinuten(b.beginn), '08:30');
  assert.equal(K.zeitAusMinuten(b.ende), '17:15');
  assert.equal(b.verstanden, true);
});

test('Nur das Ende korrigieren', () => {
  const b = K.sprachbefehlLesen('Fett Ende achtzehn Uhr fünfundvierzig', PERSONEN);
  assert.equal(b.person.id, '2850');
  assert.equal(b.beginn, null);
  assert.equal(K.zeitAusMinuten(b.ende), '18:45');
});

test('Ausfall, wie geplant, Pause', () => {
  const a = K.sprachbefehlLesen('Sanchez Ausfall', PERSONEN);
  assert.equal(a.art, 'ausfall');
  assert.equal(a.person.id, '1005');

  const g = K.sprachbefehlLesen('Kuehn-Adler war da, wie geplant', PERSONEN);
  assert.equal(g.art, 'wieGeplant');
  assert.equal(g.person.id, '2027');

  const p = K.sprachbefehlLesen('Pause dreißig Minuten für Fett', PERSONEN);
  assert.equal(p.art, 'pause');
  assert.equal(p.pause, 30);
  assert.equal(p.person.id, '2850');
});

test('Was nicht verstanden wurde, sagt das auch', () => {
  const b = K.sprachbefehlLesen('äh, moment mal', PERSONEN);
  assert.equal(b.verstanden, false);
  assert.equal(b.person, null);

  const ohneName = K.sprachbefehlLesen('von acht bis sechzehn Uhr', PERSONEN);
  assert.equal(ohneName.verstanden, false);   // Zeit ja, aber fuer wen?
  assert.equal(K.zeitAusMinuten(ohneName.beginn), '08:00');

  const leer = K.sprachbefehlLesen('   ', PERSONEN);
  assert.equal(leer.art, 'leer');
});

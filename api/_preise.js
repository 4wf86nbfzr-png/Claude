'use strict';

/* ---------------------------------------------------------------------------
   Die Preisliste
   ---------------------------------------------------------------------------
   Die einzige Stelle im Projekt, an der Zahlen zu Geld stehen. Wer einen Satz
   ändert, ändert ihn hier — und nur hier. Er wirkt dann gleichzeitig im
   Angebotsentwurf, in der Positionstabelle und in der Summenrechnung.

   Herkunft: die vorhandene Angebotsvorlage der HERM Service Team e.K.
   Erfunden ist nichts. Für Fahrservice und Reinigung stand dort **kein**
   Satz — die bleiben deshalb „auf Anfrage" und werden nicht gerechnet.

   ACHTUNG: Diese Sätze stammen aus einem Angebot an einen bestimmten Kunden.
   Falls sie dort verhandelt waren und nicht Ihre Listenpreise sind, gehören
   hier die Listenpreise hin.
--------------------------------------------------------------------------- */

/** Stundensätze in Euro, netto. */
const POSITIONEN = [
  { schluessel: 'servicekraft',    name: 'Servicekraft (Event, Messe)', satz: 26.50 },
  { schluessel: 'serviceleitung',  name: 'Serviceleitung',              satz: 29.50 },
  { schluessel: 'hostess',         name: 'Hostess / Host',              satz: 27.00 },
  { schluessel: 'ordnungsdienst',  name: 'Ordnungsdienstkraft',         satz: 24.50 },
  { schluessel: 'logistikkraft',   name: 'Logistikkraft',               satz: 26.00 },
  { schluessel: 'logistikleitung', name: 'Logistikleitung',             satz: 28.00 }
];

/* Welche Position gehört zu welchem Bereich aus dem Formular. Der erste
   Eintrag ist der, der im Entwurf mit der Personenzahl vorbelegt wird.
   Fahrservice und Reinigung stehen bewusst nicht hier — für sie gibt es
   keinen hinterlegten Satz. */
const BEREICH_ZU_POSITION = {
  'Gastro-Personal':     ['servicekraft', 'serviceleitung'],
  'Gastronomie':         ['servicekraft', 'serviceleitung'],
  'Sicherheit':          ['ordnungsdienst'],
  'Promotion / Hostess': ['hostess'],
  'Promotion':           ['hostess'],
  'Logistik':            ['logistikkraft', 'logistikleitung']
};

/** Bereiche, für die es keinen hinterlegten Satz gibt. */
const OHNE_SATZ = ['Fahrservice', 'Reinigung'];

const ZUSCHLAEGE = {
  /* 22:00 bis 06:00, +25 % auf die Stunden in diesem Fenster */
  nacht:   { vonStunde: 22, bisStunde: 6, anteil: 0.25,
             name: 'Nachtzuschlag (22:00 – 06:00 Uhr)' },
  /* Sonntag erkennt der Entwurf am Datum. Gesetzliche Feiertage nicht —
     dafür bräuchte es einen Kalender je Bundesland. Der Entwurf weist
     deshalb darauf hin, statt still das Falsche zu rechnen. */
  sonntag: { anteil: 0.50, name: 'Sonntagszuschlag' }
};

const UST_SATZ = 0.19;

/* Steht unter der Positionstabelle, wörtlich aus der Vorlage. */
const HINWEISE = [
  'Reisekosten & Zuschläge',
  'Bahnkosten nach Aufwand',
  'Verpflegungspauschale gemäß gesetzlicher Regelung',
  'Nachtzuschlag (22:00 – 06:00 Uhr): +25 %',
  'Sonn- und Feiertagszuschlag: +50 %'
];

function positionFinden(schluessel){
  return POSITIONEN.find(p => p.schluessel === schluessel) || null;
}

/** Die Positionen, die zu einem Bereich gehören — leer, wenn keiner passt. */
function positionenZuBereich(bereich){
  const schluessel = BEREICH_ZU_POSITION[String(bereich || '').trim()] || [];
  return schluessel.map(positionFinden).filter(Boolean);
}

module.exports = {
  POSITIONEN, BEREICH_ZU_POSITION, OHNE_SATZ,
  ZUSCHLAEGE, UST_SATZ, HINWEISE,
  positionFinden, positionenZuBereich
};

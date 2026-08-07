'use strict';

/* ---------------------------------------------------------------------------
   Der Angebotsentwurf
   ---------------------------------------------------------------------------
   Zwei Dinge stehen hier:

   1. `generateOfferDraft()` — macht aus den Formularangaben einen geordneten
      Datensatz. Bewusst maschinenlesbar und in englischen Schlüsseln gehalten,
      damit später eine KI, eine Datenbank oder ein Warenwirtschaftssystem
      daran andocken kann, ohne dass jemand hier etwas umbenennen muss.

   2. `baueAngebotDocx()` — setzt daraus den Angebotsbogen als Word-Datei.

   **Ohne Preise.** Der Bogen bringt mit, was der Kunde eingetippt hat:
   Anschrift, Datum, Uhrzeit, Anzahl. Menge, Preis, Rabatt und die Summen
   bleiben leer — die trägt die Disposition ein. Das ist keine technische
   Grenze, sondern eine Ansage: eine gerechnete Zahl sieht verbindlich aus,
   auch wenn sie nur geschätzt war.

   Der Aufbau folgt dem vorhandenen Angebotsbogen der HERM Service Team e.K.
   Zeile für Zeile — Kopf, Absenderzeile, Anschriftenfeld, Kennzahlenblock,
   Positionstabelle, die sechs Bedingungen und die Fußzeile mit den
   Firmen- und Bankangaben. Erfunden ist nichts; wo im Vorbild ein Wert
   stand, den nur der Betrieb kennt, steht hier ein leeres Feld.
--------------------------------------------------------------------------- */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Footer,
  WidthType, AlignmentType, BorderStyle, ShadingType, ImageRun, VerticalAlign,
  TableLayoutType
} = require('docx');

const LOGO = require('./_logo_dunkel.js');

/* Alles, was auf jedem Bogen gleich steht. Aus dem vorhandenen Angebot
   übernommen — wer etwas ändert, ändert es hier und nur hier. */
const BOGEN = {
  absenderzeile: { firma: 'Herm Service Team e.K.',
                   rest:  ', Gertigstrasse 12-14, 22303 Hamburg, Deutschland' },

  einleitung: 'Wir erlauben uns Ihnen dieses Angebot zu unterbreiten:',

  /* Steht als zweite Zeile unter jeder Position. Wer das nicht mehr so
     handhabt, streicht die Zeile hier. */
  anfahrt: '+ 1 Stunde für An- und Abfahrt je Mitarbeiter',

  bedingungen: [
    ['Schichtzeiten und Kräfteeinsatz:',
     ['Gemäß Schichteinteilung vom Auftraggeber.']],
    ['Im Preis inklusive:',
     ['Einsatzplanung, Dienstkleidung, dauerhafte Erreichbarkeit einer vorgesetzten Person.']],
    ['Kleiderordnung:',
     ['Gemäß Vorgabe vom Auftraggeber.']],
    ['Abrechnung:',
     ['Die Abrechnung der Arbeitsstunden erfolgt auf Basis der tatsächlich geleisteten Arbeitszeit.',
      'Mindestzeitraum der Leistungsbeauftragung: 5 Stunden.']],
    ['Stornierungsbedingungen:',
     ['Bei Stornierungen, die später als 72 Stunden vor Beginn des Einsatzes erfolgen, sind wir '
      + 'gezwungen, die Mindesteinsatzzeit von 5 Stunden in Rechnung zu stellen.']],
    ['Zuschlagspflicht:',
     ['An Feiertagen berechnen wir einen Zuschlag von 100%.']]
  ],

  ust: 19,

  /* Wie lange ein Angebot gilt. Im vorhandenen Bogen lagen zwischen
     Ausstellung und Ablauf sieben Tage. */
  gueltigTage: 7,

  /* Die Fußzeile. Jedes Paar ist [fett, normal]; ein leerer erster Teil
     heißt: nur Fließtext. */
  fuss: [
    [['Herm Service Team e.K.', ', Gertigstrasse 12-14, 22303 Hamburg, Deutschland   '],
     ['St.-Nr.', ': 41 / 093 / 01642   '], ['USt-IdNr.', ': DE314900117']],
    [['Amtsgericht/Nr.', ': HRA 122237   '], ['Geschäftsführer', ': Maik Herm   '],
     ['Telefon', ': +49 40 27075100   '], ['Web', ': www.hermserviceteam.com']],
    [['E-Mail', ': info@hermserviceteam.com   '], ['', 'Zahlungsempfänger: '],
     ['Herm Service Team e.K.', '   '], ['', 'Bankname: '], ['Hamburger Sparkasse', '   '],
     ['', 'BLZ: '], ['20050550', '']],
    [['', 'Kontonr.: '], ['1238210973', '   '], ['', 'IBAN: '],
     ['DE31200505501238210973', '   '], ['', 'SWIFT/BIC: '], ['HASPDEHHXXX', '']]
  ]
};

/* Die Zustände, die ein Angebot durchläuft. Der Entwurf kennt nur den
   ersten; alles Weitere setzt ein Mensch oder ein späterer Freigabeschritt. */
const OFFER_STATUS = Object.freeze({
  DRAFT:           'DRAFT',            // gebaut, Preise offen
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',  // gerechnet, wartet auf die Disposition
  APPROVED:        'APPROVED',         // von der Disposition freigegeben
  SENT:            'SENT',             // an den Kunden geschickt
  ACCEPTED:        'ACCEPTED',         // vom Kunden angenommen
  REJECTED:        'REJECTED'          // abgelehnt oder zurückgezogen
});

const FARBE = { text: '1A1A1A', leise: '6F6F77', linie: 'D8D8DC', kopf: 'F2F2F2' };

/* Arial statt Helvetica: In Word ist Arial auf jedem System vorhanden und
   metrisch dasselbe. Helvetica fiele auf Windows still auf etwas anderes
   zurück, und dann sähe der Bogen bei jedem Empfänger anders aus. */
const SCHRIFT = 'Arial';

/* --- Kleinkram ----------------------------------------------------------- */

const text = w => (w === undefined || w === null) ? '' : String(w).trim();

function datumHuebsch(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(wert));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : text(wert);
}

/** 2026-09-13 → 13.09.26 — so steht es in der Positionszeile des Vorbilds. */
function datumKurz(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(wert));
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : text(wert);
}

/** "16:30" → "16.30" — im Vorbild stehen in den Uhrzeiten Punkte. */
const uhrPunkt = w => text(w).replace(':', '.');

/** "18:30" → 18.5. Alles andere → null. */
function stunde(wert){
  const m = /^(\d{1,2}):(\d{2})$/.exec(text(wert));
  if(!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if(h > 23 || min > 59) return null;
  return h + min / 60;
}

/** Dauer in Stunden, über Mitternacht hinweg. */
function dauer(von, bis){
  if(von === null || bis === null) return null;
  const d = bis > von ? bis - von : (24 - von) + bis;
  return d > 0 && d <= 24 ? d : null;
}

function istSonntag(datum){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(datum));
  if(!m) return false;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() === 0;
}

function angebotsnummer(zeit){
  const t = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
  }).formatToParts(zeit).reduce((o, p) => (o[p.type] = p.value, o), {});
  return `A-${t.year}${t.month}${t.day}-${t.hour}${t.minute}`;
}

/* --- 1. Der Datensatz ---------------------------------------------------- */

/**
 * Baut aus den Formularangaben einen Angebotsentwurf.
 *
 * Preise stehen bewusst nicht drin. Die Schlüssel `pricing`, `subtotal`,
 * `vat` und `total` bleiben trotzdem im Datensatz — leer beziehungsweise
 * null. So kann ein späterer Schritt sie füllen, ohne dass sich die Form
 * ändert, und niemand muss raten, wo sie hingehören.
 *
 * @param {object} daten   Feldname → Wert, so wie das Formular sie schickt
 * @param {Date}   eingang Zeitpunkt der Anfrage
 * @returns {object} Angebotsentwurf
 */
function generateOfferDraft(daten, eingang){
  const zeit = eingang instanceof Date ? eingang : new Date();

  const bereichFrei = text(daten['Bereich (eigene Angabe)']);
  const bereichWahl = text(daten['Bereich']);
  const bereich     = bereichFrei || bereichWahl;

  const von = stunde(daten['Uhrzeit von']);
  const bis = stunde(daten['Uhrzeit bis']);
  const std = dauer(von, bis);

  const anzahlRoh = text(daten['Personenzahl']).replace(',', '.');
  const anzahl    = /^\d+(\.\d+)?$/.test(anzahlRoh) ? Number(anzahlRoh) : null;
  const sonntag   = istSonntag(daten['Datum']);

  /* Die Liste, die die Disposition abarbeitet, bevor der Bogen rausgeht. */
  const gruende = ['Menge, Preis, Rabatt und die drei Summen eintragen.',
                   'Angebotsnummer und Kundennummer vergeben.'];
  if(!bereich)        gruende.push('Es wurde kein Bereich angegeben — Position prüfen.');
  if(anzahl === null) gruende.push('Keine auswertbare Personenzahl — Anzahl in der Position prüfen.');
  if(std === null)    gruende.push('Keine oder unvollständige Uhrzeit — Einsatzzeit ergänzen.');
  if(sonntag)         gruende.push('Der Einsatz fällt auf einen Sonntag.');
  gruende.push('Gesetzliche Feiertage prüft der Entwurf nicht. Bitte gegen den Kalender halten.');

  const gueltig = new Date(zeit.getTime() + BOGEN.gueltigTage * 86400000);

  return {
    offerNumber: angebotsnummer(zeit),   // interne Kennung; auf dem Bogen bleibt das Feld leer
    createdAt:   zeit.toISOString(),
    validUntil:  gueltig.toISOString(),
    status:      OFFER_STATUS.DRAFT,     // ohne Preise nie etwas anderes
    currency:    'EUR',

    customer: {
      company:        text(daten['Firma']),
      contact:        text(daten['Name']),
      email:          text(daten['E-Mail']),
      phone:          text(daten['Telefon']),
      address:        text(daten['Firmenanschrift']),
      billingAddress: text(daten['Rechnungsanschrift']),
      vatId:          text(daten['USt-IdNr.']),
      orderNumber:    text(daten['Bestellnummer']),
      costCenter:     text(daten['Kostenstelle']),
      customerNumber: ''                 // vergibt der Betrieb
    },

    assignment: {
      service:     bereich,
      serviceMenu: bereichWahl,
      date:        text(daten['Datum']),
      timeFrom:    text(daten['Uhrzeit von']),
      timeTo:      text(daten['Uhrzeit bis']),
      hours:       std,
      isSunday:    sonntag,
      location:    text(daten['Ort']),
      headcount:   anzahl,
      description: text(daten['Nachricht'])
    },

    /* Eine Position, alle Geldfelder offen. */
    pricing: [{
      description: (anzahl !== null ? `${anzahl}x ` : '') + (bereich || 'Personal'),
      detail:      [
        (text(daten['Datum']) && von !== null && bis !== null)
          ? `${datumKurz(daten['Datum'])} in der Zeit von `
            + `${uhrPunkt(daten['Uhrzeit von'])}-${uhrPunkt(daten['Uhrzeit bis'])} Uhr`
          : datumKurz(daten['Datum']),
        BOGEN.anfahrt
      ].filter(Boolean),
      quantity: null, unitPrice: null, discount: null, amount: null
    }],
    subtotal: null, vat: null, total: null,

    /* Nie ohne Mensch. Diese beiden Felder sind der Grund, warum der Entwurf
       nur an die Disposition geht. */
    review: { required: true, reasons: gruende }
  };
}

/* --- 2. Das Word-Dokument ------------------------------------------------ */

function lauf(t, o = {}){
  return new TextRun({ text: t, font: SCHRIFT, size: o.groesse || 19,
                       bold: o.fett, italics: o.kursiv,
                       color: o.farbe || FARBE.text, characterSpacing: o.sperrung });
}

function absatz(inhalt, o = {}){
  return new Paragraph({
    alignment: o.align,
    spacing:   { before: o.vor || 0, after: o.nach === undefined ? 40 : o.nach },
    children:  (Array.isArray(inhalt) ? inhalt : [inhalt])
                 .map(x => typeof x === 'string' ? lauf(x, o) : x)
  });
}

const KEIN_RAHMEN = {
  top:  { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left: { style: BorderStyle.NONE }, right:  { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
};
const duenn = { style: BorderStyle.SINGLE, size: 2, color: FARBE.linie };
const RAHMEN_RUNDUM = { top: duenn, bottom: duenn, left: duenn, right: duenn,
                        insideHorizontal: duenn, insideVertical: { style: BorderStyle.NONE } };
const NUR_UNTEN = { top: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE }, bottom: duenn };

/* Rahmen je Zelle statt je Tabelle.
   ---------------------------------------------------------------------------
   In OOXML gewinnt der Zellenrand gegen den Tabellenrand. Wer einer Tabelle
   rundum einen Rahmen gibt und den Zellen „keinen", bekommt keinen — die
   Kästen um Positionstabelle und Summen fehlten deshalb an drei Seiten.
   `rand()` setzt deshalb an jeder Zelle genau die Kanten, die zu sehen sein
   sollen.                                                                  */
const NICHTS = { style: BorderStyle.NONE };
const rand = ({ oben, unten, links, rechts }) => ({
  top:    oben   ? duenn : NICHTS,
  bottom: unten  ? duenn : NICHTS,
  left:   links  ? duenn : NICHTS,
  right:  rechts ? duenn : NICHTS
});

/* Alle Maße in Twips, am Vorbild abgemessen.
   ---------------------------------------------------------------------------
   Word und LibreOffice verteilen prozentuale Spaltenbreiten nach Inhalt neu,
   sobald die Tabelle auf „autofit" steht. Der erste Entwurf sah deshalb im
   Code richtig aus und im Dokument falsch: die Beschreibungsspalte schrumpfte
   auf ein Viertel, „ANGEBOTSBETRAG" brach mitten im Wort um.

   Deshalb steht hier jede Spalte in Twips, dazu TableLayoutType.FIXED.
   Die Zahlen sind keine Schätzung: der vorhandene Bogen wurde ausgemessen
   (Seite 1273 px breit = 210 mm, also 9,35 Twips je Pixel) und die Abstände
   umgerechnet. A4 ist 11906 Twips breit, abzüglich 2 × 800 Rand bleiben
   10306 für den Satzspiegel — die Summe jeder Spaltenliste unten.        */
const RAND_SEITE = 800;
const SATZBREITE = 11906 - 2 * RAND_SEITE;   // 10306

/* Spaltenbreiten, aus dem Vorbild übernommen */
const SPALTEN = {
  kopf:   [5800, 4506],                       // „ANGEBOT" | Wortzeichen
  adresse:[7113, 3193],                       // Anschrift | Kennzahlenblock
  kennzahl:[1930, 1263],                      // Beschriftung | Angabe
  positionen:[4786, 1206, 1345, 1438, 1531],  // Beschreibung … Betrag
  unten:  [4741, 196, 5369],                  // Bedingungen | Luft | Summen
  summen: [3400, 1969]                        // Beschriftung | Betrag
};

/* Schriftgrade in halben Punkten, ebenfalls am Vorbild gemessen */
const GRAD = {
  titel: 34,   // ANGEBOT
  absender: 16, anschrift: 19, kennzahl: 17,
  einleitung: 16, tabellenkopf: 16,
  position: 17, positionDetail: 15,
  bedingung: 16, summe: 17, fuss: 15
};

/* Senkrechte Abstände, gemessen */
const LUFT = {
  /* Gemessen ab der Unterkante der Kopfzeile — und die ist so hoch wie das
     Wortzeichen, nicht wie das Wort „ANGEBOT". Aus dem Irrtum wurden im
     ersten Anlauf 12 mm Luft statt einem. */
  vorAbsender: 90, nachAbsender: 300,
  nachAnschrift: 560, nachEinleitung: 180, nachTabelle: 140,
  kopfzelle: 160, positionszelle: 190, summenzelle: 110,
  /* Das Wortzeichen sitzt im Vorbild tiefer als das Wort „ANGEBOT" —
     rund 6 mm. Ohne diesen Versatz endet die Kopfzeile zu früh und alles
     darunter rutscht mit nach oben. */
  logoTiefer: 325,
  /* Innenabstand in der Positionstabelle, links und rechts */
  zellenrand: 140
};

function zelle(inhalt, o = {}){
  return new TableCell({
    width:   o.dxa ? { size: o.dxa, type: WidthType.DXA } : undefined,
    borders: o.rahmen || KEIN_RAHMEN,
    shading: o.grund ? { type: ShadingType.CLEAR, fill: o.grund } : undefined,
    margins: { top: o.luft === undefined ? 90 : o.luft,
               bottom: o.luft === undefined ? 90 : o.luft,
               left: o.seite === undefined ? 110 : o.seite,
               right: o.seite === undefined ? 110 : o.seite },
    verticalAlign: o.mitte === false ? VerticalAlign.TOP : VerticalAlign.CENTER,
    children: Array.isArray(inhalt) ? inhalt : [inhalt]
  });
}

const tabelle = (zeilen, spalten, rahmen) => new Table({
  width: { size: spalten.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: spalten,
  layout: TableLayoutType.FIXED,
  borders: rahmen || KEIN_RAHMEN,
  rows: zeilen
});

/**
 * @param {object} angebot Ergebnis von generateOfferDraft()
 * @returns {Promise<Buffer>} die .docx-Datei
 */
async function baueAngebotDocx(angebot){
  const k = angebot.customer;
  const p = angebot.pricing[0];
  const teile = [];

  /* Kopf: „ANGEBOT" links, Wortzeichen rechts ----------------------------- */
  teile.push(tabelle([ new TableRow({ children: [
    zelle(absatz('ANGEBOT', { groesse: GRAD.titel, nach: 0 }),
          { dxa: SPALTEN.kopf[0], luft: 0, seite: 0, mitte: false }),
    /* 171 × 65 px bei 96 dpi entsprechen 45 × 17 mm — so groß steht das
       Wortzeichen auf dem vorhandenen Bogen. */
    zelle(new Paragraph({ alignment: AlignmentType.RIGHT,
                          spacing: { after: 0, before: LUFT.logoTiefer },
      children: [ new ImageRun({ data: LOGO, type: 'png',
                                 transformation: { width: 171, height: 65 } }) ] }),
          { dxa: SPALTEN.kopf[1], luft: 0, seite: 0, mitte: false })
  ]})], SPALTEN.kopf));

  /* Absenderzeile --------------------------------------------------------- */
  teile.push(absatz([
    lauf(BOGEN.absenderzeile.firma, { groesse: GRAD.absender, fett: true }),
    lauf(BOGEN.absenderzeile.rest,  { groesse: GRAD.absender, farbe: FARBE.leise })
  ], { vor: LUFT.vorAbsender, nach: LUFT.nachAbsender }));

  /* Anschrift links, Kennzahlen rechts ------------------------------------ */
  /* Firma und Anschrift, sonst nichts: im Vorbild steht im Anschriftenfeld
     keine Ansprechperson. Sie steht im PDF-Beleg, der in derselben Mail
     liegt. */
  const anschrift = [k.company, ...(k.address ? k.address.split('\n') : [])]
    .map(text).filter(Boolean);
  if(!anschrift.length) anschrift.push(k.contact || '');

  const kennzahl = (b, w) => new TableRow({ children: [
    zelle(absatz(b, { groesse: GRAD.kennzahl, nach: 0 }),
          { dxa: SPALTEN.kennzahl[0], luft: 38, seite: 0 }),
    zelle(absatz(w, { groesse: GRAD.kennzahl, fett: true, nach: 0,
                      align: AlignmentType.RIGHT }),
          { dxa: SPALTEN.kennzahl[1], luft: 38, seite: 0 })
  ]});

  teile.push(tabelle([ new TableRow({ children: [
    zelle(anschrift.map(z => absatz(z, { groesse: GRAD.anschrift, nach: 0 })),
          { dxa: SPALTEN.adresse[0], luft: 0, seite: 0, mitte: false }),
    zelle(tabelle([
      kennzahl('Angebotsnr.',       ''),
      kennzahl('Kundennummer',      text(k.customerNumber)),
      kennzahl('Ausstellungsdatum', datumHuebsch(angebot.createdAt.slice(0, 10))),
      kennzahl('Gültig bis',        datumHuebsch(angebot.validUntil.slice(0, 10)))
    ], SPALTEN.kennzahl), { dxa: SPALTEN.adresse[1], luft: 0, seite: 0, mitte: false })
  ]})], SPALTEN.adresse));

  /* Einleitung ------------------------------------------------------------ */
  teile.push(absatz(BOGEN.einleitung, { kursiv: true, groesse: GRAD.einleitung,
                                        vor: LUFT.nachAnschrift, nach: LUFT.nachEinleitung }));

  /* Positionstabelle ------------------------------------------------------ */
  const POS_SP = SPALTEN.positionen;
  const letzte = POS_SP.length - 1;
  const kopf = (t, i, rechts) => zelle(
    absatz(t, { groesse: GRAD.tabellenkopf, fett: true, nach: 0,
                align: rechts ? AlignmentType.RIGHT : undefined }),
    { dxa: POS_SP[i], grund: FARBE.kopf, luft: LUFT.kopfzelle, seite: LUFT.zellenrand,
      rahmen: rand({ oben: true, links: i === 0, rechts: i === letzte }) });

  teile.push(tabelle([
    new TableRow({ children: [
      kopf('BESCHREIBUNG', 0), kopf('MENGE', 1, true), kopf('PREIS (€)', 2, true),
      kopf('RABATT %', 3, true), kopf('BETRAG (€)', 4, true)
    ]}),
    new TableRow({ children: [
      zelle([ absatz(p.description, { groesse: GRAD.position, nach: p.detail.length ? 110 : 0 }),
              ...p.detail.map((d, i) => absatz(d, { groesse: GRAD.positionDetail,
                                                    farbe: FARBE.leise,
                                                    nach: i === p.detail.length - 1 ? 0 : 25 })) ],
            { dxa: POS_SP[0], luft: LUFT.positionszelle, seite: LUFT.zellenrand, mitte: false,
              rahmen: rand({ unten: true, links: true }) }),
      ...POS_SP.slice(1).map((w, i) =>
        zelle(absatz('', { nach: 0, align: AlignmentType.RIGHT }),
              { dxa: w, luft: LUFT.positionszelle, seite: LUFT.zellenrand,
                rahmen: rand({ unten: true, rechts: i + 1 === letzte }) }))
    ]})
  ], POS_SP));

  /* Bedingungen und Summen ------------------------------------------------
     Im Vorbild steht der Summenkasten rechts **neben** den ersten drei
     Bedingungen; sobald er zu Ende ist, läuft der Text darunter über die
     ganze Breite weiter — „Bei Stornierungen, die später als 72 Stunden …"
     reicht dort bis zum rechten Satzrand.

     Word kann Text um eine schwebende Tabelle fließen lassen, aber das
     Ergebnis hängt davon ab, wie hoch der Kasten beim Empfänger gerät. Hier
     wird deshalb geteilt: die ersten drei Bedingungen stehen in einer Zelle
     neben dem Kasten, die letzten drei als gewöhnliche Absätze darunter.
     Das sieht gleich aus und steht bei jedem gleich.                       */
  const NEBEN_KASTEN = 3;

  function bedingungsAbsaetze(von, bis){
    const raus = [];
    BOGEN.bedingungen.slice(von, bis).forEach(([titel, saetze], i) => {
      raus.push(absatz(titel, { groesse: GRAD.bedingung, kursiv: true,
                                vor: (von === 0 && i === 0) ? 0 : 190, nach: 0 }));
      saetze.forEach(z => raus.push(absatz(z, { groesse: GRAD.bedingung,
                                                kursiv: true, nach: 0 })));
    });
    return raus;
  }
  const bedingungen = bedingungsAbsaetze(0, NEBEN_KASTEN);

  const SUM_SP = SPALTEN.summen;
  /* oben nur in der ersten Zeile, unten in jeder — das ergibt den Kasten mit
     zwei Trennlinien darin. */
  const summenZeile = (links, rechts, erste) => new TableRow({ children: [
    zelle(links,  { dxa: SUM_SP[0], luft: LUFT.summenzelle, seite: LUFT.zellenrand,
                    rahmen: rand({ oben: erste, unten: true, links: true }) }),
    zelle(rechts, { dxa: SUM_SP[1], luft: LUFT.summenzelle, seite: LUFT.zellenrand,
                    rahmen: rand({ oben: erste, unten: true, rechts: true }) })
  ]});
  const summe = (b, w, erste) => summenZeile(
    absatz(b, { groesse: GRAD.summe, fett: true, nach: 0 }),
    absatz(w, { groesse: GRAD.summe, fett: true, nach: 0, align: AlignmentType.RIGHT }),
    erste);

  const summenBlock = new Table({
    width: { size: SUM_SP[0] + SUM_SP[1], type: WidthType.DXA },
    columnWidths: SUM_SP,
    layout: TableLayoutType.FIXED,
    borders: KEIN_RAHMEN,
    rows: [
      summe('NETTOBETRAG', '', true),
      summenZeile(
        absatz([ lauf(`UST. ${BOGEN.ust}% `, { groesse: GRAD.summe, fett: true }),
                 lauf('von', { groesse: GRAD.summe, kursiv: true }) ], { nach: 0 }),
        absatz('', { nach: 0 })),
      summe('ANGEBOTSBETRAG', '')
    ]
  });

  /* Die schmale Zelle in der Mitte ist der Abstand zwischen beiden Blöcken —
     im Vorbild stehen sie nicht bündig aneinander. */
  const UNTEN_SP = SPALTEN.unten;
  /* Ein leerer Absatz von 7 Punkt — im Vorbild stehen zwischen Tabellenkante
     und den Bedingungen nur rund 1,5 mm. */
  teile.push(new Paragraph({ spacing: { after: 0, line: LUFT.nachTabelle,
                                        lineRule: 'exact' }, children: [] }));
  teile.push(tabelle([ new TableRow({ children: [
    zelle(bedingungen, { dxa: UNTEN_SP[0], luft: 0, seite: 0, mitte: false }),
    zelle([absatz('', { nach: 0 })], { dxa: UNTEN_SP[1], luft: 0, seite: 0, mitte: false }),
    zelle(summenBlock, { dxa: UNTEN_SP[2], luft: 0, seite: 0, mitte: false })
  ]})], UNTEN_SP));

  /* Der Rest über die ganze Breite, unterhalb des Kastens. */
  teile.push(...bedingungsAbsaetze(NEBEN_KASTEN, BOGEN.bedingungen.length));

  /* Fußzeile — auf jeder Seite ------------------------------------------- */
  const fusszeile = new Footer({ children: BOGEN.fuss.map((zeile, i) =>
    new Paragraph({
      spacing: { after: 0, before: i ? 0 : 60 },
      border: i ? undefined : { top: { style: BorderStyle.SINGLE, size: 2, color: FARBE.linie,
                                       space: 8 } },
      children: zeile.flatMap(([fett, normal]) => [
        ...(fett   ? [lauf(fett,   { groesse: GRAD.fuss, fett: true })] : []),
        ...(normal ? [lauf(normal, { groesse: GRAD.fuss })] : [])
      ])
    })
  )});

  const doc = new Document({
    creator: 'HERM Service Team e.K.',
    title:   'Angebot',
    description: 'Entwurf aus einer Anfrage über hermserviceteam.com — '
               + 'Preise und Nummern trägt die Disposition ein.',
    styles: { default: { document: { run: { font: SCHRIFT, size: 19, color: FARBE.text } } } },
    sections: [{
      properties: { page: { margin: { top: 620, bottom: 900,
                                      left: RAND_SEITE, right: RAND_SEITE,
                                      footer: 420 } } },
      footers: { default: fusszeile },
      children: teile
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  generateOfferDraft, baueAngebotDocx, OFFER_STATUS, BOGEN,
  /* für Tests */ _intern: { stunde, dauer, istSonntag, datumKurz, uhrPunkt }
};

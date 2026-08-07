'use strict';

/* ---------------------------------------------------------------------------
   Der Angebotsentwurf
   ---------------------------------------------------------------------------
   Zwei Dinge stehen hier:

   1. `generateOfferDraft()` — macht aus den Formularangaben einen geordneten
      Datensatz. Der ist bewusst maschinenlesbar und in englischen Schlüsseln
      gehalten, damit später eine KI, eine Datenbank oder ein Warenwirtschafts-
      system daran andocken kann, ohne dass jemand hier etwas umbenennen muss.

   2. `baueAngebotDocx()` — macht aus demselben Datensatz ein Word-Dokument,
      das die Disposition sofort weiterschreiben kann.

   **Der Entwurf ist ein Entwurf.** Er verlässt das Haus nicht von allein: er
   geht ausschließlich an die Disposition, nie an den Kunden. Der Status steht
   deshalb nie auf APPROVED oder SENT — das setzt ein Mensch.
--------------------------------------------------------------------------- */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, ImageRun,
  VerticalAlign, HeadingLevel
} = require('docx');

const PREISE = require('./_preise.js');
const LOGO   = require('./_logo.js');

/* Aus der vorhandenen Angebotsvorlage übernommen. Wer den Absender ändert,
   ändert ihn hier — er steht an keiner zweiten Stelle. */
const ABSENDER = {
  firma:    'Herm Service Team',
  person:   'Frau Carola Hörstermann',
  strasse:  'Gertigstraße 12-14',
  ort:      '22303 Hamburg',
  telefon:  '+49 (40) 27075100',
  mail:     'info@hermserviceteam.com'
};

/* Die Zustände, die ein Angebot durchläuft. Der Entwurf kennt nur die ersten
   beiden; alles Weitere setzt ein Mensch oder ein späterer Freigabeschritt. */
const OFFER_STATUS = Object.freeze({
  DRAFT:           'DRAFT',            // gebaut, aber unvollständig gerechnet
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',  // gerechnet, wartet auf die Disposition
  APPROVED:        'APPROVED',         // von der Disposition freigegeben
  SENT:            'SENT',             // an den Kunden geschickt
  ACCEPTED:        'ACCEPTED',         // vom Kunden angenommen
  REJECTED:        'REJECTED'          // abgelehnt oder zurückgezogen
});

const FARBE = { ink: '0B0B0C', text: '17171A', leise: '6F6F77',
                linie: 'E3E3E7', flaeche: 'F6F6F7' };

/* Arial statt Helvetica: In Word ist Arial auf jedem System vorhanden und
   metrisch dasselbe. Helvetica fiele auf Windows still auf etwas anderes
   zurück, und dann sähe das Angebot bei jedem anders aus. */
const SCHRIFT = 'Arial';

/* --- Kleinkram ----------------------------------------------------------- */

const text = w => (w === undefined || w === null) ? '' : String(w).trim();

function euro(betrag){
  return new Intl.NumberFormat('de-DE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(betrag) + ' €';
}

function datumHuebsch(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(wert));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : text(wert);
}

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

/** Wie viele der Stunden zwischen von und bis liegen im Nachtfenster. */
function nachtstunden(von, bis){
  if(von === null || bis === null) return 0;
  const { vonStunde, bisStunde } = PREISE.ZUSCHLAEGE.nacht;
  let treffer = 0;
  /* In Viertelstunden abtasten — einfacher und nachvollziehbarer als eine
     Intervallschnittrechnung, und bei höchstens 96 Schritten schnell genug. */
  const schritte = Math.round(dauer(von, bis) * 4);
  for(let i = 0; i < schritte; i++){
    const t = (von + (i + 0.5) / 4) % 24;
    if(t >= vonStunde || t < bisStunde) treffer++;
  }
  return treffer / 4;
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
 * Rechnet nur, was sich aus den Angaben ergibt: ohne Uhrzeiten keine Stunden,
 * ohne Stunden keine Summe. Was fehlt, steht in `review.reasons` — das ist
 * die Liste, die die Disposition abarbeitet.
 *
 * @param {object} daten   Feldname → Wert, so wie das Formular sie schickt
 * @param {Date}   eingang Zeitpunkt der Anfrage
 * @returns {object} Angebotsentwurf
 */
function generateOfferDraft(daten, eingang){
  const zeit    = eingang instanceof Date ? eingang : new Date();
  const gruende = [];

  const bereichFrei = text(daten['Bereich (eigene Angabe)']);
  const bereichWahl = text(daten['Bereich']);
  const bereich     = bereichFrei || bereichWahl;

  const von   = stunde(daten['Uhrzeit von']);
  const bis   = stunde(daten['Uhrzeit bis']);
  const std   = dauer(von, bis);
  const nacht = std === null ? 0 : nachtstunden(von, bis);
  const anzahlRoh = text(daten['Personenzahl']).replace(',', '.');
  const anzahl    = /^\d+(\.\d+)?$/.test(anzahlRoh) ? Number(anzahlRoh) : null;
  const sonntag   = istSonntag(daten['Datum']);

  /* Welche Positionen kommen infrage? */
  let positionen = PREISE.positionenZuBereich(bereichWahl);
  if(!positionen.length && bereichFrei) positionen = PREISE.positionenZuBereich(bereichFrei);
  if(!positionen.length){
    gruende.push(PREISE.OHNE_SATZ.includes(bereichWahl)
      ? `Für „${bereichWahl}" ist kein Stundensatz hinterlegt — Preis auf Anfrage.`
      : 'Der angefragte Bereich lässt sich keiner Position der Preisliste zuordnen.');
  }
  if(std === null)     gruende.push('Keine oder unvollständige Uhrzeit — Stunden konnten nicht ermittelt werden.');
  if(anzahl === null)  gruende.push('Keine auswertbare Personenzahl — Mengen sind offen.');
  if(sonntag)          gruende.push('Der Einsatz fällt auf einen Sonntag — Zuschlag ist eingerechnet.');
  gruende.push('Gesetzliche Feiertage prüft der Entwurf nicht. Bitte gegen den Kalender halten.');

  /* Die Positionen. Ohne Stunden oder Menge bleiben sie stehen, aber offen —
     die Disposition trägt dann von Hand ein. */
  const pricing = [];
  const leitPosition = positionen[0] || null;

  if(leitPosition){
    const menge  = (anzahl !== null && std !== null) ? Number((anzahl * std).toFixed(2)) : null;
    const betrag = menge !== null ? Number((menge * leitPosition.satz).toFixed(2)) : 0;
    pricing.push({
      position:  leitPosition.name,
      unit:      'Stunde',
      quantity:  menge,
      unitPrice: leitPosition.satz,
      amount:    betrag,
      note:      menge === null
        ? 'Menge offen — Personenzahl × Stunden eintragen'
        : `${anzahl} Personen × ${std.toFixed(2).replace('.', ',')} Stunden`
    });

    if(nacht > 0 && anzahl !== null){
      const mengeN = Number((anzahl * nacht).toFixed(2));
      pricing.push({
        position:  PREISE.ZUSCHLAEGE.nacht.name,
        unit:      'Stunde',
        quantity:  mengeN,
        unitPrice: Number((leitPosition.satz * PREISE.ZUSCHLAEGE.nacht.anteil).toFixed(2)),
        amount:    Number((mengeN * leitPosition.satz * PREISE.ZUSCHLAEGE.nacht.anteil).toFixed(2)),
        note:      `+${PREISE.ZUSCHLAEGE.nacht.anteil * 100} % auf ${nacht.toFixed(2).replace('.', ',')} Stunden je Person`
      });
    }
    if(sonntag && anzahl !== null && std !== null){
      const mengeS = Number((anzahl * std).toFixed(2));
      pricing.push({
        position:  PREISE.ZUSCHLAEGE.sonntag.name,
        unit:      'Stunde',
        quantity:  mengeS,
        unitPrice: Number((leitPosition.satz * PREISE.ZUSCHLAEGE.sonntag.anteil).toFixed(2)),
        amount:    Number((mengeS * leitPosition.satz * PREISE.ZUSCHLAEGE.sonntag.anteil).toFixed(2)),
        note:      `+${PREISE.ZUSCHLAEGE.sonntag.anteil * 100} % — Einsatz an einem Sonntag`
      });
    }
  }

  /* Die übrigen Positionen der Preisliste stehen als Auswahl darunter, damit
     die Disposition sie nur noch mit einer Menge versehen muss. */
  for(const p of PREISE.POSITIONEN){
    if(leitPosition && p.schluessel === leitPosition.schluessel) continue;
    pricing.push({ position: p.name, unit: 'Stunde', quantity: null,
                   unitPrice: p.satz, amount: 0, note: 'zur Auswahl' });
  }

  const subtotal = Number(pricing.reduce((s, p) => s + (p.amount || 0), 0).toFixed(2));
  const vat      = Number((subtotal * PREISE.UST_SATZ).toFixed(2));
  const total    = Number((subtotal + vat).toFixed(2));

  const gerechnet = subtotal > 0;

  return {
    offerNumber: angebotsnummer(zeit),
    createdAt:   zeit.toISOString(),
    status:      gerechnet ? OFFER_STATUS.REVIEW_REQUIRED : OFFER_STATUS.DRAFT,
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
      costCenter:     text(daten['Kostenstelle'])
    },

    assignment: {
      service:     bereich,
      serviceMenu: bereichWahl,
      date:        text(daten['Datum']),
      timeFrom:    text(daten['Uhrzeit von']),
      timeTo:      text(daten['Uhrzeit bis']),
      hours:       std,
      nightHours:  nacht || 0,
      isSunday:    sonntag,
      location:    text(daten['Ort']),
      headcount:   anzahl,
      description: text(daten['Nachricht'])
    },

    pricing, subtotal, vat, total,

    /* Nie ohne Mensch. Diese beiden Felder sind der Grund, warum der Entwurf
       nur an die Disposition geht. */
    review: { required: true, reasons: gruende }
  };
}

/* --- 2. Das Word-Dokument ------------------------------------------------ */

function absatz(inhalt, opt = {}){
  return new Paragraph({
    alignment: opt.align,
    spacing:   { before: opt.vor || 0, after: opt.nach === undefined ? 60 : opt.nach },
    children: (Array.isArray(inhalt) ? inhalt : [inhalt]).map(t =>
      typeof t === 'string'
        ? new TextRun({ text: t, font: SCHRIFT, size: opt.groesse || 20,
                        bold: opt.fett, color: opt.farbe || FARBE.text,
                        characterSpacing: opt.sperrung })
        : t)
  });
}

function ueberschrift(t){
  return absatz(t.toUpperCase(), { groesse: 16, fett: true, farbe: FARBE.leise,
                                   sperrung: 28, vor: 220, nach: 60 });
}

const OHNE_RAHMEN = {
  top:    { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
  left:   { style: BorderStyle.NONE }, right:  { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE }
};

const LINIE_UNTEN = {
  top:    { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE },
  right:  { style: BorderStyle.NONE },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: FARBE.linie }
};

function zelle(inhalt, opt = {}){
  return new TableCell({
    width:   opt.breite ? { size: opt.breite, type: WidthType.PERCENTAGE } : undefined,
    borders: opt.rahmen || OHNE_RAHMEN,
    shading: opt.grund ? { type: ShadingType.CLEAR, fill: opt.grund } : undefined,
    margins: { top: opt.luft === undefined ? 70 : opt.luft,
               bottom: opt.luft === undefined ? 70 : opt.luft, left: 90, right: 90 },
    verticalAlign: VerticalAlign.CENTER,
    children: Array.isArray(inhalt) ? inhalt : [inhalt]
  });
}

/** Beschriftung links leise, Angabe rechts fett — wie im PDF-Beleg. */
function zeilenTabelle(zeilen){
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: OHNE_RAHMEN,
    rows: zeilen.map(([b, w]) => new TableRow({ children: [
      zelle(absatz(b, { groesse: 18, farbe: FARBE.leise, nach: 0 }),
            { breite: 32, rahmen: LINIE_UNTEN }),
      zelle(absatz(w || '—', { groesse: 20, fett: true, nach: 0 }),
            { breite: 68, rahmen: LINIE_UNTEN })
    ]}))
  });
}

function kopfband(){
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: OHNE_RAHMEN,
    rows: [ new TableRow({ children: [
      zelle(new Paragraph({ children: [ new ImageRun({
              data: LOGO, type: 'png', transformation: { width: 176, height: 67 } }) ] }),
            { breite: 100, grund: FARBE.ink, luft: 260 })
    ]})]
  });
}

/**
 * @param {object} angebot Ergebnis von generateOfferDraft()
 * @returns {Promise<Buffer>} die .docx-Datei
 */
async function baueAngebotDocx(angebot){
  const k = angebot.customer;
  const e = angebot.assignment;
  const teile = [];

  teile.push(kopfband());

  /* Absender rechts, wie auf dem Briefbogen ------------------------------- */
  teile.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: OHNE_RAHMEN,
    rows: [ new TableRow({ children: [
      zelle([absatz('', { nach: 0 })], { breite: 52 }),
      zelle([ABSENDER.firma, ABSENDER.person, ABSENDER.strasse, ABSENDER.ort,
             ABSENDER.telefon, ABSENDER.mail].map((z, i) =>
              absatz(z, { align: AlignmentType.RIGHT, groesse: 18, nach: 0,
                          farbe: i === 0 ? FARBE.text : FARBE.leise })),
            { breite: 48 })
    ]})]
  }));

  /* Angebot an ------------------------------------------------------------ */
  teile.push(absatz('Angebot an', { groesse: 24, fett: true, vor: 320, nach: 100 }));
  const anschrift = [k.company, k.contact, ...(k.address ? k.address.split('\n') : [])]
    .map(text).filter(Boolean);
  for(const z of (anschrift.length ? anschrift : ['—'])){
    teile.push(absatz(z, { groesse: 20, nach: 20 }));
  }

  teile.push(absatz(
    `Angebotsnummer ${angebot.offerNumber}   ·   ${datumHuebsch(angebot.createdAt.slice(0, 10))}`,
    { groesse: 18, farbe: FARBE.leise, vor: 200, nach: 40 }));

  /* Der Hinweis, der dieses Blatt zu einem Entwurf macht ------------------ */
  teile.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: OHNE_RAHMEN,
    rows: [ new TableRow({ children: [ zelle([
      absatz('ENTWURF — NICHT VERSENDEN, BEVOR DIE DISPOSITION GEPRÜFT HAT',
             { groesse: 16, fett: true, sperrung: 20, nach: 40 }),
      ...angebot.review.reasons.map(g => absatz('·  ' + g,
             { groesse: 17, farbe: FARBE.leise, nach: 20 }))
    ], { breite: 100, grund: FARBE.flaeche, luft: 140 }) ]})]
  }));

  /* Einsatz --------------------------------------------------------------- */
  const zeit = e.timeFrom && e.timeTo ? `${e.timeFrom} – ${e.timeTo} Uhr`
             : (e.timeFrom || e.timeTo || '');
  teile.push(ueberschrift('Einsatz'));
  teile.push(zeilenTabelle([
    ['Dienstleistung', e.service],
    ['Datum',          datumHuebsch(e.date)],
    ['Uhrzeit',        zeit],
    ['Einsatzort',     e.location],
    ['Personen',       e.headcount === null ? '' : String(e.headcount)],
    ['Stunden je Person', e.hours === null ? '' : e.hours.toFixed(2).replace('.', ',')]
  ]));

  if(e.description){
    teile.push(ueberschrift('Beschreibung'));
    for(const z of e.description.split('\n')){
      teile.push(absatz(z || ' ', { groesse: 20, nach: 40 }));
    }
  }

  /* Positionen ------------------------------------------------------------ */
  teile.push(ueberschrift('Positionen'));

  /* Vier Spalten statt fünf: die Einheit steht bei der Menge („120,00 Std.").
     Als eigene Spalte drückte sie die Positionsspalte so schmal, dass
     „Ordnungsdienstkraft" mitten im Wort umbrach. */
  const SP = { pos: 52, menge: 16, einzel: 16, summe: 16 };
  const kopf = (t, breite, rechts) =>
    zelle(absatz(t, { groesse: 16, fett: true, sperrung: 20, nach: 0,
                      align: rechts ? AlignmentType.RIGHT : undefined }), { breite });

  const kopfzeile = new TableRow({ children: [
    kopf('POSITION', SP.pos), kopf('MENGE', SP.menge, true),
    kopf('EINZELPREIS', SP.einzel, true), kopf('SUMME', SP.summe, true)
  ]});

  const kurz = { 'Stunde': 'Std.' };
  const posZeilen = angebot.pricing.map(p => new TableRow({ children: [
    zelle([ absatz(p.position, { groesse: 19, fett: true, nach: p.note ? 20 : 0 }),
            ...(p.note ? [absatz(p.note, { groesse: 15, farbe: FARBE.leise, nach: 0 })] : []) ],
          { breite: SP.pos, rahmen: LINIE_UNTEN }),
    zelle(absatz(p.quantity === null ? ''
                 : p.quantity.toFixed(2).replace('.', ',') + ' ' + (kurz[p.unit] || p.unit),
                 { groesse: 19, nach: 0, align: AlignmentType.RIGHT }),
          { breite: SP.menge, rahmen: LINIE_UNTEN }),
    zelle(absatz(euro(p.unitPrice), { groesse: 19, nach: 0, align: AlignmentType.RIGHT }),
          { breite: SP.einzel, rahmen: LINIE_UNTEN }),
    zelle(absatz(p.amount ? euro(p.amount) : '',
                 { groesse: 19, fett: true, nach: 0, align: AlignmentType.RIGHT }),
          { breite: SP.summe, rahmen: LINIE_UNTEN })
  ]}));

  teile.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: OHNE_RAHMEN,
    rows: [kopfzeile, ...posZeilen]
  }));

  /* Summen ---------------------------------------------------------------- */
  const summe = (b, w, fett) => new TableRow({ children: [
    zelle(absatz('', { nach: 0 }), { breite: 58 }),
    zelle(absatz(b, { groesse: 19, nach: 0, farbe: fett ? FARBE.text : FARBE.leise, fett }),
          { breite: 28, rahmen: LINIE_UNTEN }),
    zelle(absatz(w, { groesse: fett ? 22 : 19, fett: true, nach: 0, align: AlignmentType.RIGHT }),
          { breite: 14, rahmen: LINIE_UNTEN })
  ]});

  teile.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: OHNE_RAHMEN,
    rows: [
      summe('Zwischensumme netto', angebot.subtotal ? euro(angebot.subtotal) : ''),
      summe(`zzgl. ${(PREISE.UST_SATZ * 100).toFixed(0)} % Umsatzsteuer`, angebot.vat ? euro(angebot.vat) : ''),
      summe('Gesamt brutto', angebot.total ? euro(angebot.total) : '', true)
    ]
  }));

  /* Rechnungsdaten — nur, wenn welche da sind ----------------------------- */
  const rechnung = [
    ['Rechnungsanschrift', k.billingAddress ? k.billingAddress.replace(/\n/g, ', ') : ''],
    ['USt-IdNr.',          k.vatId],
    ['Bestellnummer',      k.orderNumber],
    ['Kostenstelle',       k.costCenter]
  ].filter(([, w]) => w);
  if(rechnung.length){
    teile.push(ueberschrift('Rechnungsdaten'));
    teile.push(zeilenTabelle(rechnung));
  }

  /* Hinweise -------------------------------------------------------------- */
  teile.push(ueberschrift('Reisekosten & Zuschläge'));
  for(const h of PREISE.HINWEISE.slice(1)){
    teile.push(absatz(h, { groesse: 18, farbe: FARBE.leise, nach: 30 }));
  }
  for(const b of PREISE.OHNE_SATZ){
    teile.push(absatz(`${b}: Preis auf Anfrage — in der Preisliste ist kein Satz hinterlegt.`,
                      { groesse: 18, farbe: FARBE.leise, nach: 30 }));
  }

  const doc = new Document({
    creator: 'HERM Service Team',
    title:   `Angebot ${angebot.offerNumber}`,
    description: 'Automatisch erzeugter Entwurf — Freigabe durch die Disposition erforderlich.',
    styles: { default: { document: { run: { font: SCHRIFT, size: 20, color: FARBE.text } } } },
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 960, right: 960 } } },
      children: teile
    }]
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  generateOfferDraft, baueAngebotDocx, OFFER_STATUS, ABSENDER,
  /* für Tests */ _intern: { stunde, dauer, nachtstunden, istSonntag, euro }
};

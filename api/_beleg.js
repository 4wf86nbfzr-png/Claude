'use strict';

/* ---------------------------------------------------------------------------
   Der Beleg
   ---------------------------------------------------------------------------
   Baut aus den abgeschickten Formularfeldern ein PDF, das man in der Mail
   öffnet und sofort lesen kann — ohne die Website daneben zu haben.

   Zwei Regeln, die den Aufbau bestimmen:

   1. Es geht nichts verloren. Die Gruppen unten ordnen die bekannten Felder;
      alles, was das Formular sonst noch mitschickt, landet unter „Weitere
      Angaben“. Ein neues Feld im Markup erscheint dadurch von selbst im Beleg,
      auch wenn hier niemand nachzieht.
   2. Der Honigtopf und interne Felder tauchen nie auf.

   Die Schrift ist Helvetica — eine der 14 Standardschriften, die jeder
   PDF-Betrachter mitbringt. Sie deckt Umlaute und ß ab (WinAnsi), kostet keine
   eingebettete Datei und macht den Beleg damit klein genug fürs Postfach.
--------------------------------------------------------------------------- */

/* Die Standalone-Fassung von pdfkit, nicht die gewöhnliche.
   ---------------------------------------------------------------------------
   `require('pdfkit')` liest seine Schriftmetriken zur Laufzeit von der Platte:
   `fs.readFileSync(__dirname + '/data/Helvetica.afm')`. Sobald ein Host die
   Funktion bündelt — Netlify, AWS Lambda, fast alle —, zeigt `__dirname`
   woandershin, die Datei fehlt, und der erste Beleg scheitert mit ENOENT.

   Die Standalone-Fassung trägt alle vierzehn Schriften eingebettet und fasst
   kein Dateisystem an. Sie ist mit 2,4 MB grösser, dafür läuft sie überall
   gleich. */
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js');
const crypto = require('crypto');
const LOGO = require('./_logo.js');
/* Als Datei-URL statt als Puffer: die Standalone-Fassung bringt ihren eigenen
   Buffer mit und erkennt einen Node-Buffer nicht als solchen — sie hielte ihn
   für einen Dateipfad. Eine data:-URL versteht jede Fassung. */
const LOGO_URI = 'data:image/png;base64,' + LOGO.toString('base64');


const FARBE = {
  ink:     '#0b0b0c',
  text:    '#17171a',
  leise:   '#6f6f77',
  linie:   '#e3e3e7',
  flaeche: '#f6f6f7'
};

const RAND      = 48;   // Seitenrand
const SPALTE    = 150;  // Breite der Beschriftungsspalte
const KOPFHOEHE = 92;   // dunkles Band auf der ersten Seite

/* Welche Felder gehören zusammen — und in welcher Reihenfolge.
   [Feldname im Formular, Beschriftung im Beleg]                            */
const BAUPLAN = {
  anfrage: {
    art:   'Personalanfrage',
    titel: 'Personalanfrage über die Website',
    lauf:  'ANFRAGE',
    gruppen: [
      { name: 'Unternehmen', felder: [
        ['Firma',           'Firma'],
        ['Name',            'Ansprechpartner'],
        ['E-Mail',          'E-Mail'],
        ['Telefon',         'Telefon'],
        ['Firmenanschrift', 'Firmenanschrift']
      ]},
      { name: 'Einsatz', felder: [
        ['Bereich',      'Dienstleistung'],
        ['Datum',        'Einsatzdatum'],
        ['Uhrzeit von',  'Uhrzeit'],
        ['Ort',          'Einsatzort'],
        ['Personenzahl', 'Personen']
      ]},
      { name: 'Rechnung', freiwillig: true, felder: [
        ['Rechnungsanschrift', 'Rechnungsanschrift'],
        ['USt-IdNr.',          'USt-IdNr.'],
        ['Bestellnummer',      'Bestellnummer'],
        ['Kostenstelle',       'Kostenstelle']
      ]}
    ],
    text: ['Nachricht', 'Nachricht'],
    fuss: 'Diese Anfrage wurde über das Formular auf hermserviceteam.com abgeschickt. '
        + 'Antworten Sie direkt auf diese E-Mail, um den Absender zu erreichen.'
  },
  bewerbung: {
    art:   'Bewerbung',
    titel: 'Bewerbung über die Website',
    lauf:  'BEWERBUNG',
    gruppen: [
      { name: 'Person', felder: [
        ['Name',    'Name'],
        ['Alter',   'Alter'],
        ['E-Mail',  'E-Mail'],
        ['Telefon', 'Telefon']
      ]},
      { name: 'Wunsch', felder: [
        ['Bereich',       'Bereich'],
        ['Umfang',        'Umfang'],
        ['Verfügbarkeit', 'Verfügbar ab / wann']
      ]}
    ],
    text: ['Nachricht', 'Kurz zur Person'],
    fuss: 'Diese Bewerbung wurde über das Formular auf hermserviceteam.com abgeschickt. '
        + 'Antworten Sie direkt auf diese E-Mail, um die Bewerberin oder den Bewerber zu erreichen.'
  }
};

/* Felder, die zur Technik gehören und niemanden im Beleg interessieren.
   „firmenname“ und „webseite“ sind die beiden Honigtöpfe.                  */
const VERSTECKT = new Set([
  'form-name', 'firmenname', 'webseite', 'art', 'zeit', 'Einwilligung',
  // gehen in einer anderen Zeile auf, siehe ZUSAMMEN
  'Bereich (eigene Angabe)', 'Uhrzeit bis',
  // steuert nur die Anzeige des Rechnungsfeldes
  'Rechnungsanschrift abweichend'
]);

/* Felder, die im Beleg nicht so stehen, wie sie im Formular heißen.
   „Uhrzeit von" und „Uhrzeit bis" ergeben eine Zeile, nicht zwei; „Anderer
   Bereich" plus Freitext ebenso. */
const ZUSAMMEN = {
  'Bereich': daten => bereichZusammen(daten),
  'Uhrzeit von': daten => {
    const von = sauber(daten['Uhrzeit von']), bis = sauber(daten['Uhrzeit bis']);
    if(von && bis) return `${von} – ${bis} Uhr`;
    return von || bis ? `${von || bis} Uhr` : '';
  }
};

/* --- Kleinkram ----------------------------------------------------------- */

function sauber(wert){
  if(wert === undefined || wert === null) return '';
  return String(wert)
    .replace(/\r\n?/g, '\n')
    // Steuerzeichen raus, Zeilenumbruch und Tabulator bleiben stehen
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim();
}

/* Ein Datum aus dem <input type="date"> steht als 2026-08-14 in den Daten —
   im Beleg soll 14.08.2026 stehen. Alles andere bleibt, wie es getippt wurde. */
function datumHuebsch(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : wert;
}

function zeitstempel(datum){
  const d = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Berlin'
  }).format(datum);
  return d + ' Uhr';
}

/* Drei Zeichen, die zwei Vorgänge derselben Minute auseinanderhalten.
   ---------------------------------------------------------------------------
   Ohne sie hiessen zwei Anfragen, die im selben Augenblick eintreffen, gleich
   — gleiche Referenz, gleicher Dateiname, gleiche Angebotsnummer. In der
   Disposition wäre das nicht auffällig, sondern still falsch.

   Aus dem Alphabet fehlen I, O, 0 und 1: am Telefon vorgelesen sind sie
   nicht zu unterscheiden. */
const ZEICHEN = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function marke(){
  const roh = crypto.randomBytes(3);
  let m = '';
  for(let i = 0; i < 3; i++) m += ZEICHEN[roh[i] % ZEICHEN.length];
  return m;
}

/* Kurzes Zeichen, das in Mailbetreff, Dateiname und Beleg dasselbe sagt. */
function referenz(art, datum, kennung){
  const t = new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin'
  }).formatToParts(datum).reduce((o, p) => (o[p.type] = p.value, o), {});
  const kuerzel = art === 'bewerbung' ? 'BW' : 'AN';
  return `${kuerzel}-${t.year}${t.month}${t.day}-${t.hour}${t.minute}-${kennung}`;
}

/* Der Kunde im Dateinamen.
   ---------------------------------------------------------------------------
   „Angebot_FR-Event-und-MesseCatering-GmbH_AN-260808-0645-BYT.docx" — dann
   muss in der Disposition niemand umbenennen, und im Postfach ist auf einen
   Blick zu sehen, zu wem die Datei gehört.

   Umlaute werden umschrieben und alles Übrige zu Bindestrichen: ein Dateiname
   wandert durch Mailprogramme, Dateisysteme und Windows-Freigaben, und jedes
   davon stolpert über andere Zeichen. Was hier durchkommt, kommt überall
   durch.                                                                    */
const UMSCHRIFT = { 'Ä':'Ae','Ö':'Oe','Ü':'Ue','ä':'ae','ö':'oe','ü':'ue',
                    'ß':'ss','&':'und','é':'e','è':'e','ê':'e','á':'a','à':'a',
                    'í':'i','ó':'o','ú':'u','ñ':'n','ç':'c' };
function dateiTeil(wert, grenze){
  const roh = sauber(wert).replace(/[ÄÖÜäöüß&éèêáàíóúñç]/g, z => UMSCHRIFT[z] || z);
  const rein = roh.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
                  .replace(/[^A-Za-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '');
  const max = grenze || 48;
  if(rein.length <= max) return rein;
  /* An der Wortgrenze kürzen, sonst steht „…Messebau-Gm" im Dateinamen.
     Nur wenn dabei nicht mehr als ein Drittel verlorengeht. */
  const kurz = rein.slice(0, max);
  const bruch = kurz.lastIndexOf('-');
  return (bruch > max * 0.66 ? kurz.slice(0, bruch) : kurz).replace(/-+$/, '');
}

/* „Anderer Bereich“ plus Freitext ergibt eine Zeile, nicht zwei. */
function bereichZusammen(daten){
  const frei = sauber(daten['Bereich (eigene Angabe)']);
  const wahl = sauber(daten['Bereich']);
  if(!frei) return wahl;
  return wahl && wahl !== 'Anderer Bereich' ? `${frei} (gewählt: ${wahl})` : frei;
}

/* --- Zeichnen ------------------------------------------------------------ */

function kopfband(doc, plan, breite){
  doc.save();
  doc.rect(0, 0, doc.page.width, KOPFHOEHE).fill(FARBE.ink);
  doc.image(LOGO_URI, RAND, 30, { width: 132 });
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').opacity(.72)
     .text(plan.lauf, RAND, 40, { width: breite, align: 'right', characterSpacing: 1.6 });
  doc.opacity(1).restore();
}

function gruppentitel(doc, name, breite){
  doc.font('Helvetica-Bold').fontSize(8).fillColor(FARBE.leise)
     .text(name.toUpperCase(), RAND, doc.y, { width: breite, characterSpacing: 1.4 });
  doc.moveDown(.45);
}

/* Eine Zeile: Beschriftung links, Angabe rechts. Beide können umbrechen,
   die Zeile ist so hoch wie die höhere der beiden Spalten.                  */
function zeile(doc, beschriftung, wert, breite){
  const links  = SPALTE - 14;
  const rechts = breite - SPALTE;
  const y      = doc.y;

  doc.font('Helvetica').fontSize(9.5);
  const hL = doc.heightOfString(beschriftung, { width: links });
  doc.font('Helvetica-Bold').fontSize(10.5);
  const hR = doc.heightOfString(wert, { width: rechts });
  const h  = Math.max(hL, hR);

  seitenwechselWennNoetig(doc, h + 14);

  const oben = doc.y;
  doc.font('Helvetica').fontSize(9.5).fillColor(FARBE.leise)
     .text(beschriftung, RAND, oben + 1, { width: links });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(FARBE.text)
     .text(wert, RAND + SPALTE, oben, { width: rechts });

  doc.y = oben + h + 7;
  doc.save().moveTo(RAND, doc.y).lineTo(RAND + breite, doc.y)
     .lineWidth(.5).strokeColor(FARBE.linie).stroke().restore();
  doc.y += 7;
  return y;
}

/* Der Umbruch von Hand — pdfkit könnte das selbst, gibt aber nicht heraus,
   wo es umgebrochen hat. Genau das wird unten gebraucht: nur wer die Zeilen
   kennt, kann die Fläche hinter dem Text auf jeder Seite passend hoch
   zeichnen und den Text an der richtigen Stelle auf die nächste Seite
   setzen. Leerzeilen zwischen Absätzen bleiben erhalten.                     */
function umbrechen(doc, text, breite){
  const zeilen = [];
  for(const absatz of text.split('\n')){
    if(!absatz.trim()){ zeilen.push(''); continue; }
    let aktuell = '';
    for(let wort of absatz.split(/\s+/)){
      // Eine sehr lange E-Mail-Adresse ohne Leerzeichen wird hart getrennt,
      // sonst liefe sie aus der Fläche heraus.
      while(doc.widthOfString(wort) > breite){
        let n = 1;
        while(n < wort.length && doc.widthOfString(wort.slice(0, n + 1)) <= breite) n++;
        if(aktuell){ zeilen.push(aktuell); aktuell = ''; }
        zeilen.push(wort.slice(0, n));
        wort = wort.slice(n);
      }
      const probe = aktuell ? aktuell + ' ' + wort : wort;
      if(!aktuell || doc.widthOfString(probe) <= breite){ aktuell = probe; }
      else { zeilen.push(aktuell); aktuell = wort; }
    }
    zeilen.push(aktuell);
  }
  return zeilen;
}

/* Ein längerer Text bekommt eine eigene Fläche, damit er nicht mit den
   Stichworten darüber verschwimmt. Passt er nicht auf eine Seite, läuft er
   weiter — die Fläche wird dann auf jeder Seite neu gezeichnet.             */
function textblock(doc, beschriftung, wert, breite){
  const innen = breite - 28;
  doc.font('Helvetica').fontSize(10.5);
  const zh     = doc.currentLineHeight() + 2.5;
  // Zwei Punkt Luft: pdfkit misst beim Setzen eine Spur breiter als
  // widthOfString meldet. Ohne den Abzug hält es eine fertige Zeile für zu
  // lang und bricht sie ein zweites Mal um — die Hälfte landete dann auf der
  // Grundlinie der nächsten Zeile.
  const zeilen = umbrechen(doc, wert, innen - 2);

  // Überschrift und die ersten drei Zeilen bleiben zusammen — eine
  // Überschrift allein am Seitenfuß liest sich wie ein Fehler.
  seitenwechselWennNoetig(doc, 18 + 26 + zh * 3);
  gruppentitel(doc, beschriftung, breite);

  let i = 0;
  while(i < zeilen.length){
    const platz = (doc.page.height - RAND - 34) - doc.y - 26;
    const passt = Math.max(1, Math.floor(platz / zh));
    const teil  = zeilen.slice(i, i + passt);
    const h     = teil.length * zh;
    const oben  = doc.y;

    doc.save().rect(RAND, oben, breite, h + 26).fill(FARBE.flaeche).restore();
    doc.save().rect(RAND, oben, 3, h + 26).fill(FARBE.ink).restore();
    doc.font('Helvetica').fontSize(10.5).fillColor(FARBE.text);
    let y = oben + 13;
    for(const z of teil){
      // Ohne width: die Zeile ist schon umgebrochen, ein zweiter Umbruch
      // würde sie nur zerlegen.
      if(z) doc.text(z, RAND + 16, y, { lineBreak: false });
      y += zh;
    }

    doc.y = oben + h + 26;
    i += teil.length;
    if(i < zeilen.length) doc.addPage();
  }
  doc.y += 18;
}

function seitenwechselWennNoetig(doc, hoehe){
  const unten = doc.page.height - RAND - 34;
  if(doc.y + hoehe > unten) doc.addPage();
}

/* --- Der Beleg ----------------------------------------------------------- */

/**
 * @param {string} art        'anfrage' oder 'bewerbung'
 * @param {object} daten      Feldname → Wert, so wie das Formular sie schickt
 * @param {Date}   eingang    Zeitpunkt des Eingangs
 * @returns {Promise<{pdf:Buffer, referenz:string, dateiname:string, name:string, absender:string}>}
 */
function baueBeleg(art, daten, eingang){
  const plan = BAUPLAN[art] || BAUPLAN.anfrage;
  const zeit = eingang instanceof Date ? eingang : new Date();
  const kennung = marke();
  const ref     = referenz(art, zeit, kennung);

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: RAND, bottom: RAND, left: RAND, right: RAND },
    bufferPages: true,
    info: {
      Title:    `${plan.art} ${ref}`,
      Author:   'HERM Service Team e.K.',
      Subject:  plan.titel,
      Creator:  'hermserviceteam.com',
      Producer: 'hermserviceteam.com'
    }
  });

  const breite = doc.page.width - RAND * 2;
  const teile  = [];
  doc.on('data', d => teile.push(d));

  const fertig = new Promise((los, nix) => {
    doc.on('end', () => los(Buffer.concat(teile)));
    doc.on('error', nix);
  });

  /* Kopf ---------------------------------------------------------------- */
  kopfband(doc, plan, breite);
  doc.y = KOPFHOEHE + 34;

  doc.font('Helvetica-Bold').fontSize(21).fillColor(FARBE.ink)
     .text(plan.titel, RAND, doc.y, { width: breite });
  doc.moveDown(.35);
  doc.font('Helvetica').fontSize(9.5).fillColor(FARBE.leise)
     .text(`Eingang ${zeitstempel(zeit)}   ·   Referenz ${ref}`, { width: breite });
  doc.moveDown(1.1);
  doc.save().moveTo(RAND, doc.y).lineTo(RAND + breite, doc.y)
     .lineWidth(1.2).strokeColor(FARBE.ink).stroke().restore();
  doc.y += 22;

  /* Gruppen ------------------------------------------------------------- */
  const gezeigt = new Set(VERSTECKT);

  for(const gruppe of plan.gruppen){
    const zeilen = [];
    let etwasDrin = false;
    for(const [feld, beschriftung] of gruppe.felder){
      gezeigt.add(feld);
      let wert = ZUSAMMEN[feld] ? ZUSAMMEN[feld](daten) : sauber(daten[feld]);
      if(feld === 'Datum') wert = datumHuebsch(wert);
      if(wert) etwasDrin = true;
      zeilen.push([beschriftung, wert || '—']);
    }
    /* Eine Gruppe, in der nichts steht, ist eine Überschrift mit vier
       Gedankenstrichen darunter. Die Rechnungsdaten sind freiwillig —
       ohne sie soll der Beleg kürzer werden, nicht leerer. */
    if(!etwasDrin && gruppe.freiwillig) continue;
    seitenwechselWennNoetig(doc, 74);
    gruppentitel(doc, gruppe.name, breite);
    for(const [b, w] of zeilen) zeile(doc, b, w, breite);
    doc.y += 12;
  }

  /* Alles, was der Bauplan nicht kennt — damit nichts verloren geht. ----- */
  const rest = Object.keys(daten)
    .filter(k => !gezeigt.has(k) && sauber(daten[k]) && k !== plan.text[0]);
  if(rest.length){
    seitenwechselWennNoetig(doc, 74);
    gruppentitel(doc, 'Weitere Angaben', breite);
    for(const k of rest) zeile(doc, k, sauber(daten[k]), breite);
    doc.y += 12;
  }

  /* Nachricht ----------------------------------------------------------- */
  const nachricht = sauber(daten[plan.text[0]]);
  if(nachricht) textblock(doc, plan.text[1], nachricht, breite);

  /* Einwilligung -------------------------------------------------------- */
  const ok = sauber(daten['Einwilligung']);
  seitenwechselWennNoetig(doc, 58);
  gruppentitel(doc, 'Einwilligung', breite);
  doc.font('Helvetica').fontSize(9.5).fillColor(FARBE.text)
     .text(ok
       ? 'Der Verarbeitung der Angaben zur Bearbeitung dieses Vorgangs wurde beim '
         + `Absenden am ${zeitstempel(zeit)} zugestimmt (Datenschutzerklärung auf hermserviceteam.com).`
       : 'Beim Absenden lag keine Einwilligung vor.',
       RAND, doc.y, { width: breite, lineGap: 2 });
  doc.moveDown(1.2);

  doc.font('Helvetica').fontSize(8.5).fillColor(FARBE.leise)
     .text(plan.fuss, RAND, doc.y, { width: breite, lineGap: 2 });

  /* Fußzeile auf jede Seite --------------------------------------------- */
  const seiten = doc.bufferedPageRange();
  const anzahl = seiten.count;   // vor der Schleife merken, sie darf nicht wachsen
  for(let i = 0; i < anzahl; i++){
    doc.switchToPage(seiten.start + i);
    // Die Fußzeile steht unterhalb des Satzspiegels. Ohne diese Zeile hält
    // pdfkit das für einen Überlauf und hängt für jede Fußzeile eine leere
    // Seite an — der Beleg hatte dadurch dreimal so viele Seiten wie Inhalt.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - RAND + 6;
    doc.save().moveTo(RAND, y - 12).lineTo(RAND + breite, y - 12)
       .lineWidth(.5).strokeColor(FARBE.linie).stroke().restore();
    doc.font('Helvetica').fontSize(7.5).fillColor(FARBE.leise)
       .text('HERM Service Team e.K.  ·  hermserviceteam.com  ·  info@hermserviceteam.com',
             RAND, y, { width: breite, lineBreak: false });
    doc.text(`Seite ${i + 1} von ${seiten.count}`,
             RAND, y, { width: breite, align: 'right', lineBreak: false });
  }
  doc.flushPages();

  doc.end();

  /* Bei einer Anfrage ist die Firma der Anker, bei einer Bewerbung der Name.
     Fehlt beides, bleibt der Dateiname eben ohne — lieber kurz als leer. */
  const kunde = dateiTeil(art === 'bewerbung'
    ? daten['Name']
    : (sauber(daten['Firma']) || daten['Name']));

  return fertig.then(pdf => ({
    pdf,
    referenz:  ref,
    kunde,
    dateiname: [plan.art, kunde, ref].filter(Boolean).join('_') + '.pdf',
    art:       plan.art,
    titel:     plan.titel,
    name:      sauber(daten['Name']),
    absender:  sauber(daten['E-Mail']),
    bereich:   bereichZusammen(daten),
    eingang:   zeitstempel(zeit),
    eingangISO: zeit.toISOString(),
    /* Dieselben drei Zeichen bekommt der Angebotsbogen — daran ist zu sehen,
       dass beide Dateien zum selben Vorgang gehören. */
    marke:     kennung
  }));
}

module.exports = { baueBeleg, BAUPLAN, sauber, dateiTeil };

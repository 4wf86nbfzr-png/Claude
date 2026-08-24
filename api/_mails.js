'use strict';

/* ---------------------------------------------------------------------------
   Die Mails
   ---------------------------------------------------------------------------
   Drei Nachrichten entstehen aus einer Anfrage:

   1. an die Disposition — mit PDF-Beleg und Angebotsentwurf im Anhang
   2. an die Kundin oder den Kunden — eine kurze Eingangsbestätigung
   3. bei einer Bewerbung: an die Disposition, ohne Angebot

   Der Wortlaut steht hier und nirgends sonst. Wer ihn ändert, ändert ihn an
   einer Stelle — und er ist dann in jeder Mail derselbe.
--------------------------------------------------------------------------- */

const t = w => (w === undefined || w === null) ? '' : String(w).trim();
const oder = (w, ersatz) => t(w) || ersatz || '—';

function datumHuebsch(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t(wert));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : t(wert);
}

/* Kopfzeilen dürfen keinen Zeilenumbruch enthalten — sonst ließen sich über
   ein Formularfeld eigene Empfänger einschleusen. */
function kopfsicher(wert){
  return t(wert).replace(/[\r\n]+/g, ' ').slice(0, 160);
}

/* --- 1. Interne Dispositionsmail ----------------------------------------- */

/**
 * @param {object} daten   Formularangaben
 * @param {object} beleg   Rückgabe von baueBeleg()
 * @param {object} angebot Rückgabe von generateOfferDraft() — oder null
 */
function dispositionsMail(daten, beleg, angebot, angebotFehler){
  const firma  = oder(daten['Firma'], oder(daten['Name']));
  const datum  = datumHuebsch(daten['Datum']);
  /* Mehrtaegige Einsaetze stehen als Zeitraum in einer Zeile — die
     Disposition liest hier zuerst, wie lange etwas laeuft. */
  const datumBis = datumHuebsch(daten['Datum bis']);
  const zeitraum = datum && datumBis && datumBis !== datum
    ? `${datum} bis ${datumBis}` : oder(datum);
  const zeitVon = t(daten['Uhrzeit von']), zeitBis = t(daten['Uhrzeit bis']);
  const uhrzeit = zeitVon && zeitBis ? `${zeitVon} – ${zeitBis} Uhr` : oder(zeitVon || zeitBis);

  const bereich = t(daten['Bereich (eigene Angabe)']) || t(daten['Bereich']);

  const zeilen = [
    'Neue Anfrage über die Website',
    '',
    `Eingang ${beleg.eingang}   ·   Referenz ${beleg.referenz}`,
    '',
    'KUNDE',
    `Firmenname:      ${oder(daten['Firma'])}`,
    `Ansprechpartner: ${oder(daten['Name'])}`,
    `Telefon:         ${oder(daten['Telefon'])}`,
    `E-Mail:          ${oder(daten['E-Mail'])}`,
    '',
    'EINSATZ',
    `Dienstleistung:  ${oder(bereich)}`,
    `Datum:           ${zeitraum}`,
    `Uhrzeit:         ${uhrzeit}`,
    `Einsatzort:      ${oder(daten['Ort'])}`,
    `Personalanzahl:  ${oder(daten['Personenzahl'])}`,
    '',
    'BESCHREIBUNG',
    oder(daten['Nachricht']),
    '',
    'FIRMENANSCHRIFT',
    oder(daten['Firmenanschrift']),
    '',
    'RECHNUNGSANSCHRIFT',
    t(daten['Rechnungsanschrift']) || 'wie Firmenanschrift',
    '',
    'ZUSÄTZLICHE ANGABEN',
    `USt-ID:          ${oder(daten['USt-IdNr.'])}`,
    `Bestellnummer:   ${oder(daten['Bestellnummer'])}`,
    `Kostenstelle:    ${oder(daten['Kostenstelle'])}`
  ];

  if(angebot){
    zeilen.push('', 'ANGEBOTSENTWURF',
      `Nummer:          ${angebot.offerNumber}`,
      `Status:          ${angebot.status}`,
      `Gehört zu:       ${beleg.referenz}`,
      '',
      'Der Bogen liegt zweimal im Anhang: als Word-Datei zum Ausfüllen und',
      'als PDF zum Ansehen. Anschrift, Datum, Uhrzeit und Anzahl stehen',
      'drin — Preise bewusst nicht.',
      '',
      'Vor dem Versand:',
      ...angebot.review.reasons.map(g => '  · ' + g),
      '',
      'Er geht NICHT von allein an den Kunden.');
  }

  /* Der Bogen konnte nicht gebaut werden. Das darf nicht still passieren:
     die Anfrage geht trotzdem raus, aber unübersehbar markiert — im Betreff
     und ganz oben im Text, damit es niemand überliest. */
  if(!angebot){
    zeilen.splice(1, 0,
      '',
      '!!! DER ANGEBOTSBOGEN KONNTE NICHT ERZEUGT WERDEN !!!',
      '',
      'Bitte von Hand aus der Vorlage anlegen. Alle Angaben stehen unten',
      'und vollständig im angehängten PDF-Beleg.',
      angebotFehler ? 'Grund: ' + String(angebotFehler).slice(0, 200) : '');
  }

  zeilen.push('', 'Ein „Antworten" auf diese Mail geht direkt an den Absender.');

  return {
    betreff: (angebot ? '' : '[OHNE ANGEBOT] ')
           + `Neue Personalanfrage – ${kopfsicher(firma)} – ${kopfsicher(datum || 'ohne Datum')}`,
    text:    zeilen.join('\n')
  };
}

/* --- 2. Bestätigung an den Kunden ---------------------------------------- */

/* Wortlaut wie abgestimmt. Bitte nur hier ändern. */
const BESTAETIGUNG = [
  'Vielen Dank für Ihre Anfrage.',
  '',
  'Ihre Anfrage wurde erfolgreich an unsere Disposition übermittelt.',
  '',
  'Auf Grundlage Ihrer Angaben wird derzeit ein individuelles Angebot',
  'vorbereitet. Nach interner Prüfung erhalten Sie dieses per E-Mail.',
  '',
  'Bei kurzfristigen Änderungen oder Ergänzungen können Sie uns',
  'selbstverständlich jederzeit kontaktieren.',
  '',
  'Mit freundlichen Grüßen',
  '',
  'Herm Service Team'
].join('\n');

function bestaetigungsMail(daten, beleg){
  return {
    betreff: `Ihre Anfrage bei HERM Service Team [${beleg.referenz}]`,
    text: BESTAETIGUNG + '\n\n'
        + '— — —\n'
        + `Referenz: ${beleg.referenz}\n`
        + 'HERM Service Team e.K.  ·  Gertigstraße 12–14  ·  22303 Hamburg\n'
        + 'Telefon +49 (40) 27075100  ·  Büro Mo–Fr 10–17 Uhr\n'
        + 'info@hermserviceteam.com\n\n'
        + 'Diese Nachricht wurde automatisch versendet, weil über\n'
        + 'hermserviceteam.com eine Anfrage mit dieser Adresse abgeschickt wurde.'
  };
}

/* --- 3. Bewerbung -------------------------------------------------------- */

function bewerbungsMail(daten, beleg){
  return {
    betreff: `Bewerbung: ${kopfsicher(beleg.name)}`
             + (beleg.bereich ? ` — ${kopfsicher(beleg.bereich)}` : '')
             + ` [${beleg.referenz}]`,
    text: [
      'Neue Bewerbung über die Website',
      '',
      `Eingang ${beleg.eingang}   ·   Referenz ${beleg.referenz}`,
      '',
      `Name:          ${oder(daten['Name'])}`,
      `Alter:         ${oder(daten['Alter'])}`,
      `E-Mail:        ${oder(daten['E-Mail'])}`,
      `Telefon:       ${oder(daten['Telefon'])}`,
      `Bereich:       ${oder(beleg.bereich)}`,
      `Umfang:        ${oder(daten['Umfang'])}`,
      `Verfügbarkeit: ${oder(daten['Verfügbarkeit'])}`,
      '',
      'Alle Angaben stehen vollständig im angehängten PDF.',
      '',
      'Ein „Antworten" auf diese Mail geht direkt an die Bewerberin',
      'oder den Bewerber.'
    ].join('\n')
  };
}

/* Eingangsbestaetigung an die Bewerberin oder den Bewerber.
   Wer sich bewirbt, bekam bisher gar nichts zurueck — waehrend ein
   Kunde nach einer Anfrage sofort eine Bestaetigung erhielt. Genau bei
   einer Bewerbung ist die Unsicherheit aber am groessten: „ist das
   ueberhaupt angekommen?"

   Geduzt wird hier, wie auf der ganzen Jobseite. Und es steht nichts
   drin, was nicht schon auf jobs.html steht: dass wir uns die Bewerbung
   ansehen und uns zurueckmelden. */
function bewerbungsBestaetigung(daten, beleg){
  return {
    betreff: `Deine Bewerbung bei HERM Service Team [${beleg.referenz}]`,
    text: [
      'Danke für deine Bewerbung.',
      '',
      'Sie ist bei uns angekommen. Wir schauen sie uns an und melden uns',
      'bei dir zurück, meist innerhalb weniger Tage.',
      '',
      'Zeugnisse und Lebenslauf kannst du später nachreichen, für den',
      'ersten Kontakt brauchen wir sie nicht.',
      '',
      'Wenn du in der Zwischenzeit etwas ergänzen möchtest, antworte',
      'einfach auf diese Mail oder ruf uns an.',
      '',
      'Viele Grüße',
      '',
      'Herm Service Team',
      '',
      '— — —',
      `Referenz: ${beleg.referenz}`,
      'HERM Service Team e.K.  ·  Gertigstraße 12–14  ·  22303 Hamburg',
      'Telefon +49 (40) 27075100  ·  Büro Mo–Fr 10–17 Uhr',
      'info@hermserviceteam.com',
      '',
      'Diese Nachricht wurde automatisch versendet, weil über',
      'hermserviceteam.com eine Bewerbung mit dieser Adresse abgeschickt wurde.'
    ].join('\n')
  };
}

module.exports = { dispositionsMail, bestaetigungsMail, bewerbungsMail,
                   bewerbungsBestaetigung, BESTAETIGUNG, kopfsicher };

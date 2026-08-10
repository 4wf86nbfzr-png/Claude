'use strict';

/* ---------------------------------------------------------------------------
   Der Vorgang
   ---------------------------------------------------------------------------
   Was passiert, wenn ein Formular abgeschickt wurde — unabhängig davon, wer
   die Funktion aufgerufen hat. Vercel reicht `(req, res)` herein, Netlify ein
   `event`-Objekt; beide Hüllen liegen daneben und rufen nur `verarbeite()`.
   Der Ablauf steht dadurch genau einmal da:

     Anfrage kommt an
       → Pflichtangaben serverseitig prüfen
       → ablegen (Haken `speichern()` — heute nur Protokoll, siehe unten)
       → PDF-Beleg bauen                          (_beleg.js)
       → Angebotsentwurf bauen, nur bei Anfragen  (_angebot.js)
       → Word-Datei daraus                        (_angebot.js)
       → eine Mail an die Disposition, beides im Anhang
       → eine Eingangsbestätigung an den Kunden
       → Erfolgsmeldung an die Website

   **Das Angebot geht nie von allein an den Kunden.** Es liegt ausschließlich
   in der Mail an die Disposition, trägt den Status DRAFT oder
   REVIEW_REQUIRED und ist im Dokument selbst als Entwurf ausgewiesen. Die
   Freigabe macht ein Mensch — dafür ist hier bewusst kein Weg vorgesehen.

   Die Website selbst bleibt, was sie ist: statische Dateien ohne Aufbauschritt.
   Diese eine Datei läuft auf dem Server — nur sie kennt die Zugangsdaten des
   Postfachs, und die stehen ausschließlich in den Environment Variables.
   Im Browser landet davon nichts.

   Gebraucht werden (Vercel → Project → Settings → Environment Variables):

     SMTP_HOST     z. B. smtp.ionos.de
     SMTP_PORT     465 (SSL) oder 587 (STARTTLS)
     SMTP_USER     das Postfach, über das versendet wird
     SMTP_PASS     dessen Kennwort
     MAIL_AN       Empfänger der Anfragen, mehrere durch Komma getrennt
     MAIL_BEWERBUNG  Empfänger der Bewerbungen; fehlt sie, gilt MAIL_AN.
                     Hier steht auch das Postfach, das auf der Website nicht
                     auftauchen soll — als Variable bleibt es auf dem Server.
     MAIL_VON      optional; sonst wird SMTP_USER genommen
     MAIL_BESTAETIGUNG   optional; "aus" schaltet die Kundenbestätigung ab

   Fehlt eine der ersten vier, antwortet die Funktion mit 503 — die Website
   fällt dann von selbst auf ihren bisherigen Weg zurück (Netlify-Formular
   bzw. das Mailprogramm des Absenders). Es geht also nie eine Anfrage
   verloren, nur weil die Zugangsdaten noch nicht hinterlegt sind.
--------------------------------------------------------------------------- */

const nodemailer = require('nodemailer');
const { baueBeleg, BAUPLAN, sauber } = require('./_beleg.js');
const { generateOfferDraft, baueAngebotDocx, baueAngebotPdf } = require('./_angebot.js');
const MAILS = require('./_mails.js');

const DOCX_TYP = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';


/* Die Honigtöpfe der beiden Formulare. Steht dort etwas drin, war es kein
   Mensch — wir antworten freundlich und schicken nichts. */
const HONIGTOPF = ['firmenname', 'webseite'];

function istMail(wert){
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(wert || '').trim());
}

/* Der Haken für eine spätere Ablage.
   ---------------------------------------------------------------------------
   Im Ablauf steht „Anfrage wird gespeichert". Gespeichert wird heute nichts:
   die Website hat keine Datenbank, und eine Funktion auf Vercel hat kein
   Dateisystem, das den Aufruf überlebt. Bewusst so — ohne Datenbank gibt es
   auch keinen Ort, an dem personenbezogene Daten liegen bleiben.

   Wenn eine Ablage dazukommt (Postgres, Airtable, ein Warenwirtschafts-
   system), gehört sie genau hierher. Der Rest der Funktion muss dafür nicht
   angefasst werden: sie bekommt den fertigen Vorgang und meldet nur, ob es
   geklappt hat. Ein Fehler beim Ablegen darf die Mail nicht verhindern —
   deshalb wird hier nie geworfen.

   @param {object} vorgang  { art, daten, beleg, angebot }
   @returns {Promise<{abgelegt:boolean, id:string|null}>}                     */
async function speichern(vorgang){
  console.log('[Vorgang]', JSON.stringify({
    art:      vorgang.art,
    referenz: vorgang.beleg.referenz,
    angebot:  vorgang.angebot ? vorgang.angebot.offerNumber : null,
    status:   vorgang.angebot ? vorgang.angebot.status : null
  }));
  return { abgelegt: false, id: null };
}

/* --- Der Angebotsbogen, abgesichert --------------------------------------
   Bei einer Anfrage muss der Bogen im Anhang liegen — und zwar der zu dieser
   Anfrage. Drei Sicherungen sorgen dafür:

   1. **Stimmigkeit.** Nach dem Bauen wird geprüft, ob im Datensatz wirklich
      die Angaben dieser Anfrage stehen. Ein Bogen mit fremden Daten wäre der
      schlimmste Fehler von allen: er sähe richtig aus.
   2. **Format und Umfang.** Eine Word-Datei fängt mit „PK" an, ein PDF mit
      „%PDF". Ein abgeschnittener Puffer fällt hier auf, nicht erst beim
      Öffnen in der Disposition.
   3. **Zweiter Versuch.** Schlägt einer der beiden Punkte fehl, wird alles
      noch einmal gebaut. Erst wenn auch das misslingt, geht die Anfrage ohne
      Bogen raus — dann aber mit „[OHNE ANGEBOT]" im Betreff und einer
      Anweisung im Text. Still fehlen darf er nie.                          */

function stimmig(angebot, daten){
  const gleich = (a, b) => sauber(a) === sauber(b);
  if(!angebot || !angebot.offerNumber) return 'kein Datensatz';
  if(!gleich(angebot.customer.contact, daten['Name']))    return 'Ansprechpartner weicht ab';
  if(!gleich(angebot.customer.company, daten['Firma']))   return 'Firma weicht ab';
  if(!gleich(angebot.customer.email,   daten['E-Mail']))  return 'E-Mail weicht ab';
  if(!gleich(angebot.assignment.date,  daten['Datum']))   return 'Einsatzdatum weicht ab';
  if(!gleich(angebot.assignment.dateTo, daten['Datum bis'])) return 'Einsatzende weicht ab';
  return null;
}

function dateiGeprueft(puffer, magie, name){
  if(!Buffer.isBuffer(puffer))        return `${name}: kein Puffer`;
  if(puffer.length < 5000)            return `${name}: nur ${puffer.length} Bytes`;
  if(puffer.slice(0, magie.length).toString('latin1') !== magie)
                                      return `${name}: falsches Format`;
  return null;
}

async function angebotBauen(daten, beleg){
  let letzter = null;
  for(let versuch = 1; versuch <= 2; versuch++){
    try {
      const angebot = generateOfferDraft(daten, new Date(beleg.eingangISO), beleg.marke);
      const abweichung = stimmig(angebot, daten);
      if(abweichung) throw new Error('Datensatz unstimmig — ' + abweichung);

      const docx = await baueAngebotDocx(angebot);
      /* Derselbe Bogen zusätzlich als PDF. Die Word-Datei ist zum Ausfüllen
         da, das PDF zum Ansehen — auf dem Telefon setzt die Vorschau ein
         Word-Dokument nicht so, wie Word es setzt. */
      const pdf  = await baueAngebotPdf(angebot);

      const schlecht = dateiGeprueft(docx, 'PK', 'Word-Datei')
                    || dateiGeprueft(pdf,  '%PDF', 'PDF');
      if(schlecht) throw new Error(schlecht);

      return { angebot, docx, pdf, fehler: null };
    } catch(e){
      letzter = (e && e.message) || String(e);
      console.error(`Angebotsbogen, Versuch ${versuch} fehlgeschlagen:`, letzter);
    }
  }
  return { angebot: null, docx: null, pdf: null, fehler: letzter };
}

/**
 * Der ganze Vorgang, ohne jede Kenntnis davon, wer ihn aufgerufen hat.
 *
 * Genau das ist der Zweck: Vercel reicht `(req, res)` herein, Netlify ein
 * `event`-Objekt, ein lokaler Probelauf einen schlichten Aufruf. Alle drei
 * landen hier, und der Ablauf steht nur einmal da.
 *
 * @param {object} daten  Feldname → Wert, so wie das Formular sie schickt
 * @returns {Promise<{code:number, rumpf:object}>}
 */
async function verarbeite(daten){
  const json = (code, rumpf) => ({ code, rumpf });

  /* Maschine? Dann still abnicken — ein sichtbarer Fehler wäre nur eine
     Rückmeldung, an der sich der nächste Versuch ausrichtet. */
  for(const topf of HONIGTOPF){
    if(sauber(daten[topf])) return json(200, { ok: true });
  }

  const art = BAUPLAN[daten.art] ? daten.art
            : (daten['form-name'] === 'bewerbung' ? 'bewerbung' : 'anfrage');

  /* Das Nötigste prüfen wir hier noch einmal — der Browser tut es bereits,
     aber diese Adresse ist auch ohne Browser erreichbar. */
  if(!sauber(daten['Name']) || !istMail(daten['E-Mail']) || !sauber(daten['Nachricht'])){
    return json(400, { ok: false, grund: 'Pflichtangaben fehlen' });
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  /* Wer bekommt was.
     ------------------------------------------------------------------------
     Anfragen gehen an MAIL_AN. Bewerbungen gehen an MAIL_BEWERBUNG — dort
     dürfen mehrere Adressen stehen, durch Komma getrennt, und sie bekommen
     alle dieselbe Mail mit demselben Anhang.

     Der Grund für die zweite Variable: die Bewerbungen sollen zusätzlich an
     ein Postfach gehen, das auf der Website nicht auftauchen soll. Als
     Environment Variable steht die Adresse nur auf dem Server — im Browser
     landet davon nichts. Deshalb gehört sie hierher und nicht ins Markup.

     Ist MAIL_BEWERBUNG nicht gesetzt, gilt MAIL_AN. Ein vergessener Eintrag
     führt so nie dazu, dass eine Bewerbung nirgends ankommt.               */
  const an = art === 'bewerbung'
    ? (process.env.MAIL_BEWERBUNG || process.env.MAIL_AN)
    : process.env.MAIL_AN;

  if(!host || !user || !pass || !an){
    // Kein Postfach hinterlegt: die Website nimmt ihren bisherigen Weg.
    return json(503, { ok: false, grund: 'Versand noch nicht eingerichtet' });
  }

  /* --- Beleg, Entwurf, Word-Datei ---------------------------------------- */
  let beleg, angebot = null, docx = null, angebotPdf = null;
  try { beleg = await baueBeleg(art, daten, new Date()); }
  catch(e){
    console.error('Beleg konnte nicht gebaut werden:', e);
    return json(500, { ok: false, grund: 'Beleg fehlgeschlagen' });
  }

  let angebotFehler = null;
  if(art === 'anfrage'){
    const versuch = await angebotBauen(daten, beleg);
    angebot = versuch.angebot; docx = versuch.docx; angebotPdf = versuch.pdf;
    angebotFehler = versuch.fehler;
  }

  try { await speichern({ art, daten, beleg, angebot }); }
  catch(e){ console.error('Ablage fehlgeschlagen:', e && e.message); }

  /* --- Postausgang -------------------------------------------------------- */
  const port  = Number(process.env.SMTP_PORT || 465);
  const kanal = nodemailer.createTransport({
    host, port,
    secure: port === 465,          // 465 spricht von Anfang an verschlüsselt
    requireTLS: port !== 465,      // 587 muss auf STARTTLS umschalten
    auth: { user, pass },
    /* Eine Verbindung für beide Mails.
       ------------------------------------------------------------------
       Der teure Teil beim Mailversand ist der Verbindungsaufbau, nicht die
       Nachricht. Ohne Bündelung baut die zweite Mail alles noch einmal auf —
       zusammen kann das über zehn Sekunden dauern, und genau da schneidet
       Netlify eine Funktion ab. Der Absender sähe dann eine Fehlermeldung,
       obwohl die Anfrage längst in der Disposition liegt, und schickte sie
       vermutlich ein zweites Mal. */
    pool: true, maxConnections: 1, maxMessages: 10,

    /* Zeitgrenzen. Ohne sie bleibt ein Postfach, das die Verbindung annimmt
       aber nicht antwortet, so lange stehen, bis die Funktion abgeschnitten
       wird — der Absender sähe dann minutenlang „Wird gesendet …“ und nie
       eine Rückmeldung. Mit ihnen kommt nach wenigen Sekunden ein sauberer
       Fehler samt Telefonnummer und Mail-Ersatzweg.

       Die Summe muss unter zehn Sekunden bleiben; das ist die Grenze auf
       Netlify. */
    connectionTimeout: 6000,
    greetingTimeout:   5000,
    socketTimeout:     7000
  });

  const von = process.env.MAIL_VON || user;
  const empfaenger = an.split(',').map(a => a.trim()).filter(Boolean);

  const post = art === 'bewerbung'
    ? MAILS.bewerbungsMail(daten, beleg)
    : MAILS.dispositionsMail(daten, beleg, angebot, angebotFehler);

  const anhaenge = [{
    filename: beleg.dateiname, content: beleg.pdf, contentType: 'application/pdf'
  }];
  /* Derselbe Kundenteil wie im Beleg — beide Dateien stehen im Postfach
     nebeneinander und sind auf einen Blick als zusammengehörig zu erkennen. */
  const angebotName = angebot
    ? ['Angebot', beleg.kunde, angebot.offerNumber].filter(Boolean).join('_')
    : null;

  if(angebot && docx){
    anhaenge.push({
      filename:    `${angebotName}.docx`,
      content:     docx,
      contentType: DOCX_TYP
    });
  }
  if(angebot && angebotPdf){
    anhaenge.push({
      filename:    `${angebotName}.pdf`,
      content:     angebotPdf,
      contentType: 'application/pdf'
    });
  }

  /* 1. an die Disposition. Klappt das nicht, ist der Vorgang gescheitert —
        die Website meldet es und bietet den Mail-Ersatzweg an. */
  try {
    await kanal.sendMail({
      from:    `"HERM Service Team — Website" <${von}>`,
      to:      empfaenger,
      replyTo: beleg.absender
        ? `"${MAILS.kopfsicher(beleg.name)}" <${beleg.absender}>` : undefined,
      subject: post.betreff,
      text:    post.text,
      attachments: anhaenge
    });
  } catch(e){
    console.error('Versand an die Disposition fehlgeschlagen:', e && e.message);
    kanal.close();
    return json(502, { ok: false, grund: 'Versand fehlgeschlagen' });
  }

  /* 2. Eingangsbestätigung an den Kunden. Absichtlich danach und absichtlich
        ohne Abbruch: die Anfrage liegt zu diesem Zeitpunkt bereits in der
        Disposition. Wenn die Bestätigung scheitert, ist das ärgerlich, aber
        kein Grund, dem Absender „hat nicht geklappt" zu melden und ihn die
        Anfrage ein zweites Mal schicken zu lassen. */
  let bestaetigt = false;
  if(art === 'anfrage' && beleg.absender && process.env.MAIL_BESTAETIGUNG !== 'aus'){
    const b = MAILS.bestaetigungsMail(daten, beleg);
    try {
      await kanal.sendMail({
        from:    `"HERM Service Team" <${von}>`,
        to:      beleg.absender,
        replyTo: empfaenger[0],
        subject: b.betreff,
        text:    b.text
      });
      bestaetigt = true;
    } catch(e){
      console.error('Eingangsbestätigung fehlgeschlagen:', e && e.message);
    }
  }

  /* Eine gebündelte Verbindung bleibt offen und hielte die Funktion am
     Leben, bis der Host sie abschneidet. */
  kanal.close();

  return json(200, {
    ok: true,
    referenz:  beleg.referenz,
    angebot:   angebot ? angebot.offerNumber : null,
    status:    angebot ? angebot.status : null,
    bestaetigt
  });
}

module.exports = { verarbeite };

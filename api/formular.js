'use strict';

/* ---------------------------------------------------------------------------
   Die Formularfunktion
   ---------------------------------------------------------------------------
   Nimmt entgegen, was auf kontakt.html oder jobs.html abgeschickt wurde, und
   führt daraus den ganzen Vorgang aus:

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
     MAIL_AN       Empfänger der Belege, mehrere durch Komma getrennt
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

const GRENZE = 64 * 1024;   // mehr als 64 KB tippt niemand in ein Formular

/* Die Honigtöpfe der beiden Formulare. Steht dort etwas drin, war es kein
   Mensch — wir antworten freundlich und schicken nichts. */
const HONIGTOPF = ['firmenname', 'webseite'];

function json(res, code, rumpf){
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(rumpf));
}

function stromLesen(req){
  return new Promise((los, nix) => {
    let text = '', zuviel = false;
    req.setEncoding('utf8');
    req.on('data', s => {
      if(zuviel) return;
      text += s;
      if(text.length > GRENZE){ zuviel = true; text = ''; }
    });
    req.on('end', () => los(zuviel ? null : text));
    req.on('error', nix);
  });
}

/* Vercel liest den Rumpf selbst und legt ihn unter req.body ab — je nach
   Content-Type als Objekt, als Zeichenkette oder als Buffer. Der Stream ist
   dann bereits leer, ein zweites Lesen ergäbe nichts. Andere Umgebungen
   (und der lokale Probelauf) setzen req.body gar nicht; dort wird gelesen. */
async function rumpfLesen(req){
  let roh = req.body;

  if(roh && typeof roh === 'object' && !Buffer.isBuffer(roh)) return roh;
  if(Buffer.isBuffer(roh)) roh = roh.toString('utf8');
  if(typeof roh !== 'string') roh = await stromLesen(req);

  if(roh === null) throw new Error('zu gross');
  if(!roh) return {};

  const typ = String(req.headers['content-type'] || '');
  if(typ.includes('application/json') || /^\s*\{/.test(roh)){
    try { return JSON.parse(roh); } catch(e){ return {}; }
  }

  const daten = {};
  for(const [k, v] of new URLSearchParams(roh)) daten[k] = v;
  return daten;
}

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

module.exports = async function (req, res){
  if(req.method === 'OPTIONS'){ res.statusCode = 204; return res.end(); }
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, grund: 'nur POST' });
  }

  let daten;
  try { daten = await rumpfLesen(req); }
  catch(e){ return json(res, 413, { ok: false, grund: 'zu viele Daten' }); }

  /* Maschine? Dann still abnicken — ein sichtbarer Fehler wäre nur eine
     Rückmeldung, an der sich der nächste Versuch ausrichtet. */
  for(const topf of HONIGTOPF){
    if(sauber(daten[topf])) return json(res, 200, { ok: true });
  }

  const art = BAUPLAN[daten.art] ? daten.art
            : (daten['form-name'] === 'bewerbung' ? 'bewerbung' : 'anfrage');

  /* Das Nötigste prüfen wir hier noch einmal — der Browser tut es bereits,
     aber diese Adresse ist auch ohne Browser erreichbar. */
  if(!sauber(daten['Name']) || !istMail(daten['E-Mail']) || !sauber(daten['Nachricht'])){
    return json(res, 400, { ok: false, grund: 'Pflichtangaben fehlen' });
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const an   = process.env.MAIL_AN;
  if(!host || !user || !pass || !an){
    // Kein Postfach hinterlegt: die Website nimmt ihren bisherigen Weg.
    return json(res, 503, { ok: false, grund: 'Versand noch nicht eingerichtet' });
  }

  /* --- Beleg, Entwurf, Word-Datei ---------------------------------------- */
  let beleg, angebot = null, docx = null, angebotPdf = null;
  try { beleg = await baueBeleg(art, daten, new Date()); }
  catch(e){
    console.error('Beleg konnte nicht gebaut werden:', e);
    return json(res, 500, { ok: false, grund: 'Beleg fehlgeschlagen' });
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
    /* Zeitgrenzen. Ohne sie bleibt ein Postfach, das die Verbindung annimmt
       aber nicht antwortet, so lange stehen, bis die Funktion abgeschnitten
       wird — der Absender sähe dann minutenlang „Wird gesendet …“ und nie
       eine Rückmeldung. Mit ihnen kommt nach wenigen Sekunden ein sauberer
       Fehler samt Telefonnummer und Mail-Ersatzweg. */
    connectionTimeout: 8000,
    greetingTimeout:   6000,
    socketTimeout:    12000
  });

  const von = process.env.MAIL_VON || user;

  const post = art === 'bewerbung'
    ? MAILS.bewerbungsMail(daten, beleg)
    : MAILS.dispositionsMail(daten, beleg, angebot, angebotFehler);

  const anhaenge = [{
    filename: beleg.dateiname, content: beleg.pdf, contentType: 'application/pdf'
  }];
  if(angebot && docx){
    anhaenge.push({
      filename:    `Angebot-Entwurf-${angebot.offerNumber}.docx`,
      content:     docx,
      contentType: DOCX_TYP
    });
  }
  if(angebot && angebotPdf){
    anhaenge.push({
      filename:    `Angebot-Entwurf-${angebot.offerNumber}.pdf`,
      content:     angebotPdf,
      contentType: 'application/pdf'
    });
  }

  /* 1. an die Disposition. Klappt das nicht, ist der Vorgang gescheitert —
        die Website meldet es und bietet den Mail-Ersatzweg an. */
  try {
    await kanal.sendMail({
      from:    `"HERM Service Team — Website" <${von}>`,
      to:      an.split(',').map(s => s.trim()).filter(Boolean),
      replyTo: beleg.absender
        ? `"${MAILS.kopfsicher(beleg.name)}" <${beleg.absender}>` : undefined,
      subject: post.betreff,
      text:    post.text,
      attachments: anhaenge
    });
  } catch(e){
    console.error('Versand an die Disposition fehlgeschlagen:', e && e.message);
    return json(res, 502, { ok: false, grund: 'Versand fehlgeschlagen' });
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
        replyTo: an.split(',')[0].trim(),
        subject: b.betreff,
        text:    b.text
      });
      bestaetigt = true;
    } catch(e){
      console.error('Eingangsbestätigung fehlgeschlagen:', e && e.message);
    }
  }

  return json(res, 200, {
    ok: true,
    referenz:  beleg.referenz,
    angebot:   angebot ? angebot.offerNumber : null,
    status:    angebot ? angebot.status : null,
    bestaetigt
  });
};

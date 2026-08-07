'use strict';

/* ---------------------------------------------------------------------------
   Die Formularfunktion
   ---------------------------------------------------------------------------
   Nimmt entgegen, was auf kontakt.html oder jobs.html abgeschickt wurde, baut
   daraus den PDF-Beleg und schickt ihn per Mail weiter.

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

   Fehlt eine davon, antwortet die Funktion mit 503 — die Website fällt dann
   von selbst auf ihren bisherigen Weg zurück (Netlify-Formular bzw. das
   Mailprogramm des Absenders). Es geht also nie eine Anfrage verloren, nur
   weil die Zugangsdaten noch nicht hinterlegt sind.
--------------------------------------------------------------------------- */

const nodemailer = require('nodemailer');
const { baueBeleg, BAUPLAN, sauber } = require('./_beleg.js');

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

/* Kopfzeilen einer Mail dürfen keinen Zeilenumbruch enthalten — sonst könnte
   jemand über das Namensfeld eigene Empfänger einschleusen. */
function kopfsicher(wert){
  return sauber(wert).replace(/[\r\n]+/g, ' ').slice(0, 160);
}

function istMail(wert){
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(wert || '').trim());
}

/* Der Text der Mail. Das PDF hängt daran; wer nur die Vorschau im Postfach
   sieht, soll trotzdem schon wissen, worum es geht. */
function mailtext(beleg, daten){
  const zeilen = [
    `${beleg.titel}`,
    `Eingang ${beleg.eingang}   ·   Referenz ${beleg.referenz}`,
    '',
    `Name:    ${beleg.name || '—'}`,
    `E-Mail:  ${beleg.absender || '—'}`,
    `Telefon: ${sauber(daten['Telefon']) || '—'}`,
    `Bereich: ${beleg.bereich || '—'}`,
    '',
    'Alle Angaben stehen vollständig im angehängten PDF.',
    '',
    beleg.absender
      ? 'Ein „Antworten“ auf diese Mail geht direkt an die Absenderin oder den Absender.'
      : 'Es wurde keine Antwortadresse angegeben.'
  ];
  return zeilen.join('\n');
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

  let beleg;
  try { beleg = await baueBeleg(art, daten, new Date()); }
  catch(e){
    console.error('Beleg konnte nicht gebaut werden:', e);
    return json(res, 500, { ok: false, grund: 'Beleg fehlgeschlagen' });
  }

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

  try {
    await kanal.sendMail({
      from:     `"HERM Service Team — Website" <${von}>`,
      to:       an.split(',').map(s => s.trim()).filter(Boolean),
      replyTo:  beleg.absender ? `"${kopfsicher(beleg.name)}" <${beleg.absender}>` : undefined,
      subject:  `${beleg.art}: ${kopfsicher(beleg.name)}`
                + (beleg.bereich ? ` — ${kopfsicher(beleg.bereich)}` : '')
                + ` [${beleg.referenz}]`,
      text:     mailtext(beleg, daten),
      attachments: [{
        filename:    beleg.dateiname,
        content:     beleg.pdf,
        contentType: 'application/pdf'
      }]
    });
  } catch(e){
    console.error('Versand fehlgeschlagen:', e && e.message);
    return json(res, 502, { ok: false, grund: 'Versand fehlgeschlagen' });
  }

  return json(res, 200, { ok: true, referenz: beleg.referenz });
};

'use strict';

/* ---------------------------------------------------------------------------
   Die Formularfunktion — Hülle für Vercel
   ---------------------------------------------------------------------------
   Liest den Rumpf aus der Anfrage und reicht ihn an `verarbeite()` weiter.
   Was dann geschieht — Beleg, Angebotsbogen, zwei Mails — steht in
   `api/_vorgang.js` und ist von Vercel unabhängig. Für Netlify liegt daneben
   `netlify/functions/formular.js`; sie tut dasselbe in deren Sprache.

   Gebraucht werden (Vercel → Project → Settings → Environment Variables,
   auf Netlify: Site configuration → Environment variables):

     SMTP_HOST     z. B. smtp.ionos.de
     SMTP_PORT     465 (SSL) oder 587 (STARTTLS)
     SMTP_USER     das Postfach, über das versendet wird
     SMTP_PASS     dessen Kennwort
     MAIL_AN       Empfänger der Belege, mehrere durch Komma getrennt
     MAIL_VON      optional; sonst wird SMTP_USER genommen
     MAIL_BESTAETIGUNG   optional; "aus" schaltet die Eingangsbestätigung ab
                         (Anfrage wie Bewerbung)

   Fehlt eine der ersten vier, antwortet die Funktion mit 503 — die Website
   fällt dann von selbst auf ihren bisherigen Weg zurück. Es geht also nie
   eine Anfrage verloren, nur weil die Zugangsdaten noch nicht da sind.
--------------------------------------------------------------------------- */

const { verarbeite } = require('./_vorgang.js');

const GRENZE = 64 * 1024;   // mehr als 64 KB tippt niemand in ein Formular

function antwort(res, code, rumpf){
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

module.exports = async function (req, res){
  if(req.method === 'OPTIONS'){ res.statusCode = 204; return res.end(); }
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return antwort(res, 405, { ok: false, grund: 'nur POST' });
  }

  let daten;
  try { daten = await rumpfLesen(req); }
  catch(e){ return antwort(res, 413, { ok: false, grund: 'zu viele Daten' }); }

  const { code, rumpf } = await verarbeite(daten);
  return antwort(res, code, rumpf);
};

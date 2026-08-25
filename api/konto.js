'use strict';

/* ---------------------------------------------------------------------------
   Der Bestandskundenbereich — Hülle für Vercel
   ---------------------------------------------------------------------------
   Genau wie `formular.js`: liest den Rumpf, reicht ihn an den Kern weiter,
   schreibt die Antwort. Was dazwischen passiert, steht in
   `api/_kundenbereich.js` und weiss von Vercel nichts.

   Gebraucht werden zusätzlich zu den SMTP-Angaben aus `formular.js`:

     DATABASE_URL       postgres://…?sslmode=require
     ANFRAGE_MAIL_AN    Empfänger der Bestandskunden-Anfragen
                        (fehlt sie, gilt MAIL_AN)
     WEBAUTHN_RP_ID     die Domain ohne Schema, z. B. hermserviceteam.com
     WEBAUTHN_ORIGIN    https://hermserviceteam.com
                        (mehrere durch Komma, falls www und ohne www)

   Fehlt DATABASE_URL, antwortet der Endpunkt mit 503 und die Website blendet
   den Bereich gar nicht erst ein — es gibt also nie einen Knopf, hinter dem
   nichts ist.
--------------------------------------------------------------------------- */

const { verarbeite } = require('./_kundenbereich.js');

const GRENZE = 256 * 1024;   /* eine Anfrage mit sechzig Positionen bleibt
                                deutlich darunter */

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

async function rumpfLesen(req){
  let roh = req.body;
  if(roh && typeof roh === 'object' && !Buffer.isBuffer(roh)) return roh;
  if(Buffer.isBuffer(roh)) roh = roh.toString('utf8');
  if(typeof roh !== 'string') roh = await stromLesen(req);
  if(roh === null) throw new Error('zu gross');
  if(!roh) return {};
  try { return JSON.parse(roh); } catch(e){ return {}; }
}

/** Woher die Seite kommt. Für WebAuthn und für die Herkunftsprüfung. Hinter
 *  dem Netz von Vercel steht das Schema in `x-forwarded-proto`. */
function herkunftAus(req){
  const k = req.headers || {};
  const host = String(k['x-forwarded-host'] || k.host || '');
  const schema = String(k['x-forwarded-proto'] || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'));
  return host ? `${schema}://${host}` : '';
}

module.exports = async function (req, res){
  if(req.method === 'OPTIONS'){ res.statusCode = 405; return res.end(); }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  /* Der Bereich ist nichts, was in einem fremden Rahmen stehen darf. */
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');

  if(req.method !== 'POST'){
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end(JSON.stringify({ ok: false, grund: 'nur POST' }));
  }

  let daten;
  try { daten = await rumpfLesen(req); }
  catch(e){
    res.statusCode = 413;
    return res.end(JSON.stringify({ ok: false, grund: 'zu viele Daten' }));
  }

  let ergebnis;
  try {
    ergebnis = await verarbeite({
      methode: req.method,
      daten,
      kopf: req.headers || {},
      herkunft: herkunftAus(req)
    });
  } catch(fehler){
    /* Was schiefging, steht im Protokoll des Servers — nicht in der Antwort.
       Eine Datenbankmeldung im Browser verrät Tabellennamen und Aufbau. */
    console.error('Kundenbereich:', fehler && fehler.message);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false,
      grund: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es noch einmal.' }));
  }

  /* Alle Kekse in EINEM Aufruf: `setHeader` überschreibt, ein zweiter Aufruf
     hätte den ersten still verworfen. */
  if((ergebnis.kekse || []).length) res.setHeader('Set-Cookie', ergebnis.kekse);
  res.statusCode = ergebnis.code;
  return res.end(JSON.stringify(ergebnis.rumpf));
};

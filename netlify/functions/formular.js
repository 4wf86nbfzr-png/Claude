'use strict';

/* ---------------------------------------------------------------------------
   Die Formularfunktion — Hülle für Netlify
   ---------------------------------------------------------------------------
   Dasselbe wie `api/formular.js`, nur in Netlifys Sprache. Netlify reicht ein
   `event`-Objekt herein und erwartet `{ statusCode, headers, body }` zurück;
   Vercel reicht `(req, res)`. Was dazwischen passiert — Beleg, Angebotsbogen,
   zwei Mails — steht in `api/_vorgang.js` und kennt weder den einen noch den
   anderen.

   Erreichbar ist die Funktion unter `/.netlify/functions/formular`. Damit die
   Website weiter `/api/formular` aufrufen kann, leitet `netlify.toml` die
   Adresse dorthin um — im Browser ändert sich dadurch nichts.

   Die Zugangsdaten stehen unter
   Site configuration → Environment variables (dieselben Namen wie bei Vercel).
--------------------------------------------------------------------------- */

const { verarbeite } = require('../../api/_vorgang.js');

const GRENZE = 64 * 1024;   // mehr als 64 KB tippt niemand in ein Formular

function antwort(code, rumpf){
  return {
    statusCode: code,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(rumpf)
  };
}

/* Netlify liefert den Rumpf immer als Zeichenkette; bei einem Formular
   url-kodiert, bei fetch mit JSON als JSON. Binär kommt er base64-kodiert,
   dann sagt `isBase64Encoded` Bescheid. */
function rumpfLesen(event){
  let roh = event.body || '';
  if(event.isBase64Encoded) roh = Buffer.from(roh, 'base64').toString('utf8');
  if(roh.length > GRENZE) throw new Error('zu gross');
  if(!roh) return {};

  const kopf = event.headers || {};
  const typ  = String(kopf['content-type'] || kopf['Content-Type'] || '');
  if(typ.includes('application/json') || /^\s*\{/.test(roh)){
    try { return JSON.parse(roh); } catch(e){ return {}; }
  }

  const daten = {};
  for(const [k, v] of new URLSearchParams(roh)) daten[k] = v;
  return daten;
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if(event.httpMethod !== 'POST'){
    return { ...antwort(405, { ok: false, grund: 'nur POST' }),
             headers: { 'Content-Type': 'application/json; charset=utf-8',
                        'Cache-Control': 'no-store', 'Allow': 'POST' } };
  }

  let daten;
  try { daten = rumpfLesen(event); }
  catch(e){ return antwort(413, { ok: false, grund: 'zu viele Daten' }); }

  const { code, rumpf } = await verarbeite(daten);
  return antwort(code, rumpf);
};

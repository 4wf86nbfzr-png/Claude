'use strict';

/* ---------------------------------------------------------------------------
   Der Bestandskundenbereich — Hülle für Netlify
   ---------------------------------------------------------------------------
   ACHTUNG: Diese Datei wird nicht so ausgeliefert, wie sie hier steht.
   `tools/paket-bauen.sh` bündelt sie samt aller Abhängigkeiten zu einer
   einzigen Datei unter netlify/functions/konto.js.

   Dasselbe wie `api/konto.js`, nur in Netlifys Sprache: hier kommt ein
   `event` herein und es wird `{ statusCode, headers, body }` erwartet.
   Mehrere `Set-Cookie` gehen über `multiValueHeaders` — in `headers` ginge
   nur eines, und die zweite Zeile fiele still weg.

   Erreichbar unter `/.netlify/functions/konto`; `netlify.toml` leitet
   `/api/konto` dorthin um.
--------------------------------------------------------------------------- */

const { verarbeite } = require('./_kundenbereich.js');

const GRENZE = 256 * 1024;

function rumpfLesen(event){
  let roh = event.body || '';
  if(event.isBase64Encoded) roh = Buffer.from(roh, 'base64').toString('utf8');
  if(roh.length > GRENZE) throw new Error('zu gross');
  if(!roh) return {};
  try { return JSON.parse(roh); } catch(e){ return {}; }
}

function kleinGeschrieben(kopf){
  const raus = {};
  Object.keys(kopf || {}).forEach(k => { raus[k.toLowerCase()] = kopf[k]; });
  return raus;
}

function herkunftAus(kopf){
  const host = String(kopf['x-forwarded-host'] || kopf.host || '');
  const schema = String(kopf['x-forwarded-proto']
    || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https'));
  return host ? `${schema}://${host}` : '';
}

const KOEPFE = {
  'Content-Type':     'application/json; charset=utf-8',
  'Cache-Control':    'no-store',
  'X-Frame-Options':  'DENY',
  'Referrer-Policy':  'same-origin'
};

exports.handler = async (event) => {
  if(event.httpMethod !== 'POST')
    return { statusCode: 405, headers: { ...KOEPFE, Allow: 'POST' },
             body: JSON.stringify({ ok: false, grund: 'nur POST' }) };

  let daten;
  try { daten = rumpfLesen(event); }
  catch(e){
    return { statusCode: 413, headers: KOEPFE,
             body: JSON.stringify({ ok: false, grund: 'zu viele Daten' }) };
  }

  const kopf = kleinGeschrieben(event.headers);

  let ergebnis;
  try {
    ergebnis = await verarbeite({
      methode: event.httpMethod,
      daten, kopf,
      herkunft: herkunftAus(kopf)
    });
  } catch(fehler){
    console.error('Kundenbereich:', fehler && fehler.message);
    return { statusCode: 500, headers: KOEPFE,
             body: JSON.stringify({ ok: false,
               grund: 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es noch einmal.' }) };
  }

  const antwort = { statusCode: ergebnis.code, headers: KOEPFE,
                    body: JSON.stringify(ergebnis.rumpf) };
  if((ergebnis.kekse || []).length)
    antwort.multiValueHeaders = { 'Set-Cookie': ergebnis.kekse };
  return antwort;
};

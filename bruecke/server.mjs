#!/usr/bin/env node
/* ============================================================
   Die Bruecke
   ------------------------------------------------------------
   Ein kleiner Dienst auf dem Buerorechner. Er tut drei Dinge:

     1. liefert die interne Oberflaeche aus (intern/…)
     2. beantwortet ihre Anfragen (Tagespaket, Scannen, Freigabe)
     3. faehrt morgens von selbst den Morgenlauf

   Er hoert standardmaessig nur auf 127.0.0.1 — also nur auf
   diesem Rechner. Sollen Kollegen von ihren Rechnern zugreifen,
   in konfig.json "host": "0.0.0.0" setzen; dann ist er im
   Bueronetz erreichbar und der Schluessel aus daten/token.txt
   wird zur Zugangsbedingung. Nicht ins offene Internet stellen.

       npm start
   ============================================================ */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { konfigLaden, tagesdatum } from './konfig.mjs';
import * as secplan from './secplan.mjs';
import * as Paket from './paket.mjs';
import { morgenlauf } from './morgenlauf.mjs';
import * as OCR from './ocr.mjs';

const konfig = await konfigLaden();

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webm': 'video/webm',
  '.vtt': 'text/vtt; charset=utf-8', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

/* Ordner, die der Dienst niemals ausliefert — dort liegen
   Zugangsdaten, Sitzungen und die Daten der Mitarbeiter. */
const GESPERRT = [/^\/?bruecke(\/|$)/i, /^\/?\.git(\/|$)/i, /(^|\/)\.env$/i, /(^|\/)\.htpasswd$/i];

function antwortJson(res, wert, code = 200) {
  const koerper = JSON.stringify(wert);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(koerper),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(koerper);
}

function antwortFehler(res, code, text) {
  antwortJson(res, { fehler: text }, code);
}

async function koerperLesen(req, grenzeMb = 30) {
  const teile = [];
  let gross = 0;
  for await (const stueck of req) {
    gross += stueck.length;
    if (gross > grenzeMb * 1024 * 1024) throw new Error('Datei zu gross (mehr als ' + grenzeMb + ' MB)');
    teile.push(stueck);
  }
  const text = Buffer.concat(teile).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function schluesselStimmt(url) {
  return url.searchParams.get('t') === konfig.token;
}

/* ---- Statische Dateien ---------------------------------------- */
async function statisch(req, res, pfadName) {
  if (GESPERRT.some((r) => r.test(pfadName))) { antwortFehler(res, 403, 'gesperrt'); return; }

  let ziel = path.normalize(path.join(konfig.wurzel, decodeURIComponent(pfadName)));
  if (!ziel.startsWith(konfig.wurzel)) { antwortFehler(res, 403, 'ausserhalb'); return; }

  try {
    let angaben = await stat(ziel).catch(() => null);
    if (angaben && angaben.isDirectory()) {
      ziel = path.join(ziel, 'index.html');
      angaben = await stat(ziel).catch(() => null);
    }
    if (!angaben) {
      // Adressen ohne .html — wie auf der Website.
      const mitEndung = ziel + '.html';
      if (existsSync(mitEndung)) ziel = mitEndung;
      else { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Nicht gefunden'); return; }
    }
    const inhalt = await readFile(ziel);
    res.writeHead(200, {
      'Content-Type': TYPEN[path.extname(ziel).toLowerCase()] || 'application/octet-stream',
      'Content-Length': inhalt.length,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(inhalt);
  } catch (f) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Fehler: ' + f.message);
  }
}

/* ---- Schnittstelle -------------------------------------------- */
async function schnittstelle(req, res, url) {
  if (req.method === 'OPTIONS') { antwortJson(res, {}); return; }
  if (!schluesselStimmt(url)) {
    antwortFehler(res, 401, 'Falscher oder fehlender Schluessel. Der Link aus der Morgenmail enthaelt ihn.');
    return;
  }

  const weg = url.pathname;

  if (weg === '/api/stand') {
    antwortJson(res, {
      lebt: true,
      modus: konfig.modus === 'browser' ? 'secplan direkt' : 'Dateien',
      probelauf: konfig.probelauf,
      letztesPaket: await Paket.letztesPaket(konfig),
      export: { trenner: (konfig.export && konfig.export.trenner) || ';',
                spalten: (konfig.export && konfig.export.spalten) || [] },
      heute: tagesdatum(0),
      abzugleichen: tagesdatum(konfig.tagesversatz)
    });
    return;
  }

  if (weg === '/api/tagespaket') {
    const tag = url.searchParams.get('tag') || tagesdatum(konfig.tagesversatz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) { antwortFehler(res, 400, 'Datum unbrauchbar'); return; }
    let paket = await Paket.laden(konfig, tag);
    if (!paket || !paket.soll || !paket.soll.length) {
      // Noch nichts abgelegt: dann jetzt holen.
      try {
        const frisch = await morgenlauf(konfig, tag, { stumm: true });
        paket = await Paket.laden(konfig, tag);
        if (frisch.hinweis && (!paket || !paket.soll.length)) {
          antwortJson(res, { tag, soll: [], ist: [], hinweis: frisch.hinweis });
          return;
        }
      } catch (f) {
        antwortJson(res, { tag, soll: [], ist: [], hinweis: f.message });
        return;
      }
    }
    antwortJson(res, paket || Paket.leeresPaket(tag));
    return;
  }

  if (weg === '/api/protokoll') {
    // Das Protokoll ist der Nachweis, wer wann was freigegeben hat.
    // Lesbar nur mit Schluessel, und immer nur ein Monat auf einmal.
    const monat = url.searchParams.get('monat') || tagesdatum(0).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monat)) { antwortFehler(res, 400, 'Monat unbrauchbar'); return; }
    const grenze = Math.min(parseInt(url.searchParams.get('anzahl'), 10) || 200, 2000);
    try {
      const eintraege = await Paket.protokollLesen(konfig, monat, grenze);
      antwortJson(res, { monat, eintraege, monate: await Paket.protokollMonate(konfig) });
    } catch (f) {
      antwortFehler(res, 500, f.message);
    }
    return;
  }

  if (weg === '/api/scannen' && req.method === 'POST') {
    try {
      const eingang = await koerperLesen(req);
      const ergebnis = await OCR.lesen(eingang, konfig.ocr || {});
      antwortJson(res, ergebnis);
    } catch (f) {
      antwortFehler(res, 422, f.message);
    }
    return;
  }

  if (weg === '/api/erfassung' && req.method === 'POST') {
    try {
      const meldung = await koerperLesen(req, 2);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(meldung.tag || '')) { antwortFehler(res, 400, 'Datum fehlt'); return; }
      const paket = await Paket.erfassungAufnehmen(konfig, meldung);
      await Paket.protokollieren(konfig, {
        art: 'erfassung', datum: meldung.tag, wer: meldung.melder,
        einsatz: meldung.einsatz, zeilen: (meldung.zeilen || []).length,
        ausfaelle: (meldung.ausfaelle || []).length
      });
      console.log(`[${new Date().toLocaleTimeString('de-DE')}] Schnellerfassung ${meldung.tag} von ${meldung.melder || 'unbekannt'}: ` +
        `${(meldung.zeilen || []).length} Zeiten, ${(meldung.ausfaelle || []).length} Ausfaelle.`);
      antwortJson(res, { angenommen: true, ist: paket.ist.length });
    } catch (f) {
      antwortFehler(res, 422, f.message);
    }
    return;
  }

  if (weg === '/api/freigabe' && req.method === 'POST') {
    try {
      const paket = await koerperLesen(req, 4);
      if (!paket.schichten) { antwortFehler(res, 400, 'Kein Freigabepaket'); return; }
      const ergebnis = await secplan.uebertragen(konfig, paket);
      await Paket.protokollieren(konfig, {
        art: 'freigabe', datum: paket.datum, wer: paket.bearbeiter,
        schichten: paket.schichten.length, ausfaelle: (paket.ausfaelle || []).length,
        uebertragen: ergebnis.uebertragen, probelauf: !!ergebnis.probelauf,
        fehler: ergebnis.fehler, weg: ergebnis.weg
      });
      // Und jede einzelne Aenderung noch einmal fuer sich: bei einer
      // Rueckfrage zu einer Stunde ist genau das die Antwort.
      for (const b of ergebnis.bericht || []) {
        if (!b.erfolg) continue;
        await Paket.protokollieren(konfig, {
          art: 'uebertragen', datum: b.datum, wer: paket.bearbeiter,
          name: b.name, personalnummer: b.personalnummer || '',
          alt: (b.geplantVon || '?') + '–' + (b.geplantBis || '?'),
          neu: b.von + '–' + b.bis,
          abgeglichen: !!b.abgeglichen
        });
      }
      const tagesPaket = await Paket.laden(konfig, paket.datum);
      if (tagesPaket) {
        tagesPaket.freigabe = { zeit: new Date().toISOString(), wer: paket.bearbeiter, ...ergebnis };
        await Paket.sichern(konfig, tagesPaket);
      }
      console.log(`[${new Date().toLocaleTimeString('de-DE')}] Freigabe ${paket.datum} durch ${paket.bearbeiter}: ` +
        `${ergebnis.uebertragen} uebertragen${ergebnis.probelauf ? ' (Probelauf)' : ''}.`);
      antwortJson(res, ergebnis);
    } catch (f) {
      antwortFehler(res, 500, f.message);
    }
    return;
  }

  if (weg === '/api/morgenlauf' && req.method === 'POST') {
    try {
      const eingang = await koerperLesen(req, 1);
      antwortJson(res, await morgenlauf(konfig, eingang.tag || null));
    } catch (f) {
      antwortFehler(res, 500, f.message);
    }
    return;
  }

  antwortFehler(res, 404, 'Unbekannte Anfrage');
}

/* ---- Nichts bringt den Dienst um --------------------------------
   Fremde Bibliotheken (Texterkennung, Browser-Steuerung) melden
   Fehler mitunter ausserhalb jeder Zusage. Wenn morgens um zehn
   ein Foto schiefgeht, darf deshalb nicht der ganze Abgleich fuer
   alle stehen. Also: aufschreiben, weiterlaufen. */
process.on('uncaughtException', (f) => {
  console.error('[' + new Date().toLocaleTimeString('de-DE') + '] Unerwarteter Fehler, Dienst laeuft weiter:');
  console.error('  ' + (f && f.stack ? f.stack.split('\n').slice(0, 3).join('\n  ') : f));
});
process.on('unhandledRejection', (f) => {
  console.error('[' + new Date().toLocaleTimeString('de-DE') + '] Unerledigtes Versprechen: ' +
    (f && f.message ? f.message : f));
});

/* ---- Server --------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  if (url.pathname.startsWith('/api/')) return schnittstelle(req, res, url);
  if (url.pathname === '/') {
    res.writeHead(302, { Location: '/intern/index.html?t=' + encodeURIComponent(konfig.token) });
    res.end();
    return;
  }
  return statisch(req, res, url.pathname);
});

/* ---- Zeitsteuerung -------------------------------------------- */
let zuletztGelaufen = '';
function uhrStarten() {
  const [stunde, minute] = String(konfig.morgenlauf || '07:00').split(':').map(Number);
  setInterval(async () => {
    const jetzt = new Date();
    const heute = tagesdatum(0);
    if (zuletztGelaufen === heute) return;
    if (jetzt.getHours() !== stunde || jetzt.getMinutes() !== minute) return;
    if (!konfig.wochentage.includes(jetzt.getDay())) return;
    zuletztGelaufen = heute;
    try {
      const e = await morgenlauf(konfig);
      console.log(`[${jetzt.toLocaleTimeString('de-DE')}] Morgenlauf fuer ${e.tag}: ${e.schichten} Schichten.`);
    } catch (f) {
      console.error('Morgenlauf gescheitert: ' + f.message);
    }
  }, 30 * 1000);
}

/* Laeuft schon eine Bruecke, ist das kein Fehler zum Weiterlaufen,
   sondern einer zum Aufhoeren — sonst stehen zwei Dienste da und
   nur einer bekommt die Anfragen. */
server.on('error', (f) => {
  if (f.code === 'EADDRINUSE') {
    console.error('\n  Auf Port ' + konfig.port + ' laeuft bereits eine Bruecke.');
    console.error('  Entweder das andere Fenster benutzen oder in konfig.json einen anderen Port setzen.\n');
  } else {
    console.error('\n  Der Dienst konnte nicht starten: ' + f.message + '\n');
  }
  process.exit(1);
});

server.listen(konfig.port, konfig.host, () => {
  const sichtbar = konfig.host === '0.0.0.0' ? 'localhost' : konfig.host;
  console.log('');
  console.log('  HERM — Bruecke laeuft');
  console.log('  ---------------------------------------------');
  console.log('  Abgleich:      http://' + sichtbar + ':' + konfig.port + '/intern/abgleich.html?t=' + konfig.token);
  console.log('  Schnellerfassung: http://' + sichtbar + ':' + konfig.port + '/intern/erfassung.html?t=' + konfig.token);
  console.log('  Modus:         ' + konfig.modus + (konfig.probelauf ? '  (Probelauf — es wird nichts geschrieben)' : ''));
  console.log('  Morgenlauf:    taeglich ' + konfig.morgenlauf + ' fuer den Tag mit Versatz ' + konfig.tagesversatz);
  if (konfig.host === '0.0.0.0') {
    console.log('');
    console.log('  ACHTUNG: Der Dienst ist im ganzen Netz erreichbar. Das ist gewollt,');
    console.log('  wenn Kollegen zugreifen sollen — aber nur im Bueronetz oder ueber VPN.');
  }
  console.log('');
  uhrStarten();
});

for (const zeichen of ['SIGINT', 'SIGTERM']) {
  process.on(zeichen, async () => {
    await OCR.aufraeumen();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  });
}

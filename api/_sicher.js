'use strict';

/* ---------------------------------------------------------------------------
   Das Sicherheitsfundament des Bestandskundenbereichs
   ---------------------------------------------------------------------------
   Hier steht alles, was mit Geheimnissen zu tun hat: Passwoerter, Marken,
   Kekse, Sperren, Pruefspur. Nichts davon gehoert in die Oberflaeche, und
   nichts davon steht mehr als einmal im Projekt.

   Warum scrypt und nicht bcrypt oder Argon2id:
   Argon2id waere die erste Wahl, braucht aber ein Modul mit eigener
   Maschinensprache. Das Netlify-Paket wird zu EINER Datei gebuendelt (siehe
   CLAUDE.md, „Das Netlify-Paket ist keine Kopie"), und eine .node-Datei
   laesst sich nicht mitbuendeln. scrypt steht in Node selbst, ist als
   speicherhartes Verfahren gegen Grafikkarten gebaut und vom BSI wie vom
   OWASP als geeignet genannt. Die Wahl ist eine Folge der Auslieferung,
   nicht der Bequemlichkeit — wer den Betrieb spaeter auf einen eigenen
   Server hebt, kann `PASSWORT_VERFAHREN` erweitern, ohne die bestehenden
   Hashes anzufassen: das Verfahren steht im Hash mit drin.
--------------------------------------------------------------------------- */

const crypto = require('crypto');
const db = require('./_db.js');

/* ---- Passwoerter ------------------------------------------------------- */

const SCRYPT = { N: 1 << 15, r: 8, p: 1, laenge: 64 };

function scrypt(passwort, salz, opt){
  return new Promise((los, nix) => {
    crypto.scrypt(passwort, salz, opt.laenge,
      { N: opt.N, r: opt.r, p: opt.p, maxmem: 256 * 1024 * 1024 },
      (f, schluessel) => f ? nix(f) : los(schluessel));
  });
}

/** Erzeugt `scrypt$N$r$p$salz$hash`. Das Verfahren steht mit im Wert, damit
 *  spaeter staerkere Werte moeglich sind, ohne alte Hashes zu verlieren. */
async function passwortHashen(passwort){
  const salz = crypto.randomBytes(16);
  const hash = await scrypt(passwort, salz, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p,
          salz.toString('base64url'), hash.toString('base64url')].join('$');
}

async function passwortStimmt(passwort, gespeichert){
  try {
    const t = String(gespeichert || '').split('$');
    if(t.length !== 6 || t[0] !== 'scrypt') return false;
    const opt = { N: +t[1], r: +t[2], p: +t[3], laenge: 64 };
    if(!(opt.N > 0 && opt.r > 0 && opt.p > 0)) return false;
    const salz = Buffer.from(t[4], 'base64url');
    const soll = Buffer.from(t[5], 'base64url');
    if(soll.length !== opt.laenge) return false;
    const ist = await scrypt(passwort, salz, opt);
    /* Zeitgleicher Vergleich: ein `===` verraet ueber die Laufzeit, wie viele
       Zeichen stimmen. */
    return crypto.timingSafeEqual(ist, soll);
  } catch(e){
    return false;
  }
}

/* Damit ein nicht vorhandener Anmeldename genauso lange braucht wie ein
   vorhandener mit falschem Passwort. Sonst verraet die Antwortzeit, welche
   Konten es gibt — und die Meldung „Login-Daten nicht korrekt" waere nur
   noch Kosmetik. */
let blindGehasht = null;
async function zeitAusgleichen(){
  if(!blindGehasht) blindGehasht = await passwortHashen(crypto.randomBytes(24).toString('hex'));
  await passwortStimmt('nicht das richtige Passwort', blindGehasht);
}

/* ---- Marken (Sitzung, Reset, Passkey-Aufgabe) -------------------------- */

/** 256 Bit Zufall, adressfest kodiert. Das ist der Wert, den der Kunde
 *  bekommt; gespeichert wird nur sein Abdruck. */
function markeErzeugen(){
  return crypto.randomBytes(32).toString('base64url');
}

function abdruck(marke){
  return crypto.createHash('sha256').update(String(marke)).digest('hex');
}

/* ---- Kekse ------------------------------------------------------------- */

const KEKS = 'hst_sitzung';

/** Ohne `Secure` waere die Marke im Klartext im Netz unterwegs; ohne
 *  `HttpOnly` koennte sie jedes Skript lesen, und ein einziges XSS reichte,
 *  um sie mitzunehmen; ohne `SameSite=Strict` schickte der Browser sie auch
 *  bei einer Anfrage mit, die von einer fremden Seite ausgeht.
 *
 *  `Secure` faellt nur weg, wenn die Seite ueber http laeuft — sonst
 *  funktionierte die Anmeldung auf dem eigenen Rechner ueberhaupt nicht,
 *  und man baute sich zum Ausprobieren eine unsichere Abkuerzung ein. */
function keksSetzen(marke, sekunden, sicher){
  const teile = [
    `${KEKS}=${marke}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(sekunden))}`
  ];
  if(sicher) teile.push('Secure');
  return teile.join('; ');
}

function keksLoeschen(sicher){
  return keksSetzen('', 0, sicher);
}

function keksLesen(kopfzeile){
  const raus = {};
  String(kopfzeile || '').split(';').forEach(stueck => {
    const i = stueck.indexOf('=');
    if(i < 1) return;
    raus[stueck.slice(0, i).trim()] = stueck.slice(i + 1).trim();
  });
  return raus;
}

/* ---- Sitzungen --------------------------------------------------------- */

const SITZUNG_KURZ = 12 * 60 * 60;          // ein Arbeitstag
const SITZUNG_LANG = 30 * 24 * 60 * 60;     // „angemeldet bleiben"

async function sitzungAnlegen(kundeId, langBleiben, kennung, ip){
  const marke = markeErzeugen();
  const dauer = langBleiben ? SITZUNG_LANG : SITZUNG_KURZ;
  await db.frage(
    `INSERT INTO sitzungen (marke_hash, kunde_id, laeuft_ab, kennung, ip)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval, $4, $5)`,
    [abdruck(marke), kundeId, String(dauer), (kennung || '').slice(0, 200), ip || null]);
  return { marke, dauer };
}

/** Prueft die Marke gegen die Datenbank — nicht gegen etwas, was der Browser
 *  mitgeschickt hat. Eine Sitzung, die serverseitig geloescht ist, ist damit
 *  sofort tot, auch wenn der Keks noch im Browser steht. */
async function sitzungLesen(marke){
  if(!marke) return null;
  const z = await db.eine(
    `SELECT s.id, s.kunde_id, s.laeuft_ab, k.aktiv
       FROM sitzungen s JOIN kunden k ON k.id = s.kunde_id
      WHERE s.marke_hash = $1 AND s.laeuft_ab > now()`,
    [abdruck(marke)]);
  if(!z) return null;
  /* Ein deaktiviertes Konto ist sofort draussen, ohne dass jemand die
     Sitzungen von Hand aufraeumen muss. */
  if(!z.aktiv){ await sitzungBeenden(marke); return null; }
  /* „Zuletzt gesehen" nur grob nachfuehren: ein UPDATE bei jedem Aufruf
     waere ein Schreibvorgang je Klick, ohne dass jemand den Wert auf die
     Minute braucht. */
  db.frage('UPDATE sitzungen SET gesehen = now() WHERE id = $1 AND gesehen < now() - interval \'5 minutes\'',
           [z.id]).catch(()=>{});
  return { sitzungId: z.id, kundeId: z.kunde_id };
}

async function sitzungBeenden(marke){
  if(!marke) return;
  await db.frage('DELETE FROM sitzungen WHERE marke_hash = $1', [abdruck(marke)]);
}

async function alleSitzungenBeenden(kundeId){
  await db.frage('DELETE FROM sitzungen WHERE kunde_id = $1', [kundeId]);
}

/* ---- Sperre gegen Durchprobieren -------------------------------------- */

const FENSTER_MIN   = 15;
const GRENZE_KONTO  = 5;    // Fehlversuche je Anmeldename im Fenster
const GRENZE_IP     = 20;   // Fehlversuche je Adresse im Fenster

/** Zaehlt die Fehlversuche SEIT DEM LETZTEN ERFOLG. Ohne diese Einschraenkung
 *  bliebe ein Kunde, der sich viermal vertippt und dann richtig anmeldet, den
 *  Rest des Fensters knapp an der Sperre. */
async function versucheZaehlen(kennung){
  const z = await db.eine(
    `SELECT count(*)::int AS n FROM login_versuche
      WHERE kennung = $1
        AND zeitpunkt > now() - ($2 || ' minutes')::interval
        AND NOT gelungen
        AND zeitpunkt > COALESCE(
              (SELECT max(zeitpunkt) FROM login_versuche
                WHERE kennung = $1 AND gelungen
                  AND zeitpunkt > now() - ($2 || ' minutes')::interval),
              '-infinity'::timestamptz)`,
    [kennung, String(FENSTER_MIN)]);
  return z ? z.n : 0;
}

async function gesperrt(anmeldename, ip){
  const kennung = String(anmeldename || '').toLowerCase();
  const [konto, adresse] = await Promise.all([
    kennung ? versucheZaehlen(kennung) : Promise.resolve(0),
    ip ? versucheZaehlen('ip:' + ip) : Promise.resolve(0)
  ]);
  return konto >= GRENZE_KONTO || adresse >= GRENZE_IP;
}

async function versuchNotieren(anmeldename, ip, gelungen){
  const kennung = String(anmeldename || '').toLowerCase();
  const zeilen = [];
  if(kennung) zeilen.push([kennung, gelungen]);
  if(ip)      zeilen.push(['ip:' + ip, gelungen]);
  await Promise.all(zeilen.map(([k, g]) =>
    db.frage('INSERT INTO login_versuche (kennung, gelungen) VALUES ($1, $2)', [k, g])));
  /* Aufraeumen nebenher: die Tabelle waere sonst das einzige, was
     unbegrenzt waechst. */
  if(Math.random() < 0.02)
    db.frage(`DELETE FROM login_versuche WHERE zeitpunkt < now() - interval '2 days'`).catch(()=>{});
}

/* ---- Pruefspur --------------------------------------------------------- */

/** Was passiert ist, nicht was gesagt wurde. Hier steht nie ein Passwort,
 *  eine Marke oder ein Link — auch nicht gehasht. Ein Fehler beim Schreiben
 *  der Spur darf den Vorgang nicht scheitern lassen. */
function spur(kundeId, ereignis, einzelheit, ip){
  return db.frage(
    'INSERT INTO pruefspur (kunde_id, ereignis, einzelheit, ip) VALUES ($1, $2, $3, $4)',
    [kundeId || null, String(ereignis).slice(0, 80), String(einzelheit || '').slice(0, 400), ip || null]
  ).catch(()=>{});
}

/* ---- Kleinkram --------------------------------------------------------- */

/** Die Adresse des Aufrufers. Hinter einem Netz von Vercel oder Netlify
 *  steht sie in `x-forwarded-for`, und zwar als Liste; der erste Eintrag ist
 *  der Kunde, die weiteren sind Zwischenstationen. */
function ipAus(kopf){
  const roh = String(kopf['x-nf-client-connection-ip'] || kopf['x-real-ip']
                  || kopf['x-forwarded-for'] || '').split(',')[0].trim();
  return /^[0-9a-f.:]{3,45}$/i.test(roh) ? roh : null;
}

module.exports = {
  passwortHashen, passwortStimmt, zeitAusgleichen,
  markeErzeugen, abdruck,
  KEKS, keksSetzen, keksLoeschen, keksLesen,
  SITZUNG_KURZ, SITZUNG_LANG,
  sitzungAnlegen, sitzungLesen, sitzungBeenden, alleSitzungenBeenden,
  gesperrt, versuchNotieren, FENSTER_MIN, GRENZE_KONTO,
  spur, ipAus
};

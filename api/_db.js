'use strict';

/* ---------------------------------------------------------------------------
   Die Datenbank
   ---------------------------------------------------------------------------
   Die Website war bis zum Bestandskundenbereich vollstaendig zustandslos.
   Passwoerter, Sitzungen, Passkeys und Anfragen brauchen aber einen Ort, und
   zwar einen serverseitigen. Gewaehlt ist PostgreSQL, angesprochen ueber die
   Umgebungsvariable DATABASE_URL:

       DATABASE_URL=postgres://benutzer:kennwort@host:5432/datenbank?sslmode=require

   Das laeuft bei Neon, Supabase, Vercel Postgres und jedem verwalteten
   Postgres und bindet den Betrieb an keinen Anbieter.

   Drei Dinge, die in einer Funktion ohne eigenen Speicher anders sind als auf
   einem Server:

   1. **Der Pool lebt kurz.** Zwischen zwei Aufrufen kann die Instanz weg
      sein. Deshalb ein kleiner Pool (zwei Verbindungen) und ein kurzer
      Leerlauf — ein grosser Pool je Instanz erschoepft bei vielen Instanzen
      die Verbindungsgrenze der Datenbank, und das faellt erst unter Last auf.
   2. **Wanderungen laufen nicht beim Aufruf.** Zwei Instanzen, die
      gleichzeitig dasselbe Schema anlegen, sind ein Rennen. Das Schema legt
      `tools/db-einrichten.js` an, einmal und von Hand.
   3. **Ohne DATABASE_URL antwortet der Bereich mit 503**, genau wie die
      Formularfunktion ohne SMTP-Zugang. Die Website faellt dann sichtbar auf
      das gewoehnliche Anfrageformular zurueck, statt einen Knopf anzubieten,
      hinter dem nichts ist.
--------------------------------------------------------------------------- */

const { Pool } = require('pg');

let pool = null;

function adresse(){
  return process.env.DATABASE_URL || '';
}

function bereit(){
  return !!adresse();
}

/* Eine verwaltete Datenbank spricht TLS; ein Postgres auf demselben Rechner
   nicht. Unterschieden wird an der Adresse, nicht an einem zweiten Schalter,
   den jemand vergessen kann. */
function tlsNoetig(url){
  if(/sslmode=disable/.test(url)) return false;
  return !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

function hol(){
  if(pool) return pool;
  const url = adresse();
  if(!url) throw new Error('DATABASE_URL fehlt');
  pool = new Pool({
    connectionString: url,
    ssl: tlsNoetig(url) ? { rejectUnauthorized: true } : false,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    /* Eine Abfrage, die haengt, haelt sonst die ganze Funktion bis zum
       Zeitlimit der Plattform fest, und der Kunde sieht einen Spinner. */
    statement_timeout: 8_000,
    query_timeout: 8_000
  });
  /* Ohne diesen Zuhoerer beendet ein Fehler auf einer untaetigen Verbindung
     den ganzen Prozess. */
  pool.on('error', () => {});
  return pool;
}

async function frage(sql, werte){
  const { rows } = await hol().query(sql, werte);
  return rows;
}

async function eine(sql, werte){
  const rows = await frage(sql, werte);
  return rows.length ? rows[0] : null;
}

/* Alles oder nichts. Wird gebraucht, sobald mehr als eine Zeile zusammen
   gehoert — eine Anfrage ohne ihre Positionen ist keine Anfrage. */
async function imVorgang(arbeit){
  const c = await hol().connect();
  try {
    await c.query('BEGIN');
    const raus = await arbeit({
      frage: async (sql, werte) => (await c.query(sql, werte)).rows,
      eine:  async (sql, werte) => { const r = await c.query(sql, werte); return r.rows.length ? r.rows[0] : null; }
    });
    await c.query('COMMIT');
    return raus;
  } catch(fehler){
    try { await c.query('ROLLBACK'); } catch(e){}
    throw fehler;
  } finally {
    c.release();
  }
}

/* Steht das Schema? Wird beim ersten Aufruf einmal geprueft und dann
   gemerkt — die Antwort aendert sich im Leben einer Instanz nicht. */
let standGeprueft = null;
async function schemaSteht(){
  if(standGeprueft !== null) return standGeprueft;
  try {
    const z = await eine('SELECT max(version) AS v FROM schema_stand');
    standGeprueft = !!(z && z.v >= 1);
  } catch(e){
    standGeprueft = false;
  }
  return standGeprueft;
}

module.exports = { bereit, frage, eine, imVorgang, schemaSteht, hol };

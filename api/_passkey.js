'use strict';

/* ---------------------------------------------------------------------------
   Passkeys — Face ID, Touch ID, Windows Hello, Geräte-PIN
   ---------------------------------------------------------------------------
   Auf Face ID greift hier nichts direkt zu, und das ist kein Mangel, sondern
   der einzige richtige Weg: WebAuthn ist der Standard, in dem das Geraet
   selbst entscheidet, WIE es seinen Besitzer erkennt. Auf einem iPhone ist
   das Face ID, auf einem MacBook Touch ID, auf einem Windows-Rechner Hello
   oder die PIN. Die Website erfaehrt davon nur eines: dass es geklappt hat.

   Der private Schluessel verlaesst das Geraet nie. Hier liegt ausschliesslich
   der oeffentliche — er ist oeffentlich, und mit ihm allein kann sich niemand
   anmelden.

   Drei Dinge, an denen eine Passkey-Umsetzung typischerweise scheitert, und
   wie sie hier geloest sind:

   1. **Die Aufgabe (Challenge) muss vom Server kommen und dort bleiben.**
      Kaeme sie aus dem Browser zurueck, koennte ein Angreifer sie selbst
      waehlen und eine alte Signatur erneut einreichen. Sie liegt deshalb in
      `passkey_aufgaben`, ist einmal gueltig und laeuft nach fuenf Minuten ab.
   2. **Die Kennung der Gegenstelle (rpID) darf nicht aus dem Host-Kopf
      kommen.** Wer den Kopf faelschen kann, bekaeme sonst eine Signatur, die
      auf seiner eigenen Adresse gilt. Sie steht in WEBAUTHN_RP_ID; nur auf
      dem eigenen Rechner wird sie aus der Adresse abgeleitet.
   3. **Der Zaehler muss steigen.** Sinkt er, ist der Authentifikator
      vermutlich geklont. `verifyAuthenticationResponse` prueft das, wenn man
      ihm den gespeicherten Stand gibt — deshalb wird er mitgefuehrt.
--------------------------------------------------------------------------- */

const {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} = require('@simplewebauthn/server');

const db = require('./_db.js');
const sicher = require('./_sicher.js');

const AUFGABE_GILT_SEKUNDEN = 300;

/** Woher die Website heisst. Auf dem eigenen Rechner darf das aus der
 *  Adresse kommen, im Betrieb nicht (siehe Punkt 2 oben). */
function gegenstelle(herkunft){
  const rpId  = process.env.WEBAUTHN_RP_ID || '';
  const quelle = process.env.WEBAUTHN_ORIGIN || '';
  if(rpId && quelle) return { rpId, quelle: quelle.split(',').map(s => s.trim()).filter(Boolean) };

  let host = '';
  try { host = new URL(herkunft).hostname; } catch(e){}
  const lokal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if(!lokal) return null;                    // im Betrieb ohne Angabe: kein Passkey
  return { rpId: host, quelle: [herkunft] };
}

function verfuegbar(herkunft){
  return !!gegenstelle(herkunft);
}

/* ---- Aufgaben ---------------------------------------------------------- */

async function aufgabeMerken(aufgabe, kundeId, zweck){
  const marke = sicher.markeErzeugen();
  await db.frage(
    `INSERT INTO passkey_aufgaben (marke_hash, aufgabe, kunde_id, zweck, laeuft_ab)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' seconds')::interval)`,
    [sicher.abdruck(marke), aufgabe, kundeId || null, zweck, String(AUFGABE_GILT_SEKUNDEN)]);
  /* Abgelaufene gelegentlich wegraeumen. */
  if(Math.random() < 0.05)
    db.frage('DELETE FROM passkey_aufgaben WHERE laeuft_ab < now()').catch(()=>{});
  return marke;
}

/** Holt die Aufgabe UND loescht sie im selben Zug. Damit ist sie genau
 *  einmal verwendbar — auch wenn zwei Anfragen gleichzeitig ankommen. */
async function aufgabeEinloesen(marke, zweck){
  if(!marke) return null;
  const z = await db.eine(
    `DELETE FROM passkey_aufgaben
      WHERE marke_hash = $1 AND zweck = $2 AND laeuft_ab > now()
      RETURNING aufgabe, kunde_id`,
    [sicher.abdruck(marke), zweck]);
  return z || null;
}

/* ---- Einrichten (nach der Anmeldung mit Passwort) ---------------------- */

async function einrichtenStart(kunde, herkunft){
  const g = gegenstelle(herkunft);
  if(!g) return null;

  const vorhanden = await db.frage(
    'SELECT credential_id, transports FROM passkeys WHERE kunde_id = $1', [kunde.id]);

  const optionen = await generateRegistrationOptions({
    rpName: 'HERM Service Team',
    rpID: g.rpId,
    userName: kunde.anmeldename,
    userDisplayName: kunde.firma,
    /* Die Kennung des Benutzers gegenueber dem Authentifikator. Bewusst die
       interne Nummer und nicht die Mailadresse: sie aendert sich nie, und
       sie verraet nichts. */
    userID: Buffer.from('hst-' + kunde.id, 'utf8'),
    attestationType: 'none',
    /* Schon vorhandene Schluessel ausschliessen, sonst legt dasselbe Geraet
       einen zweiten an und der Kunde hat zwei Eintraege fuer ein Telefon. */
    excludeCredentials: vorhanden.map(p => ({
      id: p.credential_id,
      transports: p.transports ? p.transports.split(',') : undefined
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred'   /* Face ID ja, aber kein Muss: sonst
                                         faellt ein Geraet ohne Biometrie raus */
    }
  });

  const marke = await aufgabeMerken(optionen.challenge, kunde.id, 'einrichtung');
  return { optionen, marke };
}

async function einrichtenEnde(kunde, antwort, marke, herkunft, geraet){
  const g = gegenstelle(herkunft);
  if(!g) return { ok: false, grund: 'Passkeys sind auf diesem Server nicht eingerichtet.' };

  const auf = await aufgabeEinloesen(marke, 'einrichtung');
  if(!auf || String(auf.kunde_id) !== String(kunde.id))
    return { ok: false, grund: 'Der Vorgang ist abgelaufen. Bitte noch einmal versuchen.' };

  let pruefung;
  try {
    pruefung = await verifyRegistrationResponse({
      response: antwort,
      expectedChallenge: auf.aufgabe,
      expectedOrigin: g.quelle,
      expectedRPID: g.rpId,
      requireUserVerification: false
    });
  } catch(e){
    return { ok: false, grund: 'Der Passkey konnte nicht geprüft werden.' };
  }
  if(!pruefung.verified || !pruefung.registrationInfo)
    return { ok: false, grund: 'Der Passkey konnte nicht geprüft werden.' };

  const c = pruefung.registrationInfo.credential;
  try {
    await db.frage(
      `INSERT INTO passkeys (kunde_id, credential_id, public_key, zaehler, transports, geraet)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [kunde.id, c.id, Buffer.from(c.publicKey), c.counter || 0,
       (c.transports || []).join(','), String(geraet || '').slice(0, 120)]);
  } catch(e){
    /* Derselbe Schluessel ein zweites Mal: kein Fehler, der den Kunden
       etwas angeht. */
    if(e && e.code === '23505') return { ok: true, schonDa: true };
    throw e;
  }
  return { ok: true };
}

/* ---- Anmelden ---------------------------------------------------------- */

/** Ohne Anmeldenamen: der Browser bietet an, was er fuer diese Website hat
 *  (das ist der Weg, bei dem auf dem iPhone nur Face ID kommt). Mit
 *  Anmeldenamen: nur dessen Schluessel.
 *
 *  Wichtig dabei: es wird NICHT verraten, ob es den Namen gibt. Auch fuer
 *  einen unbekannten Namen kommt eine gueltige Aufgabe zurueck — sonst
 *  waere dieser Weg eine Auskunftsstelle darueber, welche Konten bestehen. */
async function anmeldenStart(anmeldename, herkunft){
  const g = gegenstelle(herkunft);
  if(!g) return null;

  let erlaubt;
  if(anmeldename){
    const k = await db.eine(
      'SELECT id FROM kunden WHERE lower(anmeldename) = lower($1) AND aktiv', [anmeldename]);
    const schluessel = k
      ? await db.frage('SELECT credential_id, transports FROM passkeys WHERE kunde_id = $1', [k.id])
      : [];
    erlaubt = schluessel.map(p => ({
      id: p.credential_id,
      transports: p.transports ? p.transports.split(',') : undefined
    }));
  }

  const optionen = await generateAuthenticationOptions({
    rpID: g.rpId,
    allowCredentials: erlaubt,
    userVerification: 'preferred'
  });
  const marke = await aufgabeMerken(optionen.challenge, null, 'anmeldung');
  return { optionen, marke };
}

async function anmeldenEnde(antwort, marke, herkunft){
  const g = gegenstelle(herkunft);
  if(!g) return { ok: false };

  const auf = await aufgabeEinloesen(marke, 'anmeldung');
  if(!auf) return { ok: false };

  const kennung = String(antwort && antwort.id || '');
  if(!kennung) return { ok: false };

  const p = await db.eine(
    `SELECT p.id, p.credential_id, p.public_key, p.zaehler, p.transports,
            k.id AS kunde_id, k.aktiv
       FROM passkeys p JOIN kunden k ON k.id = p.kunde_id
      WHERE p.credential_id = $1`, [kennung]);
  if(!p || !p.aktiv) return { ok: false };

  let pruefung;
  try {
    pruefung = await verifyAuthenticationResponse({
      response: antwort,
      expectedChallenge: auf.aufgabe,
      expectedOrigin: g.quelle,
      expectedRPID: g.rpId,
      requireUserVerification: false,
      credential: {
        id: p.credential_id,
        publicKey: new Uint8Array(p.public_key),
        counter: Number(p.zaehler),
        transports: p.transports ? p.transports.split(',') : undefined
      }
    });
  } catch(e){
    return { ok: false };
  }
  if(!pruefung.verified) return { ok: false };

  await db.frage(
    'UPDATE passkeys SET zaehler = $1, zuletzt = now() WHERE id = $2',
    [pruefung.authenticationInfo.newCounter || 0, p.id]);

  return { ok: true, kundeId: p.kunde_id };
}

async function liste(kundeId){
  return db.frage(
    `SELECT id, geraet, angelegt, zuletzt FROM passkeys
      WHERE kunde_id = $1 ORDER BY angelegt`, [kundeId]);
}

async function entfernen(kundeId, id){
  const z = await db.eine(
    'DELETE FROM passkeys WHERE id = $1 AND kunde_id = $2 RETURNING id',
    [id, kundeId]);
  return !!z;
}

module.exports = {
  verfuegbar, einrichtenStart, einrichtenEnde,
  anmeldenStart, anmeldenEnde, liste, entfernen
};

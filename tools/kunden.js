#!/usr/bin/env node
'use strict';

/* ---------------------------------------------------------------------------
   Bestandskunden anlegen und pflegen
   ---------------------------------------------------------------------------
   Der Bestandskundenbereich hat bewusst KEINE Selbstregistrierung: wer dort
   hineinkommt, ist ein Kunde, mit dem der Betrieb schon arbeitet. Angelegt
   wird er hier, auf der Kommandozeile, mit Zugang zur Datenbank.

       export DATABASE_URL=postgres://…

       node tools/kunden.js einrichten                  # Schema anlegen
       node tools/kunden.js anlegen  --firma "Muster GmbH" \
                                     --anmeldename firma-muster \
                                     --email einkauf@muster.de \
                                     --vorname Max --nachname Mustermann
       node tools/kunden.js liste
       node tools/kunden.js zeigen    firma-muster
       node tools/kunden.js aendern   firma-muster --telefon "040 123456"
       node tools/kunden.js passwort  firma-muster            # neues erzeugen
       node tools/kunden.js anmeldename firma-muster neuer-name
       node tools/kunden.js sperren   firma-muster
       node tools/kunden.js freigeben firma-muster
       node tools/kunden.js person    firma-muster --vorname Eva --nachname Klar \
                                      --email eva@muster.de --position "Projektleitung"
       node tools/kunden.js passkeys  firma-muster           # ansehen
       node tools/kunden.js passkey-loeschen firma-muster    # alle entfernen
       node tools/kunden.js anfragen  firma-muster
       node tools/kunden.js loeschen  firma-muster           # samt allem

   Das Passwort wird IMMER hier erzeugt und einmal angezeigt. Es steht danach
   nirgends mehr im Klartext — auch nicht in dieser Ausgabe, wenn man sie
   wegwirft. Genau so soll es sein.

   Das hier ist absichtlich kein Verwaltungsbereich im Browser. Ein solcher
   wäre eine zweite Anmeldung, eine zweite Rechteverwaltung und eine zweite
   Angriffsfläche — für eine Handvoll Kunden, die zweimal im Jahr dazukommen.
   Das Datenmodell steht einem späteren Verwaltungsbereich aber nicht im Weg:
   alles, was dieses Werkzeug tut, sind gewöhnliche Abfragen.
--------------------------------------------------------------------------- */

const path = require('path');
const fs = require('fs');

process.env.NODE_PATH = path.join(__dirname, '..', 'node_modules');
require('module').Module._initPaths();

const db = require(path.join(__dirname, '..', 'api', '_db.js'));
const sicher = require(path.join(__dirname, '..', 'api', '_sicher.js'));

const argv = process.argv.slice(2);
const befehl = argv[0] || 'hilfe';

/* --- Argumente ----------------------------------------------------------- */

function flaggen(ab){
  const raus = {};
  for(let i = ab; i < argv.length; i++){
    if(!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const wert = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'ja';
    raus[name] = wert;
  }
  return raus;
}

const rot   = s => `\x1b[31m${s}\x1b[0m`;
const fett  = s => `\x1b[1m${s}\x1b[0m`;
const leise = s => `\x1b[2m${s}\x1b[0m`;

function ende(text, code){
  console.error(rot(text));
  process.exit(code == null ? 1 : code);
}

/* --- Hilfsmittel --------------------------------------------------------- */

async function kundeFinden(kennung){
  if(!kennung) ende('Bitte den Anmeldenamen, die E-Mail oder die Kundennummer angeben.');
  const k = await db.eine(
    `SELECT * FROM kunden
      WHERE lower(anmeldename) = lower($1)
         OR lower(email) = lower($1)
         OR upper(kundennummer) = upper($1)`, [kennung]);
  if(!k) ende(`Kein Kunde gefunden zu „${kennung}".`);
  return k;
}

/** HST-K-00124. Fortlaufend, mit derselben Zeile wie die Anfragenummern. */
async function naechsteKundennummer(t){
  await t.frage(`INSERT INTO nummernkreis (bereich, stand) VALUES ('kunde', 0) ON CONFLICT DO NOTHING`);
  const z = await t.eine(`UPDATE nummernkreis SET stand = stand + 1 WHERE bereich = 'kunde' RETURNING stand`);
  return `HST-K-${String(z.stand).padStart(5, '0')}`;
}

/** Ein Passwort, das man am Telefon durchgeben kann und das trotzdem taugt.
 *  Vier Silbengruppen aus einem Alphabet ohne verwechselbare Zeichen —
 *  kein l/1/I, kein O/0. Rund 62 Bit; das ist bei serverseitigem scrypt und
 *  fünf Fehlversuchen je Viertelstunde reichlich. */
function passwortVorschlagen(){
  const crypto = require('crypto');
  const ZEICHEN = 'abcdefghijkmnpqrstuvwxyz23456789';
  const gruppen = [];
  for(let g = 0; g < 4; g++){
    let s = '';
    for(let i = 0; i < 4; i++) s += ZEICHEN[crypto.randomInt(ZEICHEN.length)];
    gruppen.push(s);
  }
  return gruppen.join('-');
}

function zeigeKunde(k, leute, schluessel){
  console.log('');
  console.log(fett(k.firma) + leise(`   ${k.kundennummer}${k.aktiv ? '' : '   GESPERRT'}`));
  console.log(`  Anmeldename   ${k.anmeldename}`);
  console.log(`  E-Mail        ${k.email}`);
  console.log(`  Telefon       ${k.telefon || '—'}`);
  const anschrift = [`${k.strasse} ${k.hausnummer}`.trim(), `${k.plz} ${k.ort}`.trim()]
    .filter(Boolean).join(', ');
  console.log(`  Anschrift     ${anschrift || '—'}`);
  if(k.ustid) console.log(`  USt-IdNr.     ${k.ustid}`);
  if(leute && leute.length){
    console.log('');
    console.log('  Ansprechpartner');
    leute.forEach(p => console.log(
      `    ${p.haupt ? '›' : ' '} ${p.vorname} ${p.nachname}`
      + (p.position ? leise(`  ${p.position}`) : '')
      + (p.email ? `  ${p.email}` : '') + (p.telefon ? `  ${p.telefon}` : '')));
  }
  if(schluessel && schluessel.length){
    console.log('');
    console.log('  Passkeys');
    schluessel.forEach(p => console.log(
      `    ${p.geraet || 'unbenanntes Gerät'}`
      + leise(`  angelegt ${new Date(p.angelegt).toLocaleDateString('de-DE')}`)
      + (p.zuletzt ? leise(`, zuletzt ${new Date(p.zuletzt).toLocaleDateString('de-DE')}`) : '')));
  }
  console.log('');
}

/* --- Befehle ------------------------------------------------------------- */

const BEFEHLE = {

  async einrichten(){
    const ordner = path.join(__dirname, '..', 'db');
    const dateien = fs.readdirSync(ordner).filter(d => d.endsWith('.sql')).sort();
    for(const d of dateien){
      process.stdout.write(`  ${d} … `);
      await db.hol().query(fs.readFileSync(path.join(ordner, d), 'utf8'));
      console.log('ok');
    }
    const z = await db.eine('SELECT max(version) AS v FROM schema_stand');
    console.log(`\nSchema steht auf Stand ${z.v}.`);
  },

  async anlegen(){
    const f = flaggen(1);
    if(!f.firma)       ende('--firma fehlt');
    if(!f.anmeldename) ende('--anmeldename fehlt');
    if(!f.email)       ende('--email fehlt');
    if(!/^[a-z0-9][a-z0-9._-]{2,60}$/i.test(f.anmeldename))
      ende('Der Anmeldename darf nur Buchstaben, Ziffern, Punkt, Strich und Unterstrich enthalten (3 bis 61 Zeichen).');
    if(!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(f.email))
      ende('Die E-Mail-Adresse sieht nicht wie eine Adresse aus.');

    const passwort = f.passwort || passwortVorschlagen();
    if(passwort.length < 10) ende('Das Passwort muss mindestens zehn Zeichen haben.');
    const hash = await sicher.passwortHashen(passwort);

    const kunde = await db.imVorgang(async (t) => {
      const nummer = f.kundennummer || await naechsteKundennummer(t);
      const k = await t.eine(
        `INSERT INTO kunden (kundennummer, firma, anmeldename, email, passwort_hash,
                             strasse, hausnummer, plz, ort, ustid, telefon)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [nummer, f.firma, f.anmeldename, f.email.toLowerCase(), hash,
         f.strasse || '', f.hausnummer || '', f.plz || '', f.ort || '',
         f.ustid || '', f.telefon || '']);
      if(f.vorname || f.nachname){
        await t.frage(
          `INSERT INTO kunden_ansprechpartner
             (kunde_id, vorname, nachname, position, email, telefon, haupt)
           VALUES ($1,$2,$3,$4,$5,$6,true)`,
          [k.id, f.vorname || '', f.nachname || '', f.position || '',
           f.personEmail || f.email.toLowerCase(), f.personTelefon || f.telefon || '']);
      }
      return k;
    });

    const leute = await db.frage('SELECT * FROM kunden_ansprechpartner WHERE kunde_id = $1', [kunde.id]);
    zeigeKunde(kunde, leute, []);
    console.log(fett('  Zugangsdaten — jetzt notieren, sie werden nicht wieder angezeigt:'));
    console.log(`    Anmeldename   ${kunde.anmeldename}`);
    console.log(`    Passwort      ${fett(passwort)}`);
    console.log('');
    console.log(leise('  Bitte auf einem sicheren Weg übergeben, nicht per einfacher E-Mail.'));
    console.log(leise('  Der Kunde kann es unter „Passwort vergessen" jederzeit selbst ändern.'));
    console.log('');
  },

  async liste(){
    const alle = await db.frage(
      `SELECT k.*, (SELECT count(*) FROM anfragen a WHERE a.kunde_id = k.id)::int AS anfragen,
              (SELECT count(*) FROM passkeys p WHERE p.kunde_id = k.id)::int AS passkeys
         FROM kunden k ORDER BY k.firma`);
    if(!alle.length) return console.log('\nNoch kein Bestandskunde angelegt.\n');
    console.log('');
    console.log(leise('  Nummer        Firma                          Anmeldename        Anfragen  Passkeys'));
    alle.forEach(k => console.log(
      `  ${k.kundennummer.padEnd(13)} ${String(k.firma).slice(0,29).padEnd(30)} `
      + `${String(k.anmeldename).slice(0,17).padEnd(18)} ${String(k.anfragen).padStart(7)} `
      + `${String(k.passkeys).padStart(9)}${k.aktiv ? '' : rot('   gesperrt')}`));
    console.log('');
  },

  async zeigen(){
    const k = await kundeFinden(argv[1]);
    const [leute, schluessel] = await Promise.all([
      db.frage('SELECT * FROM kunden_ansprechpartner WHERE kunde_id = $1 ORDER BY haupt DESC, nachname', [k.id]),
      db.frage('SELECT * FROM passkeys WHERE kunde_id = $1 ORDER BY angelegt', [k.id])
    ]);
    zeigeKunde(k, leute, schluessel);
  },

  async aendern(){
    const k = await kundeFinden(argv[1]);
    const f = flaggen(2);
    const ERLAUBT = ['firma','email','strasse','hausnummer','plz','ort','ustid','telefon'];
    const setzen = [], werte = [];
    ERLAUBT.forEach(feld => {
      if(f[feld] === undefined) return;
      setzen.push(`${feld} = $${setzen.length + 1}`);
      werte.push(feld === 'email' ? String(f[feld]).toLowerCase() : f[feld]);
    });
    if(!setzen.length) ende('Nichts zu ändern. Mögliche Felder: --' + ERLAUBT.join(' --'));
    werte.push(k.id);
    await db.frage(`UPDATE kunden SET ${setzen.join(', ')}, geaendert = now() WHERE id = $${werte.length}`, werte);
    await BEFEHLE.zeigen();
  },

  async anmeldename(){
    const k = await kundeFinden(argv[1]);
    const neu = argv[2];
    if(!neu) ende('Bitte den neuen Anmeldenamen angeben.');
    if(!/^[a-z0-9][a-z0-9._-]{2,60}$/i.test(neu)) ende('Der Anmeldename ist nicht zulässig.');
    await db.frage('UPDATE kunden SET anmeldename = $1, geaendert = now() WHERE id = $2', [neu, k.id]);
    console.log(`\n  ${k.firma}: Anmeldename ist jetzt ${fett(neu)}.\n`);
  },

  async passwort(){
    const k = await kundeFinden(argv[1]);
    const f = flaggen(2);
    const neu = f.passwort || passwortVorschlagen();
    if(neu.length < 10) ende('Das Passwort muss mindestens zehn Zeichen haben.');
    const hash = await sicher.passwortHashen(neu);
    await db.frage('UPDATE kunden SET passwort_hash = $1, geaendert = now() WHERE id = $2', [hash, k.id]);
    /* Wer das Passwort zurücksetzt, will meistens genau das: alle bestehenden
       Anmeldungen beenden. */
    await sicher.alleSitzungenBeenden(k.id);
    await sicher.spur(k.id, 'passwort.geaendert', 'durch die Verwaltung', null);
    console.log(`\n  ${k.firma} (${k.anmeldename})`);
    console.log(`    Neues Passwort   ${fett(neu)}`);
    console.log(leise('    Alle offenen Anmeldungen wurden beendet.\n'));
  },

  async sperren(){
    const k = await kundeFinden(argv[1]);
    await db.frage('UPDATE kunden SET aktiv = false, geaendert = now() WHERE id = $1', [k.id]);
    await sicher.alleSitzungenBeenden(k.id);
    await sicher.spur(k.id, 'konto.gesperrt', 'durch die Verwaltung', null);
    console.log(`\n  ${k.firma} ist gesperrt. Anmeldung und offene Sitzungen sind beendet.\n`);
  },

  async freigeben(){
    const k = await kundeFinden(argv[1]);
    await db.frage('UPDATE kunden SET aktiv = true, geaendert = now() WHERE id = $1', [k.id]);
    await sicher.spur(k.id, 'konto.freigegeben', 'durch die Verwaltung', null);
    console.log(`\n  ${k.firma} ist wieder freigegeben.\n`);
  },

  async person(){
    const k = await kundeFinden(argv[1]);
    const f = flaggen(2);
    if(!f.vorname && !f.nachname) ende('--vorname oder --nachname fehlt');
    const haupt = f.haupt === 'ja';
    await db.imVorgang(async (t) => {
      if(haupt) await t.frage('UPDATE kunden_ansprechpartner SET haupt = false WHERE kunde_id = $1', [k.id]);
      await t.frage(
        `INSERT INTO kunden_ansprechpartner (kunde_id, vorname, nachname, position, email, telefon, haupt)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [k.id, f.vorname || '', f.nachname || '', f.position || '',
         (f.email || '').toLowerCase(), f.telefon || '', haupt]);
    });
    await BEFEHLE.zeigen();
  },

  async passkeys(){
    const k = await kundeFinden(argv[1]);
    const s = await db.frage('SELECT * FROM passkeys WHERE kunde_id = $1 ORDER BY angelegt', [k.id]);
    if(!s.length) return console.log(`\n  ${k.firma} hat keinen Passkey hinterlegt.\n`);
    zeigeKunde(k, null, s);
  },

  async 'passkey-loeschen'(){
    const k = await kundeFinden(argv[1]);
    const r = await db.frage('DELETE FROM passkeys WHERE kunde_id = $1 RETURNING id', [k.id]);
    await sicher.spur(k.id, 'passkey.entfernt', `alle (${r.length}) durch die Verwaltung`, null);
    console.log(`\n  ${r.length} Passkey(s) entfernt. Der Kunde meldet sich wieder mit Passwort an.\n`);
  },

  async anfragen(){
    const k = await kundeFinden(argv[1]);
    const a = await db.frage(
      `SELECT a.*, (SELECT sum(anzahl) FROM anfrage_positionen p WHERE p.anfrage_id = a.id)::int AS leute
         FROM anfragen a WHERE a.kunde_id = $1 ORDER BY a.eingegangen DESC LIMIT 40`, [k.id]);
    if(!a.length) return console.log(`\n  ${k.firma} hat noch keine Anfrage gestellt.\n`);
    console.log(`\n  ${fett(k.firma)}\n`);
    a.forEach(z => console.log(
      `  ${z.anfragenummer}  ${new Date(z.eingegangen).toLocaleDateString('de-DE')}  `
      + `${String(z.projekt).slice(0,30).padEnd(31)}${String(z.leute || 0).padStart(4)} Einsätze  ${z.status}`
      + (z.mail_disposition === 'fehler' ? rot('  Mail fehlgeschlagen') : '')));
    console.log('');
  },

  async loeschen(){
    const k = await kundeFinden(argv[1]);
    if(flaggen(2).wirklich !== 'ja'){
      console.log(`\n  Das löscht ${fett(k.firma)} samt Anfragen, Positionen, Passkeys und Prüfspur.`);
      console.log(`  Wenn das gewollt ist:\n\n    node tools/kunden.js loeschen ${argv[1]} --wirklich ja\n`);
      return;
    }
    await db.frage('DELETE FROM kunden WHERE id = $1', [k.id]);
    console.log(`\n  ${k.firma} wurde vollständig gelöscht.\n`);
  },

  hilfe(){
    console.log(fs.readFileSync(__filename, 'utf8')
      .split('\n').slice(4, 40).map(z => z.replace(/^\s*\*?\s?/, '  ')).join('\n'));
  }
};

/* --- Los ----------------------------------------------------------------- */

(async () => {
  if(befehl !== 'hilfe' && !db.bereit())
    ende('DATABASE_URL ist nicht gesetzt.\n'
       + 'Beispiel:  export DATABASE_URL=postgres://benutzer:kennwort@host:5432/datenbank');

  const machen = BEFEHLE[befehl];
  if(!machen) ende(`Unbekannter Befehl „${befehl}". „node tools/kunden.js hilfe" zeigt alle.`);

  try {
    await machen();
  } catch(fehler){
    if(fehler && fehler.code === '23505')
      ende('Anmeldename, E-Mail oder Kundennummer gibt es schon.');
    ende('Fehler: ' + (fehler && fehler.message));
  } finally {
    try { await db.hol().end(); } catch(e){}
  }
})();

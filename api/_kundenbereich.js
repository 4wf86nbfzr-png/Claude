'use strict';

/* ---------------------------------------------------------------------------
   Der Bestandskundenbereich — der host-unabhängige Kern
   ---------------------------------------------------------------------------
   Aufgebaut wie `_vorgang.js`: hier steht der ganze Ablauf, und er weiss
   weder von Vercel noch von Netlify. Die beiden Hüllen daneben
   (`konto.js`, `_konto_netlify.js`) übersetzen nur.

   Alles läuft über EINEN Endpunkt mit einem Feld `aktion`. Das ist keine
   Bequemlichkeit, sondern folgt der Auslieferung: das Netlify-Paket wird zu
   einer einzigen Funktionsdatei gebündelt, und zwölf Endpunkte wären zwölf
   Bündel von je zwei Megabyte.

   ----- Was gegen fremde Seiten schützt (CSRF) -----
   Zwei Riegel, die zusammen greifen:

   1. Der Sitzungskeks ist `SameSite=Strict`. Eine Anfrage, die von einer
      fremden Seite ausgeht, bekommt ihn gar nicht erst mit.
   2. Jeder POST muss den Kopf `X-HST-Bereich: kundenbereich` tragen und,
      wenn ein `Origin` mitkommt, von derselben Adresse stammen. Einen
      eigenen Kopf kann fremdes JavaScript nur nach einer Vorabfrage setzen,
      und die beantwortet dieser Endpunkt nicht freundlich.

   Ein einzelner Riegel reicht in beiden Fällen nicht: `SameSite` kennt nicht
   jeder alte Browser, und der Kopf allein hülfe nichts, wenn jemand ein
   Formular abschickt (das setzt keine eigenen Köpfe, kommt aber ohne
   Vorabfrage durch).

   ----- Was gegen fremde Daten schützt (IDOR) -----
   Keine Abfrage in dieser Datei nimmt eine Kundennummer aus dem Rumpf. Wer
   der Kunde ist, sagt ausschliesslich die Sitzung. Jede Abfrage, die etwas
   Kundeneigenes anfasst, trägt `AND kunde_id = $n` mit genau dieser Nummer —
   auch dort, wo es auf den ersten Blick überflüssig aussieht.
--------------------------------------------------------------------------- */

const db      = require('./_db.js');
const sicher  = require('./_sicher.js');
const passkey = require('./_passkey.js');
const personal= require('./_personal.js');
const mails   = require('./_kundenmails.js');

const GRENZE_POSITIONEN = 60;      /* 3 Arten × 14 Tage sind 42 — 60 ist
                                      grosszügig und begrenzt trotzdem */
const MAX_TEXT   = 2000;
const MAX_KURZ   = 200;

/* ---- Kleinkram --------------------------------------------------------- */

const text = (w, max) => String(w == null ? '' : w).trim().slice(0, max || MAX_KURZ);
const jaNein = w => w === true || w === 'true' || w === 'ja' || w === 1 || w === '1';

function antwort(code, rumpf, kekse){
  return { code, rumpf, kekse: kekse || [] };
}

/* Immer derselbe Satz, egal woran es lag. „Benutzer existiert, Passwort
   falsch" wäre eine Auskunftsstelle darüber, welche Konten es gibt. */
const ANMELDUNG_FALSCH = 'Login-Daten nicht korrekt.';

/* ---- Der Kunde hinter der Sitzung ------------------------------------- */

async function kundeAusSitzung(marke){
  const s = await sicher.sitzungLesen(marke);
  if(!s) return null;
  const k = await db.eine(
    `SELECT id, kundennummer, firma, anmeldename, email, strasse, hausnummer,
            plz, ort, ustid, telefon
       FROM kunden WHERE id = $1 AND aktiv`, [s.kundeId]);
  return k ? { ...k, sitzungId: s.sitzungId } : null;
}

async function stammdaten(kunde, herkunft){
  const [leute, schluessel] = await Promise.all([
    db.frage(
      `SELECT id, vorname, nachname, position, email, telefon, haupt
         FROM kunden_ansprechpartner WHERE kunde_id = $1
        ORDER BY haupt DESC, nachname, vorname`, [kunde.id]),
    passkey.liste(kunde.id)
  ]);
  return {
    kundennummer: kunde.kundennummer,
    firma:        kunde.firma,
    anmeldename:  kunde.anmeldename,
    email:        kunde.email,
    telefon:      kunde.telefon,
    anschrift: {
      strasse: kunde.strasse, hausnummer: kunde.hausnummer,
      plz: kunde.plz, ort: kunde.ort, ustid: kunde.ustid
    },
    ansprechpartner: leute.map(p => ({
      id: p.id, vorname: p.vorname, nachname: p.nachname,
      position: p.position, email: p.email, telefon: p.telefon, haupt: p.haupt
    })),
    passkeys: schluessel.map(p => ({
      id: p.id, geraet: p.geraet,
      angelegt: p.angelegt, zuletzt: p.zuletzt
    })),
    passkeyMoeglich: passkey.verfuegbar(herkunft)
  };
}

/* ---- Nummernkreise ----------------------------------------------------- */

/** `HST-A-2026-00184`. Läuft in derselben Transaktion wie die Anfrage: zwei
 *  gleichzeitige Anfragen können damit nicht dieselbe Nummer bekommen, weil
 *  `FOR UPDATE` die zweite warten lässt. */
async function naechsteAnfragenummer(t){
  const jahr = new Date().getFullYear();
  const bereich = 'anfrage-' + jahr;
  await t.frage(
    `INSERT INTO nummernkreis (bereich, stand) VALUES ($1, 0) ON CONFLICT DO NOTHING`,
    [bereich]);
  const z = await t.eine(
    `UPDATE nummernkreis SET stand = stand + 1 WHERE bereich = $1 RETURNING stand`,
    [bereich]);
  return `HST-A-${jahr}-${String(z.stand).padStart(5, '0')}`;
}

/* ---- Positionen prüfen ------------------------------------------------- */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const ZEIT  = /^([01]\d|2[0-3]):[0-5]\d$/;

function positionenPruefen(roh){
  if(!Array.isArray(roh) || !roh.length)
    return { fehler: 'Bitte geben Sie mindestens eine Position an.' };
  if(roh.length > GRENZE_POSITIONEN)
    return { fehler: `Bitte nicht mehr als ${GRENZE_POSITIONEN} Positionen in einer Anfrage.` };

  const heute = new Date(); heute.setHours(0,0,0,0);
  const spaeter = new Date(heute); spaeter.setFullYear(spaeter.getFullYear() + 3);

  const raus = [];
  for(let i = 0; i < roh.length; i++){
    const p = roh[i] || {};
    const wo = `Position ${i + 1}`;

    if(!personal.kennt(p.art)) return { fehler: `${wo}: unbekannte Personalart.` };

    const anzahl = Math.floor(Number(p.anzahl));
    if(!(anzahl >= 1 && anzahl <= 999))
      return { fehler: `${wo}: die Anzahl muss zwischen 1 und 999 liegen.` };

    const datum = text(p.datum, 10);
    if(!DATUM.test(datum)) return { fehler: `${wo}: bitte ein Datum angeben.` };
    const tag = new Date(datum + 'T00:00:00');
    if(isNaN(tag)) return { fehler: `${wo}: das Datum ist ungültig.` };
    if(tag < heute)   return { fehler: `${wo}: das Datum liegt in der Vergangenheit.` };
    if(tag > spaeter) return { fehler: `${wo}: das Datum liegt zu weit in der Zukunft.` };

    const von = text(p.von, 5), bis = text(p.bis, 5);
    if(!ZEIT.test(von) || !ZEIT.test(bis))
      return { fehler: `${wo}: bitte Beginn und Ende angeben.` };

    /* „16:00 bis 00:30" ist ein Einsatz über Mitternacht, kein Fehler. Wenn
       der Browser es nicht mitschickt, wird es aus den Zeiten geschlossen;
       bei „von 10 bis 10" ginge das Schliessen schief, deshalb zählt dort
       die ausdrückliche Angabe. */
    const ueberNacht = p.ueberNacht == null ? (bis <= von) : jaNein(p.ueberNacht);

    raus.push({
      art: String(p.art), artName: personal.name(p.art),
      anzahl, datum, von, bis, ueberNacht,
      hinweis: text(p.hinweis, MAX_KURZ)
    });
  }
  return { positionen: raus };
}

/* ===========================================================================
   Die Aktionen
   =========================================================================== */

async function stand(kunde, herkunft){
  return antwort(200, {
    ok: true,
    bereit: true,
    angemeldet: !!kunde,
    personal: personal.fuerDieSeite(),
    passkeyMoeglich: passkey.verfuegbar(herkunft),
    kunde: kunde ? await stammdaten(kunde, herkunft) : null
  });
}

async function anmelden(daten, ip, kennung, sichererKanal){
  const anmeldename = text(daten.anmeldename, 120);
  const passwort    = String(daten.passwort == null ? '' : daten.passwort);

  if(!anmeldename || !passwort)
    return antwort(400, { ok: false, grund: ANMELDUNG_FALSCH });

  if(await sicher.gesperrt(anmeldename, ip)){
    await sicher.spur(null, 'anmeldung.gesperrt', anmeldename.slice(0, 60), ip);
    return antwort(429, { ok: false,
      grund: `Zu viele Versuche. Bitte warten Sie ${sicher.FENSTER_MIN} Minuten.` });
  }

  /* Anmeldename ODER E-Mail — viele Menschen merken sich die Mailadresse
     besser als einen vergebenen Namen. */
  const k = await db.eine(
    `SELECT id, kundennummer, firma, anmeldename, email, passwort_hash, aktiv
       FROM kunden WHERE lower(anmeldename) = lower($1) OR lower(email) = lower($1)`,
    [anmeldename]);

  const stimmt = k && k.aktiv ? await sicher.passwortStimmt(passwort, k.passwort_hash) : false;
  if(!stimmt){
    /* Auch wenn es den Namen gar nicht gibt, wird einmal gerechnet — sonst
       verrät die Antwortzeit, welche Konten bestehen. */
    if(!k) await sicher.zeitAusgleichen();
    await sicher.versuchNotieren(anmeldename, ip, false);
    await sicher.spur(k ? k.id : null, 'anmeldung.fehlgeschlagen', anmeldename.slice(0, 60), ip);
    return antwort(401, { ok: false, grund: ANMELDUNG_FALSCH });
  }

  await sicher.versuchNotieren(anmeldename, ip, true);
  const { marke, dauer } = await sicher.sitzungAnlegen(
    k.id, jaNein(daten.bleiben), kennung, ip);
  await sicher.spur(k.id, 'anmeldung.gelungen', 'Passwort', ip);

  const kunde = await kundeAusSitzung(marke);
  return antwort(200, { ok: true, kunde: await stammdaten(kunde, daten.__herkunft) },
                 [sicher.keksSetzen(marke, dauer, sichererKanal)]);
}

async function abmelden(marke, kundeId, ip, sichererKanal){
  await sicher.sitzungBeenden(marke);
  if(kundeId) await sicher.spur(kundeId, 'abmeldung', '', ip);
  return antwort(200, { ok: true }, [sicher.keksLoeschen(sichererKanal)]);
}

/* ---- Passwort vergessen ------------------------------------------------ */

const RESET_GILT_MINUTEN = 60;

/** Die Antwort ist IMMER dieselbe. Wer hier erführe, ob eine Adresse ein
 *  Konto hat, hätte eine Liste der Kunden des Betriebs. */
async function passwortVergessen(daten, ip, herkunft){
  const email = text(daten.email, 200).toLowerCase();
  const freundlich = { ok: true,
    hinweis: 'Wenn zu dieser Adresse ein Kundenkonto besteht, wurde eine E-Mail versendet.' };

  if(!email || !email.includes('@')) return antwort(200, freundlich);

  const k = await db.eine(
    'SELECT id, firma, email FROM kunden WHERE lower(email) = $1 AND aktiv', [email]);
  if(!k) return antwort(200, freundlich);

  /* Nicht beliebig oft: sonst ist der Endpunkt ein Weg, jemandem das
     Postfach zu füllen. */
  const zuviel = await db.eine(
    `SELECT count(*)::int AS n FROM reset_marken
      WHERE kunde_id = $1 AND angelegt > now() - interval '1 hour'`, [k.id]);
  if(zuviel && zuviel.n >= 3) return antwort(200, freundlich);

  const marke = sicher.markeErzeugen();
  await db.frage(
    `INSERT INTO reset_marken (marke_hash, kunde_id, laeuft_ab)
     VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [sicher.abdruck(marke), k.id, String(RESET_GILT_MINUTEN)]);
  await sicher.spur(k.id, 'passwort.zuruecksetzen.angefordert', '', ip);

  const adresse = `${herkunft}/kontakt.html#passwort-neu=${marke}`;
  await mails.passwortLink(k, adresse, RESET_GILT_MINUTEN).catch(async (e) => {
    await sicher.spur(k.id, 'passwort.zuruecksetzen.mailfehler', String(e && e.message || '').slice(0,200), ip);
  });

  return antwort(200, freundlich);
}

async function passwortNeu(daten, ip, sichererKanal){
  const marke    = text(daten.marke, 200);
  const passwort = String(daten.passwort == null ? '' : daten.passwort);

  if(passwort.length < 10)
    return antwort(400, { ok: false, grund: 'Bitte mindestens zehn Zeichen wählen.' });
  if(passwort.length > 200)
    return antwort(400, { ok: false, grund: 'Das Passwort ist zu lang.' });

  const z = await db.eine(
    `UPDATE reset_marken SET benutzt = now()
      WHERE marke_hash = $1 AND benutzt IS NULL AND laeuft_ab > now()
      RETURNING kunde_id`, [sicher.abdruck(marke)]);
  if(!z)
    return antwort(400, { ok: false,
      grund: 'Der Link ist abgelaufen oder wurde bereits verwendet.' });

  const hash = await sicher.passwortHashen(passwort);
  await db.frage('UPDATE kunden SET passwort_hash = $1, geaendert = now() WHERE id = $2',
                 [hash, z.kunde_id]);
  /* Alle bestehenden Sitzungen beenden: wer das Passwort zurücksetzt, tut
     das oft genau deshalb, weil jemand anderes eine Sitzung hat. */
  await sicher.alleSitzungenBeenden(z.kunde_id);
  await sicher.spur(z.kunde_id, 'passwort.geaendert', 'über Zurücksetzen', ip);

  return antwort(200, { ok: true,
    hinweis: 'Das Passwort wurde geändert. Bitte melden Sie sich neu an.' },
    [sicher.keksLoeschen(sichererKanal)]);
}

/* ---- Die Anfrage ------------------------------------------------------- */

async function anfrageAnlegen(kunde, daten, ip, herkunft){
  const projekt    = text(daten.projekt, MAX_KURZ);
  const einsatzort = text(daten.einsatzort, MAX_KURZ);
  const adresse    = text(daten.adresse, MAX_KURZ);
  const hinweise   = text(daten.hinweise, MAX_TEXT);

  if(!projekt)    return antwort(400, { ok: false, grund: 'Bitte geben Sie einen Projektnamen an.', feld: 'projekt' });
  if(!einsatzort) return antwort(400, { ok: false, grund: 'Bitte geben Sie den Einsatzort an.', feld: 'einsatzort' });

  const geprueft = positionenPruefen(daten.positionen);
  if(geprueft.fehler) return antwort(400, { ok: false, grund: geprueft.fehler, feld: 'positionen' });

  /* Der Ansprechpartner muss diesem Kunden gehören. Ohne diese Prüfung
     könnte jemand die Nummer eines fremden Ansprechpartners eintragen und
     bekäme dessen Namen in die Mail (siehe IDOR im Kopf der Datei). */
  let ansprechpartnerId = null;
  if(daten.ansprechpartnerId != null && daten.ansprechpartnerId !== ''){
    /* Nur eine reine Zahl. Frueher standen hier die Ziffern, die aus dem
       Wert uebrig blieben (`.replace(/\D/g,'')`) — aus „1 OR true" wurde
       damit klaglos die 1. Gefaehrlich war das nicht, die Abfrage bleibt ja
       an `kunde_id` gebunden; falsch war es trotzdem: was nicht stimmt, muss
       auffallen und darf nicht stillschweigend zurechtgebogen werden. */
    const roh = String(daten.ansprechpartnerId).trim();
    if(!/^[0-9]{1,18}$/.test(roh))
      return antwort(400, { ok: false, grund: 'Der Ansprechpartner ist nicht bekannt.' });
    const a = await db.eine(
      'SELECT id FROM kunden_ansprechpartner WHERE id = $1 AND kunde_id = $2',
      [roh, kunde.id]);
    if(!a) return antwort(400, { ok: false, grund: 'Der Ansprechpartner ist nicht bekannt.' });
    ansprechpartnerId = a.id;
  }

  /* Gegen Doppelabsenden: der Browser schickt bei jedem Versuch denselben
     Schlüssel. Der zweite Versuch legt nichts Neues an, sondern bekommt die
     bereits gespeicherte Anfrage zurück — der Kunde sieht dieselbe Nummer
     und nicht zwei Anfragen. */
  const schluessel = text(daten.vorgangsschluessel, 64) || null;
  if(schluessel){
    const schon = await db.eine(
      `SELECT anfragenummer FROM anfragen
        WHERE kunde_id = $1 AND vorgangsschluessel = $2`, [kunde.id, schluessel]);
    if(schon)
      return antwort(200, { ok: true, anfragenummer: schon.anfragenummer, schonDa: true });
  }

  /* Speichern zuerst, Mail danach. Eine Anfrage, die in der Datenbank steht,
     ist angekommen — auch wenn der Mailserver gerade nicht erreichbar ist.
     Andersherum wäre sie weg. */
  let gespeichert;
  try {
    gespeichert = await db.imVorgang(async (t) => {
      const nummer = await naechsteAnfragenummer(t);
      const a = await t.eine(
        `INSERT INTO anfragen
           (anfragenummer, kunde_id, ansprechpartner_id, projekt, einsatzort,
            adresse, hinweise, vorgangsschluessel)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, anfragenummer, eingegangen`,
        [nummer, kunde.id, ansprechpartnerId, projekt, einsatzort, adresse, hinweise, schluessel]);

      for(let i = 0; i < geprueft.positionen.length; i++){
        const p = geprueft.positionen[i];
        await t.frage(
          `INSERT INTO anfrage_positionen
             (anfrage_id, reihenfolge, art, art_name, anzahl, datum, von, bis, ueber_nacht, hinweis)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [a.id, i, p.art, p.artName, p.anzahl, p.datum, p.von, p.bis, p.ueberNacht, p.hinweis]);
      }
      return a;
    });
  } catch(e){
    /* Zwei gleichzeitige Absendungen mit demselben Schlüssel: die zweite
       fällt in den eindeutigen Index. Das ist kein Fehler, sondern genau
       der Schutz, der greifen soll. */
    if(e && e.code === '23505' && schluessel){
      const schon = await db.eine(
        `SELECT anfragenummer FROM anfragen WHERE kunde_id = $1 AND vorgangsschluessel = $2`,
        [kunde.id, schluessel]);
      if(schon) return antwort(200, { ok: true, anfragenummer: schon.anfragenummer, schonDa: true });
    }
    throw e;
  }

  await sicher.spur(kunde.id, 'anfrage.gespeichert', gespeichert.anfragenummer, ip);

  /* Ab hier darf nichts mehr die Anfrage gefährden. Jeder Mailfehler wird
     nur vermerkt. */
  const vorgang = {
    anfrage: gespeichert,
    kunde,
    ansprechpartner: ansprechpartnerId
      ? await db.eine('SELECT * FROM kunden_ansprechpartner WHERE id = $1', [ansprechpartnerId])
      : await db.eine('SELECT * FROM kunden_ansprechpartner WHERE kunde_id = $1 AND haupt', [kunde.id]),
    projekt, einsatzort, adresse, hinweise,
    positionen: geprueft.positionen
  };

  const stand = { disposition: 'fehler', kunde: 'fehler' };
  try { await mails.anDieDisposition(vorgang); stand.disposition = 'zugestellt'; }
  catch(e){ await sicher.spur(kunde.id, 'anfrage.mailfehler', 'Disposition: ' + String(e && e.message || '').slice(0,160), ip); }

  if(String(process.env.MAIL_BESTAETIGUNG || '').toLowerCase() === 'aus'){
    stand.kunde = 'aus';
  } else {
    try { await mails.anDenKunden(vorgang); stand.kunde = 'zugestellt'; }
    catch(e){ await sicher.spur(kunde.id, 'anfrage.mailfehler', 'Bestätigung: ' + String(e && e.message || '').slice(0,160), ip); }
  }

  await db.frage('UPDATE anfragen SET mail_disposition = $1, mail_kunde = $2 WHERE id = $3',
                 [stand.disposition, stand.kunde, gespeichert.id]).catch(()=>{});

  return antwort(200, {
    ok: true,
    anfragenummer: gespeichert.anfragenummer,
    /* Ehrlich bleiben: wenn die Benachrichtigung nicht rausging, steht die
       Anfrage trotzdem — aber der Kunde soll wissen, dass er im Zweifel
       anrufen kann. */
    benachrichtigt: stand.disposition === 'zugestellt'
  });
}

/* ===========================================================================
   Der Verteiler
   =========================================================================== */

const OHNE_ANMELDUNG = new Set([
  'stand', 'anmelden', 'abmelden',
  'passwort-vergessen', 'passwort-neu',
  'passkey-anmelden-start', 'passkey-anmelden-ende'
]);

async function verarbeite(anfrage){
  const { methode, daten, kopf, herkunft } = anfrage;
  const ip = sicher.ipAus(kopf || {});
  const kennung = String((kopf || {})['user-agent'] || '');
  const sichererKanal = /^https:/i.test(herkunft || '');

  if(!db.bereit() || !(await db.schemaSteht()))
    return antwort(503, { ok: false, bereit: false,
      grund: 'Der Bestandskundenbereich ist auf diesem Server noch nicht eingerichtet.' });

  const aktion = text(daten && daten.aktion, 60);

  /* --- CSRF (siehe Kopf der Datei) --- */
  if(methode !== 'GET'){
    if(String((kopf || {})['x-hst-bereich'] || '') !== 'kundenbereich')
      return antwort(403, { ok: false, grund: 'Ungültige Anfrage.' });
    const quelle = String((kopf || {})['origin'] || '');
    if(quelle && herkunft && quelle.replace(/\/$/, '') !== herkunft.replace(/\/$/, ''))
      return antwort(403, { ok: false, grund: 'Ungültige Anfrage.' });
  }

  const marke = (sicher.keksLesen((kopf || {})['cookie']))[sicher.KEKS] || '';
  const kunde = marke ? await kundeAusSitzung(marke) : null;

  if(!OHNE_ANMELDUNG.has(aktion) && !kunde)
    return antwort(401, { ok: false, abgelaufen: true,
      grund: 'Ihre Anmeldung ist abgelaufen. Bitte melden Sie sich neu an.' });

  switch(aktion){
    case 'stand':
      return stand(kunde, herkunft);

    case 'anmelden':
      if(kunde) return stand(kunde, herkunft);   /* schon angemeldet */
      return anmelden({ ...daten, __herkunft: herkunft }, ip, kennung, sichererKanal);

    case 'abmelden':
      return abmelden(marke, kunde && kunde.id, ip, sichererKanal);

    case 'passwort-vergessen':
      return passwortVergessen(daten, ip, herkunft);

    case 'passwort-neu':
      return passwortNeu(daten, ip, sichererKanal);

    case 'passkey-einrichten-start': {
      const s = await passkey.einrichtenStart(kunde, herkunft);
      if(!s) return antwort(503, { ok: false, grund: 'Passkeys sind auf diesem Server nicht eingerichtet.' });
      return antwort(200, { ok: true, optionen: s.optionen, marke: s.marke });
    }
    case 'passkey-einrichten-ende': {
      const e = await passkey.einrichtenEnde(kunde, daten.antwort, text(daten.marke, 200),
                                             herkunft, daten.geraet);
      if(!e.ok) return antwort(400, { ok: false, grund: e.grund });
      await sicher.spur(kunde.id, 'passkey.hinzugefuegt', text(daten.geraet, 120), ip);
      return antwort(200, { ok: true, kunde: await stammdaten(kunde, herkunft) });
    }
    case 'passkey-entfernen': {
      /* Dieselbe Regel wie beim Ansprechpartner: eine reine Zahl oder gar
         nichts. Das Loeschen selbst ist ohnehin an `kunde_id` gebunden — ein
         fremder Passkey bleibt also stehen, egal was hier ankommt. */
      const roh = String(daten.id == null ? '' : daten.id).trim();
      if(!/^[0-9]{1,18}$/.test(roh))
        return antwort(400, { ok: false, grund: 'Der Passkey ist nicht bekannt.' });
      const weg = await passkey.entfernen(kunde.id, roh);
      if(weg) await sicher.spur(kunde.id, 'passkey.entfernt', '', ip);
      return antwort(200, { ok: true, kunde: await stammdaten(kunde, herkunft) });
    }
    case 'passkey-anmelden-start': {
      const s = await passkey.anmeldenStart(text(daten.anmeldename, 120), herkunft);
      if(!s) return antwort(503, { ok: false, grund: 'Passkeys sind auf diesem Server nicht eingerichtet.' });
      return antwort(200, { ok: true, optionen: s.optionen, marke: s.marke });
    }
    case 'passkey-anmelden-ende': {
      if(await sicher.gesperrt('', ip))
        return antwort(429, { ok: false, grund: `Zu viele Versuche. Bitte warten Sie ${sicher.FENSTER_MIN} Minuten.` });
      const e = await passkey.anmeldenEnde(daten.antwort, text(daten.marke, 200), herkunft);
      if(!e.ok){
        await sicher.versuchNotieren('', ip, false);
        return antwort(401, { ok: false, grund: ANMELDUNG_FALSCH });
      }
      await sicher.versuchNotieren('', ip, true);
      const { marke: neu, dauer } = await sicher.sitzungAnlegen(
        e.kundeId, jaNein(daten.bleiben), kennung, ip);
      await sicher.spur(e.kundeId, 'anmeldung.gelungen', 'Passkey', ip);
      const frisch = await kundeAusSitzung(neu);
      return antwort(200, { ok: true, kunde: await stammdaten(frisch, herkunft) },
                     [sicher.keksSetzen(neu, dauer, sichererKanal)]);
    }

    case 'anfrage':
      return anfrageAnlegen(kunde, daten, ip, herkunft);

    default:
      return antwort(400, { ok: false, grund: 'Unbekannte Aktion.' });
  }
}

module.exports = { verarbeite };

'use strict';

/* ---------------------------------------------------------------------------
   Die Mails des Bestandskundenbereichs
   ---------------------------------------------------------------------------
   Drei Nachrichten:

     anDieDisposition   die vollständige Anfrage, so, dass jemand sie ohne
                        Rückfrage disponieren kann
     anDenKunden        eine Eingangsbestätigung mit derselben Aufstellung
     passwortLink       der Link zum Zurücksetzen des Passworts

   Der Empfänger der internen Nachricht steht an EINER Stelle:
   `ANFRAGE_MAIL_AN`, ersatzweise das schon vorhandene `MAIL_AN`. Verteilt
   im Code stünde er über kurz oder lang zweimal verschieden da.

   In keine dieser Mails gehört ein Passwort, eine Sitzungsmarke oder sonst
   ein Geheimnis. Der Link zum Zurücksetzen ist die einzige Ausnahme, und er
   gilt eine Stunde und genau einmal.
--------------------------------------------------------------------------- */

const nodemailer = require('nodemailer');

const t = w => String(w == null ? '' : w).trim();

/* Kopfzeilen dürfen keinen Zeilenumbruch enthalten — sonst ließen sich über
   ein Feld eigene Empfänger einschleusen. Dieselbe Regel wie in _mails.js. */
const kopfsicher = w => t(w).replace(/[\r\n]+/g, ' ').slice(0, 160);

function datumHuebsch(wert){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t(wert));
  if(!m) return t(wert);
  const TAGE = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  return `${TAGE[d.getUTCDay()]} ${m[3]}.${m[2]}.${m[1]}`;
}

function zeitspanne(p){
  return `${p.von}–${p.bis}` + (p.ueberNacht ? ' Uhr (über Nacht)' : ' Uhr');
}

function personenGesamt(positionen){
  return positionen.reduce((s, p) => s + p.anzahl, 0);
}

/* Die Positionen nach Tagen gruppiert — so liest sie die Disposition, und so
   steht sie später im Dienstplan. */
function nachTagen(positionen){
  const tage = new Map();
  positionen.forEach(p => {
    if(!tage.has(p.datum)) tage.set(p.datum, []);
    tage.get(p.datum).push(p);
  });
  return [...tage.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
}

function aufstellung(positionen){
  return nachTagen(positionen).map(([tag, liste]) => {
    const zeilen = liste.map(p =>
      `    ${String(p.anzahl).padStart(3, ' ')} × ${p.artName}   ${zeitspanne(p)}`
      + (p.hinweis ? `\n        ${p.hinweis}` : ''));
    return `  ${datumHuebsch(tag)}\n${zeilen.join('\n')}`;
  }).join('\n\n');
}

/* --- 1. An die Disposition ---------------------------------------------- */

function dispositionsText(v){
  const a = v.ansprechpartner || {};
  const asp = [t(a.vorname), t(a.nachname)].filter(Boolean).join(' ');
  const tage = nachTagen(v.positionen);

  return [
    'NEUE BESTANDSKUNDEN-ANFRAGE',
    '',
    `Anfragenummer   ${v.anfrage.anfragenummer}`,
    `Eingegangen     ${new Date(v.anfrage.eingegangen).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`,
    '',
    'KUNDE',
    `  Firma         ${t(v.kunde.firma)}`,
    `  Kundennummer  ${t(v.kunde.kundennummer)}`,
    asp ? `  Ansprechpartner ${asp}${a.position ? ' (' + t(a.position) + ')' : ''}` : '',
    `  Telefon       ${t(a.telefon) || t(v.kunde.telefon) || '—'}`,
    `  E-Mail        ${t(a.email) || t(v.kunde.email)}`,
    '',
    'EINSATZ',
    `  Projekt       ${t(v.projekt)}`,
    `  Einsatzort    ${t(v.einsatzort)}`,
    v.adresse ? `  Adresse       ${t(v.adresse)}` : '',
    `  Zeitraum      ${tage.length === 1
        ? datumHuebsch(tage[0][0])
        : datumHuebsch(tage[0][0]) + ' bis ' + datumHuebsch(tage[tage.length - 1][0])
          + ` (${tage.length} Tage)`}`,
    '',
    `PERSONAL  (${personenGesamt(v.positionen)} Einsätze in ${v.positionen.length} Positionen)`,
    '',
    aufstellung(v.positionen),
    '',
    v.hinweise ? 'HINWEISE ZUM EINSATZ\n' + t(v.hinweise).split('\n').map(z => '  ' + z).join('\n') + '\n' : '',
    '—',
    'Diese Anfrage wurde über den Bestandskundenbereich gestellt und ist',
    'unter ihrer Nummer gespeichert.'
  ].filter(z => z !== '').join('\n');
}

function dispositionsMail(v){
  const tage = nachTagen(v.positionen);
  const spanne = tage.length === 1
    ? datumHuebsch(tage[0][0]).replace(/^\w\w /, '')
    : datumHuebsch(tage[0][0]).replace(/^\w\w /, '') + '–' + datumHuebsch(tage[tage.length-1][0]).replace(/^\w\w /, '');
  return {
    subject: `[${v.anfrage.anfragenummer}] ${kopfsicher(v.kunde.firma)} · ${kopfsicher(v.projekt)} · ${spanne}`,
    text: dispositionsText(v)
  };
}

/* --- 2. An den Kunden ---------------------------------------------------- */

function kundenMail(v){
  const a = v.ansprechpartner || {};
  const anrede = t(a.vorname) ? `Hallo ${t(a.vorname)},` : 'Guten Tag,';
  return {
    subject: `Ihre Anfrage ${v.anfrage.anfragenummer} ist eingegangen`,
    text: [
      anrede,
      '',
      'vielen Dank. Ihre Anfrage liegt unserem Dispositionsteam vor.',
      '',
      `Anfragenummer   ${v.anfrage.anfragenummer}`,
      `Projekt         ${t(v.projekt)}`,
      `Einsatzort      ${t(v.einsatzort)}`,
      v.adresse ? `Adresse         ${t(v.adresse)}` : '',
      '',
      'IHR PERSONALBEDARF',
      '',
      aufstellung(v.positionen),
      '',
      v.hinweise ? 'Ihre Hinweise\n' + t(v.hinweise).split('\n').map(z => '  ' + z).join('\n') + '\n' : '',
      'Wir melden uns zeitnah bei Ihnen. Wenn es eilt, erreichen Sie uns',
      'montags bis freitags von 10 bis 17 Uhr unter +49 (40) 27075100.',
      '',
      'Herzliche Grüße',
      'HERM Service Team e.K.',
      'Gertigstraße 12–14 · 22303 Hamburg'
    ].filter(z => z !== '').join('\n')
  };
}

/* --- 3. Passwort zurücksetzen -------------------------------------------- */

function passwortMail(kunde, adresse, minuten){
  return {
    subject: 'Passwort für Ihren Kundenzugang zurücksetzen',
    text: [
      'Guten Tag,',
      '',
      'für Ihren Kundenzugang beim HERM Service Team wurde ein neues Passwort',
      'angefordert. Über diesen Link können Sie eines vergeben:',
      '',
      adresse,
      '',
      `Der Link gilt ${minuten} Minuten und lässt sich einmal verwenden.`,
      '',
      'Wenn Sie das nicht waren, brauchen Sie nichts zu tun — Ihr bisheriges',
      'Passwort bleibt gültig.',
      '',
      'Herzliche Grüße',
      'HERM Service Team e.K.'
    ].join('\n')
  };
}

/* --- Postausgang --------------------------------------------------------- */

/* Dieselben Zeitgrenzen wie in _vorgang.js, und aus demselben Grund: die
   Summe muss unter zehn Sekunden bleiben, das ist die Grenze auf Netlify. */
function kanal(){
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if(!host || !user || !pass) throw new Error('SMTP ist nicht eingerichtet');
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host, port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    connectionTimeout: 6000, greetingTimeout: 5000, socketTimeout: 7000
  });
}

function absender(){
  return process.env.MAIL_VON || process.env.SMTP_USER;
}

/** Der Empfänger der internen Nachricht — genau eine Stelle im ganzen
 *  Projekt. `ANFRAGE_MAIL_AN` ist die neue, ausdrückliche Variable;
 *  `MAIL_AN` bleibt der Rückfall, damit ein bestehender Aufbau ohne
 *  Nacharbeit weiterläuft. */
function empfaenger(){
  const an = process.env.ANFRAGE_MAIL_AN || process.env.MAIL_AN || '';
  return an.split(',').map(s => s.trim()).filter(Boolean);
}

async function verschicke(an, post){
  if(!an.length) throw new Error('kein Empfänger eingerichtet');
  const k = kanal();
  try {
    await k.sendMail({ from: absender(), to: an.join(', '), ...post });
  } finally {
    try { k.close(); } catch(e){}
  }
}

async function anDieDisposition(v){
  const an = empfaenger();
  const post = dispositionsMail(v);
  /* Antworten geht direkt an den Kunden — die Disposition muss die Adresse
     nicht heraussuchen. */
  const a = v.ansprechpartner || {};
  const zurueck = t(a.email) || t(v.kunde.email);
  await verschicke(an, zurueck ? { ...post, replyTo: kopfsicher(zurueck) } : post);
}

async function anDenKunden(v){
  const a = v.ansprechpartner || {};
  const an = [t(a.email) || t(v.kunde.email)].filter(Boolean);
  if(!an.length) return;
  await verschicke(an, kundenMail(v));
}

async function passwortLink(kunde, adresse, minuten){
  await verschicke([t(kunde.email)], passwortMail(kunde, adresse, minuten));
}

module.exports = {
  anDieDisposition, anDenKunden, passwortLink,
  /* für die Prüfskripte */
  dispositionsMail, kundenMail, passwortMail, aufstellung
};

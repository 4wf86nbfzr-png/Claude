#!/usr/bin/env node
/* ============================================================
   Eine Datei zum Weitergeben
   ------------------------------------------------------------
   Baut aus intern/abgleich.html, den Stilen, den Schriften und
   dem Programmcode EINE Datei:

       Schichtabgleich.html

   Die laesst sich per Mail verschicken, auf einen Stick legen
   oder ins Laufwerk stellen. Wer sie doppelklickt, hat das
   Werkzeug — ohne Installation, ohne Server, ohne Internet.

   Was darin vollstaendig funktioniert:
     Abgleichliste (PDF) lesen, Stundenzettel einlesen, Zuordnen,
     Abgleichen, Konflikte, Diktat (getippt), Ergebnisdatei.

   Was eine laufende Bruecke braucht:
     das automatische Eintragen in secplan, Fotos scannen,
     Morgenmail, Protokoll, Schnellerfassung.
   Findet die Datei eine Bruecke im Netz, benutzt sie sie.

       npm run bauen
   ============================================================ */
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { HIER, WURZEL } from './konfig.mjs';

const ZIEL = process.argv.includes('--ziel')
  ? process.argv[process.argv.indexOf('--ziel') + 1]
  : path.join(WURZEL, 'Schichtabgleich.html');

async function lies(...teile) {
  return readFile(path.join(WURZEL, ...teile), 'utf8');
}

async function alsDatenUrl(datei, art) {
  const roh = await readFile(path.join(WURZEL, datei));
  return `data:${art};base64,${roh.toString('base64')}`;
}

/* Nur die Latin-Schnitte: Umlaute und Eszett stecken darin, und
   die Datei bleibt bei rund einem halben Megabyte. */
const SCHRIFTEN = [
  ['bricolage-grotesque-var-latin.woff2', "'Bricolage Grotesque'", '200 800', 'normal'],
  ['instrument-sans-var-latin.woff2',     "'Instrument Sans'",     '400 700', 'normal'],
  ['space-mono-400-latin.woff2',          "'Space Mono'",          '400',     'normal'],
  ['space-mono-700-latin.woff2',          "'Space Mono'",          '700',     'normal']
];

async function schriftenCss() {
  const teile = [];
  for (const [datei, familie, gewicht, stil] of SCHRIFTEN) {
    const url = await alsDatenUrl(path.join('assets', 'fonts', datei), 'font/woff2');
    teile.push(`@font-face{font-family:${familie};font-style:${stil};font-weight:${gewicht};` +
               `font-display:swap;src:url(${url}) format('woff2');}`);
  }
  return teile.join('\n');
}

const gross = (n) => (n / 1024).toFixed(0) + ' KB';

async function bauen() {
  let html = await lies('intern', 'abgleich.html');

  const stile = [
    await schriftenCss(),
    await lies('assets', 'css', 'styles.css'),
    await lies('assets', 'css', 'intern.css')
  ].join('\n\n');

  let code = [
    await lies('assets', 'js', 'intern', 'pdf.js'),
    await lies('assets', 'js', 'intern', 'kern.js'),
    await lies('assets', 'js', 'intern', 'abgleich.js')
  ].join('\n;\n');

  /* Ein wortwoertliches "<script" im Code — und sei es in einem
     Kommentar — schaltet den HTML-Leser in einen anderen Zustand:
     das folgende "</script>" beendet den Block dann nicht mehr, der
     Rest der Seite wird zu Programmtext, und nichts laeuft. Ohne
     Fehlermeldung. Deshalb hier entschaerft. */
  code = code.replace(/<\/script/gi, '<\\/script').replace(/<script/gi, '<\\script');

  // Stile und Code hinein, Verweise nach draussen heraus
  html = html
    .replace(/<link rel="stylesheet"[^>]*>\s*/g, '')
    .replace(/<script src="[^"]*"><\/script>\s*/g, '')
    // Ersetzen mit einer Funktion, nicht mit einem String: in einem
    // String-Ersatz haben $$ , $& und $' eine Sonderbedeutung. Der Code
    // enthaelt $$( — daraus wuerde $( , und damit waere die
    // Hilfsfunktion $ im Ergebnis eine voellig andere. Das kostet
    // Stunden, weil die Seite still bleibt statt zu meckern.
    .replace('</head>', function () { return '<style>\n' + stile + '\n</style>\n</head>'; });

  // Das Logo ist als Bild 160 KB gross — als Wortmarke kostet es nichts.
  html = html.replace(
    /<img src="\.\.\/assets\/logo\/logo-herm\.png" alt="[^"]*" \/>/,
    '<span class="wz-kopf__wortmarke">HERM<br />SERVICE<br />TEAM</span>');

  const favicon = await alsDatenUrl(path.join('assets', 'logo', 'favicon.ico'), 'image/x-icon');
  html = html.replace(/href="\.\.\/assets\/logo\/favicon\.ico"/, `href="${favicon}"`)
             .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '');

  // Der Kopf verlinkt auf die Uebersichtsseite — die gibt es hier nicht.
  html = html.replace('<a class="wz-kopf__marke" href="index.html">', '<span class="wz-kopf__marke">')
             .replace('</a>\n\n    <div class="wz-knoepfe">', '</span>\n\n    <div class="wz-knoepfe">');

  const kopfzeile =
    `<!--\n  HERM Service Team — Schichtabgleich\n` +
    `  Eine Datei, alles darin. Gebaut am ${new Date().toLocaleString('de-DE')}.\n` +
    `  Erzeugt aus dem Projekt mit "npm run bauen" — nicht von Hand aendern,\n` +
    `  sonst ist die Aenderung beim naechsten Bauen weg.\n-->\n`;

  const stil = `
    .wz-kopf__wortmarke{
      font-family:var(--font-display); font-weight:800; font-size:.58rem;
      line-height:1.05; letter-spacing:.02em; text-transform:uppercase;
      border:1px solid var(--line); border-radius:4px; padding:4px 6px;
    }`;
  html = html.replace('</style>', function () { return stil + '\n</style>'; });

  html = html.replace(/<script>document\.documentElement\.classList\.remove\('kein-js'\);<\/script>/,
    "<script>document.documentElement.classList.remove('kein-js');window.HST_EINZELDATEI=true;</script>");

  // Und der Code selbst — ans Ende, wie die <script>-Verweise vorher auch.
  if (!html.includes('</body>')) throw new Error('In abgleich.html fehlt </body>.');
  html = html.replace('</body>', function () { return '<script>\n' + code + '\n</script>\n</body>'; });

  // Gegenprobe: ohne diese drei Namen ist die Datei eine leere Huelle.
  for (const noetig of ['HSTPdf', 'HSTAbgleich', 'sprachbefehlLesen']) {
    if (!html.includes(noetig)) throw new Error('Im Ergebnis fehlt ' + noetig + ' — nicht ausliefern.');
  }
  // Die beiden Hilfsfunktionen muessen unterscheidbar bleiben.
  if (!html.includes('var $$ = function')) {
    throw new Error('Im Ergebnis fehlt die Hilfsfunktion $$ — vermutlich hat eine ' +
      'String-Ersetzung sie zu $ gemacht. Nicht ausliefern.');
  }

  // Und genau ein Skriptblock mit Code, sauber geschlossen.
  const oeffnend = (html.match(/<script[\s>]/gi) || []).length;
  const schliessend = (html.match(/<\/script>/gi) || []).length;
  if (oeffnend !== schliessend) {
    throw new Error(`Skript-Tags unausgeglichen (${oeffnend} auf, ${schliessend} zu) — nicht ausliefern.`);
  }

  await writeFile(ZIEL, kopfzeile + html, 'utf8');
  const angaben = await stat(ZIEL);

  console.log('');
  console.log('  Gebaut: ' + ZIEL);
  console.log('  Groesse: ' + gross(angaben.size));
  console.log('');
  console.log('  Diese eine Datei kann weitergegeben werden — per Mail, Stick oder');
  console.log('  Laufwerk. Doppelklick genuegt, es wird nichts installiert.');
  console.log('');
}

bauen().catch((f) => { console.error('Bauen gescheitert: ' + f.message); process.exit(1); });

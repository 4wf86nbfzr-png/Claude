/**
 * Schaltet die Website zwischen Testbetrieb und Live-Betrieb um.
 *
 *   node tools/live-schalter.mjs            Stand anzeigen
 *   node tools/live-schalter.mjs live       Sperren lösen
 *   node tools/live-schalter.mjs test       Sperren wieder setzen
 *
 * Die Sperre gegen Suchmaschinen steht an drei Stellen: in jeder Seite als
 * <meta name="robots">, in robots.txt und als Header in netlify.toml. Von
 * Hand sind das sechzehn Änderungen — und genau eine davon vergisst man.
 *
 * `live` weigert sich, solange in Impressum oder Datenschutzerklärung noch
 * „bitte ergänzen" steht. Eine Seite ohne vollständiges Impressum online zu
 * stellen ist kein Schönheitsfehler, sondern abmahnfähig (§ 5 DDG). Wer
 * trotzdem umschalten will, hängt --trotzdem an; dann sagt das Skript, was
 * fehlt, und macht es.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const WURZEL = process.cwd();

const HTML_BLOCK = `<!-- ============================================================
     TESTBETRIEB — VOR DEM LIVE-GANG ENTFERNEN
     Diese Zeile haelt Suchmaschinen von der internen Vorschau fern.
     Solange sie hier steht, wird die Seite nicht indexiert.
     Zusaetzlich sperrt robots.txt und der Header X-Robots-Tag.
     ============================================================ -->
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet" />
`;

const ROBOTS_TEST = `# ============================================================
# TESTBETRIEB — VOR DEM LIVE-GANG ERSETZEN
# Solange diese Datei so aussieht, darf keine Suchmaschine
# irgendetwas von dieser Seite aufnehmen.
#
# Zum Umschalten: node tools/live-schalter.mjs live
# ============================================================
User-agent: *
Disallow: /
`;

const ROBOTS_LIVE = `# ============================================================
# HERM Service Team — Live-Betrieb
# Zurück in den Testbetrieb: node tools/live-schalter.mjs test
# ============================================================
User-agent: *
Allow: /
Disallow: /404.html

Sitemap: https://hermserviceteam.com/sitemap.xml
`;

const TOML_TEST = `    # ---- TESTBETRIEB: hält Suchmaschinen fern ----
    # Gesetzt und entfernt von tools/live-schalter.mjs.
    X-Robots-Tag = "noindex, nofollow, noarchive, nosnippet"

`;

function seiten() {
  const aus = [];
  for (const e of readdirSync(WURZEL)) if (e.endsWith('.html')) aus.push(e);
  for (const e of readdirSync(path.join(WURZEL, 'dienstleistungen'))) {
    if (e.endsWith('.html')) aus.push(path.join('dienstleistungen', e));
  }
  return aus.sort();
}

/* Die Rechtstexte stehen mit Entitäten im Markup (&auml; statt ä), damit sie
   auch ohne korrekte Zeichensatzangabe richtig ankommen. Für die Ausgabe hier
   werden die paar vorkommenden wieder zu Buchstaben. */
const ENTITAETEN = {
  '&auml;': 'ä', '&ouml;': 'ö', '&uuml;': 'ü', '&Auml;': 'Ä', '&Ouml;': 'Ö',
  '&Uuml;': 'Ü', '&szlig;': 'ß', '&amp;': '&', '&nbsp;': ' ', '&sect;': '§',
};
const entschluesseln = (t) => t.replace(/&[A-Za-z]+;/g, (e) => ENTITAETEN[e] ?? e);

/* Sucht in den Rechtstexten nach den Stellen, die noch niemand ausgefüllt hat.
   Die Markierung steht im Markup als <span class="offen">bitte ergänzen</span>. */
async function offeneStellen() {
  const offen = [];
  for (const datei of ['impressum.html', 'datenschutz.html']) {
    const text = await readFile(path.join(WURZEL, datei), 'utf8');
    const treffer = [...text.matchAll(/<h2>([^<]{0,80})<\/h2>(?:(?!<h2>)[\s\S]){0,900}?bitte erg(?:&auml;|ä)nzen/g)];
    for (const t of treffer) offen.push(`${datei}: ${entschluesseln(t[1]).trim()}`);
    const gesamt = (text.match(/bitte erg(?:&auml;|ä)nzen/g) ?? []).length;
    if (gesamt > treffer.length) offen.push(`${datei}: ${gesamt - treffer.length} weitere Stelle(n)`);
  }
  return offen;
}

async function stand() {
  const liste = seiten();
  let gesperrt = 0;
  for (const s of liste) {
    if ((await readFile(path.join(WURZEL, s), 'utf8')).includes('name="robots" content="noindex')) gesperrt += 1;
  }
  const robots = (await readFile(path.join(WURZEL, 'robots.txt'), 'utf8')).includes('Disallow: /\n');
  const toml = (await readFile(path.join(WURZEL, 'netlify.toml'), 'utf8')).includes('X-Robots-Tag');
  return { liste, gesperrt, robots, toml };
}

async function schalten(nachLive) {
  const { liste } = await stand();
  let seitenGeaendert = 0;

  for (const s of liste) {
    const pfad = path.join(WURZEL, s);
    const alt = await readFile(pfad, 'utf8');
    let neu = alt;
    if (nachLive) {
      neu = alt.replace(/<!-- =+\n\s+TESTBETRIEB[\s\S]*?-->\n<meta name="robots" content="noindex[^>]*>\n/, '');
    } else if (!alt.includes('name="robots" content="noindex')) {
      // Direkt vor die kanonische Adresse setzen — dort stand der Block vorher.
      neu = alt.replace(/(<link rel="canonical")/, `${HTML_BLOCK}$1`);
    }
    if (neu !== alt) { await writeFile(pfad, neu); seitenGeaendert += 1; }
  }

  await writeFile(path.join(WURZEL, 'robots.txt'), nachLive ? ROBOTS_LIVE : ROBOTS_TEST);

  const tomlPfad = path.join(WURZEL, 'netlify.toml');
  const alt = await readFile(tomlPfad, 'utf8');
  let toml = alt.replace(/ *# ---- TESTBETRIEB[\s\S]*?X-Robots-Tag = "[^"]*"\n\n?/, '');
  if (!nachLive) toml = toml.replace(/( *# ---- Sicherheit ----\n)/, `${TOML_TEST}$1`);
  if (toml !== alt) await writeFile(tomlPfad, toml);

  return seitenGeaendert;
}

async function main() {
  const befehl = process.argv[2] ?? 'status';
  const trotzdem = process.argv.includes('--trotzdem');
  const s = await stand();
  const offen = await offeneStellen();

  if (befehl === 'status') {
    console.log(`Seiten mit noindex : ${s.gesperrt} von ${s.liste.length}`);
    console.log(`robots.txt         : ${s.robots ? 'gesperrt' : 'frei'}`);
    console.log(`netlify.toml        : ${s.toml ? 'X-Robots-Tag gesetzt' : 'kein X-Robots-Tag'}`);
    const live = s.gesperrt === 0 && !s.robots && !s.toml;
    const test = s.gesperrt === s.liste.length && s.robots && s.toml;
    console.log(`\nStand: ${live ? 'LIVE' : test ? 'TESTBETRIEB' : 'GEMISCHT — bitte einmal umschalten'}`);
    if (offen.length) {
      console.log(`\nNoch offen in den Rechtstexten (blockiert „live"):`);
      offen.forEach((o) => console.log(`  · ${o}`));
    } else {
      console.log('\nRechtstexte: keine offenen Stellen.');
    }
    return;
  }

  if (befehl !== 'live' && befehl !== 'test') {
    console.error('Unbekannter Befehl. Erlaubt: status, live, test.');
    process.exit(2);
  }

  if (befehl === 'live' && offen.length && !trotzdem) {
    console.error('Nicht umgeschaltet: Impressum und Datenschutzerklärung sind unvollständig.');
    offen.forEach((o) => console.error(`  · ${o}`));
    console.error('\nEine Seite ohne vollständiges Impressum online zu stellen ist abmahnfähig (§ 5 DDG).');
    console.error('Beide Texte gehören außerdem vor dem Start anwaltlich geprüft.');
    console.error('Wenn das bewusst so sein soll: node tools/live-schalter.mjs live --trotzdem');
    process.exit(1);
  }
  if (befehl === 'live' && offen.length) {
    console.warn('Achtung: wird trotz offener Stellen umgeschaltet —');
    offen.forEach((o) => console.warn(`  · ${o}`));
  }

  const n = await schalten(befehl === 'live');
  console.log(`${befehl === 'live' ? 'Live' : 'Testbetrieb'}: ${n} Seiten geändert, robots.txt und netlify.toml nachgezogen.`);
  if (befehl === 'live') {
    console.log('\nWas das Skript nicht kann und noch von Hand kommt:');
    console.log('  · Domain in Netlify verbinden');
    console.log('  · Passwortschutz der Vorschau aufheben');
    console.log('  · sitemap.xml in der Search Console einreichen');
    console.log('  · Formularbenachrichtigungen setzen (Anfragen -> dispo@, Bewerbungen -> info@)');
  }
}

main();

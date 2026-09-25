/**
 * Prüft die ganze Website in echtem Chromium.
 *
 *   node tools/pruefe-website.mjs [basis-url]
 *
 * Ohne Adresse wird ein eigener Server auf einem freien Port gestartet.
 * Geprüft wird, was sich nur im Browser prüfen lässt:
 *
 *   * Lädt jede Seite ohne Konsolenfehler und ohne fehlende Datei?
 *   * Zeigt jedes Bild wirklich etwas (naturalWidth > 0)?
 *   * Führt jeder interne Link irgendwohin, jede Sprungmarke zu einem Ziel?
 *   * Hat jeder Link und jeder Knopf einen zugänglichen Namen?
 *   * Läuft die Seite bei 320 px ohne waagerechten Überlauf?
 *   * Steht auf jeder Seite genau eine H1?
 *
 * Das Skript liegt im Repo, weil eine Prüfung, die nur einmal vor der
 * Übergabe lief, nach der ersten Änderung nichts mehr wert ist.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
/*
  Die Website selbst braucht keine Abhängigkeiten – das ist Absicht und
  soll so bleiben. Playwright wird deshalb dort gesucht, wo es im Projekt
  ohnehin liegt (beim Planer), und sonst global.
*/
async function ladePlaywright() {
  const orte = [
    path.join(WURZEL, 'hst-planer', 'node_modules', 'playwright-core', 'index.js'),
    path.join(WURZEL, 'node_modules', 'playwright-core', 'index.js'),
  ];
  for (const ort of orte) {
    if (existsSync(ort)) return (await import(pathToFileURL(ort).href)).default ?? await import(pathToFileURL(ort).href);
  }
  try {
    return await import('playwright-core');
  } catch {
    console.error(
      'playwright-core nicht gefunden.\n'
      + 'Es liegt normalerweise unter hst-planer/node_modules – dort einmal `npm install` laufen lassen.\n'
      + 'Die Website selbst braucht es nicht; nur diese Prüfung.',
    );
    process.exit(2);
  }
}

const WURZEL = process.cwd();
const BREITEN = [320, 390, 768, 1280, 1440];

const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.vtt': 'text/vtt',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

/** Kleiner statischer Server – die Seite ist statisch, mehr braucht sie nicht. */
function starteServer() {
  return new Promise((fertig) => {
    const server = createServer(async (anfrage, antwort) => {
      const pfad = decodeURIComponent((anfrage.url ?? '/').split('?')[0]);
      let datei = path.join(WURZEL, pfad);
      if (pfad.endsWith('/')) datei = path.join(datei, 'index.html');
      // Kein Ausbrechen aus dem Projektordner.
      if (!datei.startsWith(WURZEL)) { antwort.writeHead(403).end(); return; }
      try {
        const info = await stat(datei);
        if (info.isDirectory()) datei = path.join(datei, 'index.html');
        const inhalt = await readFile(datei);
        antwort.writeHead(200, { 'content-type': TYPEN[path.extname(datei).toLowerCase()] ?? 'application/octet-stream' });
        antwort.end(inhalt);
      } catch {
        antwort.writeHead(404, { 'content-type': 'text/plain' }).end('404');
      }
    });
    server.listen(0, '127.0.0.1', () => fertig({ server, port: server.address().port }));
  });
}

async function starteBrowser() {
  const { chromium } = await ladePlaywright();
  const wurzel = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (wurzel && existsSync(wurzel)) {
    const kandidaten = readdirSync(wurzel)
      .filter((e) => e.startsWith('chromium'))
      .flatMap((e) => [
        path.join(wurzel, e, 'chrome-linux', 'chrome'),
        path.join(wurzel, e, 'chrome-linux', 'headless_shell'),
      ])
      .filter((d) => existsSync(d));
    if (kandidaten[0]) return chromium.launch({ executablePath: kandidaten[0] });
  }
  return chromium.launch();
}

/** Alle HTML-Seiten im Projekt, ohne den Planer. */
function seiten() {
  const aus = [];
  for (const eintrag of readdirSync(WURZEL)) {
    if (eintrag.endsWith('.html')) aus.push(`/${eintrag}`);
  }
  for (const eintrag of readdirSync(path.join(WURZEL, 'dienstleistungen'))) {
    if (eintrag.endsWith('.html')) aus.push(`/dienstleistungen/${eintrag}`);
  }
  return aus.sort();
}

async function main() {
  const vorgegeben = process.argv[2];
  const { server, port } = vorgegeben ? { server: null, port: 0 } : await starteServer();
  const basis = vorgegeben ?? `http://127.0.0.1:${port}`;

  const browser = await starteBrowser();
  const liste = seiten();
  const maengel = [];
  let geprueft = 0;

  console.log(`${liste.length} Seiten auf ${basis}\n`);

  for (const pfad of liste) {
    const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
    const seite = await kontext.newPage();

    const konsole = [];
    const fehlend = [];
    seite.on('console', (m) => { if (m.type() === 'error') konsole.push(m.text()); });
    seite.on('pageerror', (e) => konsole.push(`pageerror: ${e.message}`));
    seite.on('requestfailed', (r) => fehlend.push(`${r.url()} (${r.failure()?.errorText})`));
    seite.on('response', (r) => { if (r.status() >= 400) fehlend.push(`${r.url()} → HTTP ${r.status()}`); });

    await seite.goto(`${basis}${pfad}`, { waitUntil: 'load', timeout: 30_000 });
    // Bilder mit loading="lazy" sonst nie geladen.
    await seite.evaluate(() => {
      document.querySelectorAll('img').forEach((b) => b.setAttribute('loading', 'eager'));
    });
    await seite.waitForTimeout(900);

    const befund = await seite.evaluate(() => {
      const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

      /*
        Bilder, die nichts zeigen.

        Nicht gezählt werden Bilder ohne src in einem geschlossenen
        <dialog> – die Lightbox bekommt ihre Quelle erst beim Öffnen,
        und ein leeres src würde den Browser die Seite selbst noch
        einmal anfordern lassen.
      */
      const bilder = [...document.querySelectorAll('img')]
        .filter((b) => {
          if (b.naturalWidth > 0) return false;
          const dialog = b.closest('dialog');
          if (dialog && !dialog.open && !b.hasAttribute('src')) return false;
          return true;
        })
        .map((b) => b.getAttribute('src') ?? '(ohne src)');

      // Bilder ohne Alternativtext (leeres alt ist bei Schmuck richtig,
      // ein fehlendes Attribut nie).
      const ohneAlt = [...document.querySelectorAll('img')]
        .filter((b) => !b.hasAttribute('alt'))
        .map((b) => b.getAttribute('src') ?? '(ohne src)');

      // Links und Knöpfe ohne zugänglichen Namen.
      const namenlos = [...document.querySelectorAll('a[href], button')]
        .filter((el) => {
          if (el.closest('[hidden]') || el.getAttribute('aria-hidden') === 'true') return false;
          const name = text(el) || el.getAttribute('aria-label') || el.getAttribute('title')
            || [...el.querySelectorAll('img')].map((b) => b.getAttribute('alt')).join(' ').trim();
          return !name;
        })
        .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('href') ?? el.className}]`);

      // Interne Ziele und Sprungmarken.
      const ziele = [...document.querySelectorAll('a[href]')]
        .map((a) => a.getAttribute('href'))
        .filter((h) => h && !/^(https?:|mailto:|tel:|#$)/.test(h));
      const marken = ziele.filter((h) => h.startsWith('#'))
        .filter((h) => !document.querySelector(`[id="${CSS.escape(h.slice(1))}"]`));

      const h1 = document.querySelectorAll('h1').length;
      const titel = document.title;

      return {
        bilder, ohneAlt, namenlos, marken, h1, titel,
        anzahlBilder: document.querySelectorAll('img').length,
        anzahlLinks: document.querySelectorAll('a[href]').length,
        ziele: [...new Set(ziele.filter((h) => !h.startsWith('#')))],
      };
    });

    // Waagerechter Überlauf über alle Breiten.
    const ueberlauf = [];
    for (const breite of BREITEN) {
      await seite.setViewportSize({ width: breite, height: 900 });
      await seite.waitForTimeout(220);
      const zuBreit = await seite.evaluate(() =>
        Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth));
      if (zuBreit > 1) ueberlauf.push(`${breite} px: ${zuBreit} px zu breit`);
    }

    // Interne Ziele wirklich abrufen.
    const tote = [];
    for (const ziel of befund.ziele) {
      const adresse = new URL(ziel, `${basis}${pfad}`).toString();
      if (!adresse.startsWith(basis)) continue;
      const antwort = await kontext.request.get(adresse).catch(() => null);
      if (!antwort || antwort.status() >= 400) tote.push(`${ziel} → ${antwort ? antwort.status() : 'nicht erreichbar'}`);
    }

    const probleme = [];
    if (konsole.length) probleme.push(`Konsolenfehler: ${konsole.join(' | ')}`);
    if (fehlend.length) probleme.push(`Fehlende Dateien: ${[...new Set(fehlend)].join(' | ')}`);
    if (befund.bilder.length) probleme.push(`Bilder ohne Inhalt: ${befund.bilder.join(', ')}`);
    if (befund.ohneAlt.length) probleme.push(`Bilder ohne alt-Attribut: ${befund.ohneAlt.join(', ')}`);
    if (befund.namenlos.length) probleme.push(`Ohne zugänglichen Namen: ${befund.namenlos.join(', ')}`);
    if (befund.marken.length) probleme.push(`Sprungmarken ins Leere: ${befund.marken.join(', ')}`);
    if (tote.length) probleme.push(`Tote Links: ${tote.join(', ')}`);
    if (ueberlauf.length) probleme.push(`Überlauf: ${ueberlauf.join(', ')}`);
    if (befund.h1 !== 1) probleme.push(`${befund.h1} H1-Überschriften (genau eine gehört auf eine Seite)`);
    if (!befund.titel || befund.titel.length < 10) probleme.push(`Titel zu kurz: „${befund.titel}"`);

    geprueft += 1;
    if (probleme.length === 0) {
      console.log(`  ok   ${pfad.padEnd(38)} ${befund.anzahlLinks} Links, ${befund.anzahlBilder} Bilder`);
    } else {
      console.log(`  FEHL ${pfad}`);
      for (const p of probleme) console.log(`         · ${p}`);
      maengel.push({ pfad, probleme });
    }

    await kontext.close();
  }

  await browser.close();
  server?.close();

  console.log(`\n${geprueft} Seiten geprüft.`);
  if (maengel.length === 0) {
    console.log('Keine Mängel.');
  } else {
    console.log(`${maengel.length} Seiten mit Mängeln.`);
    process.exit(1);
  }
}

main().catch((f) => { console.error(f); process.exit(1); });

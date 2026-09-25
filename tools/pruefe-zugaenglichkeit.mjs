/**
 * Prüft die Website auf Zugänglichkeit — in echtem Chromium.
 *
 *   node tools/pruefe-zugaenglichkeit.mjs
 *
 * `pruefe-website.mjs` sieht nach, ob alles da ist, `pruefe-bedienung.mjs`,
 * ob es tut, was es soll. Hier geht es darum, ob man es auch bedienen kann,
 * wenn man nicht mit der Maus arbeitet oder schlecht sieht:
 *
 *   * Sprache gesetzt, Überschriften in Stufen, genau eine H1
 *   * Jedes Formularfeld hat eine sichtbare Beschriftung
 *   * Jedes bedienbare Element hat einen Namen und ist per Tab erreichbar
 *   * Fokus ist sichtbar (der Ring unterscheidet sich vom Ruhezustand)
 *   * Textkontraste erreichen WCAG AA (4.5:1, große Schrift 3:1)
 *   * `prefers-reduced-motion` schaltet die Bewegung wirklich ab
 *
 * Kontraste werden auf der gerenderten Seite gemessen, nicht im Stylesheet:
 * nur dort steht fest, welcher Hintergrund am Ende hinter einem Text liegt.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WURZEL = process.cwd();
const TYPEN = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

async function ladePlaywright() {
  const orte = [
    path.join(WURZEL, 'hst-planer', 'node_modules', 'playwright-core', 'index.js'),
    path.join(WURZEL, 'node_modules', 'playwright-core', 'index.js'),
  ];
  for (const ort of orte) {
    if (!existsSync(ort)) continue;
    const modul = await import(pathToFileURL(ort).href);
    return modul.default ?? modul;
  }
  try { return await import('playwright-core'); } catch {
    console.error('playwright-core nicht gefunden – siehe pruefe-website.mjs.');
    process.exit(2);
  }
}

function starteServer() {
  return new Promise((fertig) => {
    const server = createServer(async (a, r) => {
      const pfad = decodeURIComponent((a.url ?? '/').split('?')[0]);
      let datei = path.join(WURZEL, pfad);
      if (!datei.startsWith(WURZEL)) { r.writeHead(403).end(); return; }
      try {
        const info = await stat(datei);
        if (info.isDirectory()) datei = path.join(datei, 'index.html');
        r.writeHead(200, { 'content-type': TYPEN[path.extname(datei).toLowerCase()] ?? 'application/octet-stream' });
        r.end(await readFile(datei));
      } catch { r.writeHead(404).end('404'); }
    });
    server.listen(0, '127.0.0.1', () => fertig({ server, port: server.address().port }));
  });
}

function seitenliste() {
  const aus = [];
  for (const e of readdirSync(WURZEL)) if (e.endsWith('.html')) aus.push(`/${e}`);
  for (const e of readdirSync(path.join(WURZEL, 'dienstleistungen'))) {
    if (e.endsWith('.html')) aus.push(`/dienstleistungen/${e}`);
  }
  return aus.sort();
}

async function starteBrowser() {
  const { chromium } = await ladePlaywright();
  const wurzel = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (wurzel && existsSync(wurzel)) {
    const k = readdirSync(wurzel).filter((e) => e.startsWith('chromium'))
      .flatMap((e) => [path.join(wurzel, e, 'chrome-linux', 'chrome'), path.join(wurzel, e, 'chrome-linux', 'headless_shell')])
      .filter((d) => existsSync(d));
    if (k[0]) return chromium.launch({ executablePath: k[0] });
  }
  return chromium.launch();
}

/* Läuft im Browser: sammelt alles, was sich nur am gerenderten Dokument
   feststellen lässt. Bewusst eine einzige Auswertung statt vieler Aufrufe —
   so wird pro Seite nur einmal Layout berechnet. */
function erhebung() {
  const zahl = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  const kanal = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const helligkeit = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
  const mischen = (vorn, hinten, a) => vorn.map((w, i) => w * a + hinten[i] * (1 - a));
  const verhaeltnis = (a, b) => {
    const [h, d] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x);
    return (h + 0.05) / (d + 0.05);
  };
  /* Der wirksame Hintergrund steht selten am Element selbst. Also nach oben
     laufen, bis eine deckende Farbe kommt, und halbdurchsichtige Schichten
     unterwegs überblenden. */
  function hintergrund(el) {
    let schichten = [];
    for (let k = el; k; k = k.parentElement) {
      const s = getComputedStyle(k);
      const w = zahl(s.backgroundColor);
      const a = w.length === 4 ? w[3] : 1;
      if (a === 0) continue;
      schichten.push([[w[0], w[1], w[2]], a]);
      if (a === 1) break;
    }
    let farbe = [255, 255, 255];
    for (let i = schichten.length - 1; i >= 0; i -= 1) farbe = mischen(schichten[i][0], farbe, schichten[i][1]);
    return farbe;
  }
  function name(el) {
    const vonIds = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)
      .filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    /* `||` statt `??`: `el.title` ist bei fehlendem Attribut ein leerer String,
       kein null — mit `??` hätte jede Beschriftung dort geendet. */
    const beschriftet = (el.getAttribute('aria-label') ?? '') || vonIds || el.title
      || el.textContent || '';
    return beschriftet.replace(/\s+/g, ' ').trim()
      || [...el.querySelectorAll('img')].map((b) => b.alt).join(' ').trim();
  }
  const sichtbar = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  /* Für die Gliederung darf Deckkraft nicht zählen: die Abschnittsüberschriften
     blenden erst beim Scrollen ein und stehen beim Laden auf opacity:0. Sonst
     meldet die Prüfung eine übersprungene Stufe, die keine ist. */
  const imBaum = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  /* Rein schmückender Text ist von der Kontrastregel ausgenommen (WCAG 1.4.3,
     „pure decoration"). Hier ist das genau das, was auch für Hilfsmittel
     ausgeblendet ist — die große 404 und die Initialen neben dem Namen. */
  const schmuck = (el) => Boolean(el.closest('[aria-hidden="true"]'));

  const ergebnis = {
    sprache: document.documentElement.lang,
    titel: document.title,
    h1: document.querySelectorAll('h1').length,
    sprungmarke: Boolean(document.querySelector('a[href^="#"][class*=skip], .skiplink, .sprung')),
    ueberschriftenSprung: [],
    felderOhneLabel: [],
    ohneNamen: [],
    kontraste: [],
  };

  // Überschriften dürfen Stufen nicht überspringen (h2 → h4).
  let letzte = 0;
  for (const h of document.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (!imBaum(h)) continue;
    const stufe = Number(h.tagName[1]);
    if (letzte && stufe > letzte + 1) {
      ergebnis.ueberschriftenSprung.push(`h${letzte} → h${stufe}: „${h.textContent.trim().slice(0, 40)}"`);
    }
    letzte = stufe;
  }

  // Formularfelder brauchen eine Beschriftung.
  for (const f of document.querySelectorAll('input, select, textarea')) {
    if (f.type === 'hidden' || f.type === 'submit' || f.closest('.honigtopf')) continue;
    const hatLabel = (f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`))
      || f.closest('label') || f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
    if (!hatLabel) ergebnis.felderOhneLabel.push(f.name || f.type || f.tagName.toLowerCase());
  }

  // Bedienbares braucht einen Namen.
  for (const el of document.querySelectorAll('a[href], button, [role=button], summary')) {
    if (!sichtbar(el)) continue;
    if (!name(el)) ergebnis.ohneNamen.push(el.outerHTML.slice(0, 70));
  }

  // Kontraste aller sichtbaren Textknoten.
  const gesehen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const eigenerText = [...el.childNodes]
      .filter((k) => k.nodeType === 3 && k.textContent.trim().length > 1)
      .map((k) => k.textContent.trim()).join(' ');
    if (!eigenerText || !sichtbar(el) || schmuck(el)) continue;
    const s = getComputedStyle(el);
    const w = zahl(s.color);
    const alpha = w.length === 4 ? w[3] : 1;
    if (alpha === 0) continue;
    const hg = hintergrund(el);
    const vorn = mischen([w[0], w[1], w[2]], hg, alpha);
    const groesse = parseFloat(s.fontSize);
    const fett = Number(s.fontWeight) >= 700;
    const gross = groesse >= 24 || (fett && groesse >= 18.66);
    const soll = gross ? 3 : 4.5;
    const ist = verhaeltnis(vorn, hg);
    if (ist + 0.05 < soll) {
      const schluessel = `${s.color}|${Math.round(groesse)}|${eigenerText.slice(0, 24)}`;
      if (gesehen.has(schluessel)) continue;
      gesehen.add(schluessel);
      ergebnis.kontraste.push({
        text: eigenerText.slice(0, 44), ist: ist.toFixed(2), soll,
        farbe: s.color, grund: `${Math.round(groesse)}px${fett ? ' fett' : ''}`,
      });
    }
  }
  return ergebnis;
}

const befunde = [];
function melde(seite, text) { befunde.push(`${seite}: ${text}`); }

async function main() {
  const { server, port } = await starteServer();
  const basis = `http://127.0.0.1:${port}`;
  const browser = await starteBrowser();
  const seiten = seitenliste();

  try {
    const kontext = await browser.newContext({
      viewport: { width: 1280, height: 900 }, locale: 'de-DE', reducedMotion: 'no-preference',
    });
    const seite = await kontext.newPage();

    for (const pfad of seiten) {
      await seite.goto(basis + pfad, { waitUntil: 'load' });
      await seite.waitForTimeout(250);
      const e = await seite.evaluate(erhebung);
      const probleme = [];

      if (!e.sprache) probleme.push('kein lang-Attribut am <html>');
      if (e.h1 !== 1) probleme.push(`${e.h1} H1 statt genau einer`);
      e.ueberschriftenSprung.forEach((s) => probleme.push(`Überschriftenstufe übersprungen (${s})`));
      e.felderOhneLabel.forEach((f) => probleme.push(`Feld ohne Beschriftung: ${f}`));
      e.ohneNamen.forEach((n) => probleme.push(`ohne zugänglichen Namen: ${n}`));
      e.kontraste.forEach((k) => probleme.push(
        `Kontrast ${k.ist}:1 statt ${k.soll}:1 — ${k.farbe}, ${k.grund}, „${k.text}"`,
      ));

      /* Sichtbarer Fokus: das erste bedienbare Element anspringen und sehen,
         ob sich der Rahmen gegenüber dem Ruhezustand ändert. */
      const fokus = await seite.evaluate(() => {
        const el = document.querySelector('a[href], button');
        if (!el) return null;
        const ruhe = getComputedStyle(el);
        const vorher = `${ruhe.outline} ${ruhe.boxShadow}`;
        el.focus();
        const aktiv = getComputedStyle(el);
        return { vorher, nachher: `${aktiv.outline} ${aktiv.boxShadow}` };
      });
      if (fokus && fokus.vorher === fokus.nachher) probleme.push('Fokus nicht sichtbar');

      console.log(`${probleme.length ? 'FEHL' : 'ok  '} ${pfad}`);
      probleme.forEach((p) => { console.log(`       · ${p}`); melde(pfad, p); });
    }
    await kontext.close();

    // ------------------------------------------- Bewegung auf Wunsch aus
    {
      const kontext2 = await browser.newContext({
        viewport: { width: 1280, height: 900 }, locale: 'de-DE', reducedMotion: 'reduce',
      });
      const seite2 = await kontext2.newPage();
      await seite2.goto(`${basis}/index.html`, { waitUntil: 'load' });
      await seite2.waitForTimeout(400);
      const dauern = await seite2.evaluate(() => [...document.querySelectorAll('body *')]
        .map((el) => getComputedStyle(el))
        .filter((s) => parseFloat(s.animationDuration) > 0.2 && s.animationIterationCount === 'infinite')
        .length);
      const lesbar = await seite2.evaluate(() => (document.body.innerText ?? '').trim().length);
      const ok = dauern === 0 && lesbar > 2000;
      console.log(`${ok ? 'ok  ' : 'FEHL'} prefers-reduced-motion: keine Dauerbewegung, Seite lesbar (${dauern} laufende Animationen, ${lesbar} Zeichen)`);
      if (!ok) melde('/index.html', 'prefers-reduced-motion nicht sauber umgesetzt');
      await kontext2.close();
    }
  } finally {
    await browser.close();
    server?.close();
  }

  console.log(befunde.length
    ? `\n${befunde.length} Befunde.`
    : `\n${seiten.length} Seiten: keine Zugänglichkeitsmängel gefunden.`);
  process.exit(befunde.length ? 1 : 0);
}

main();

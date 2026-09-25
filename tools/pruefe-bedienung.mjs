/**
 * Prüft die Bedienung der Website in echtem Chromium.
 *
 *   node tools/pruefe-bedienung.mjs
 *
 * `pruefe-website.mjs` sieht nach, ob alles da ist. Hier geht es darum,
 * ob es auch tut, was es soll: Formulare, Lightbox, mobiles Menü, der
 * Bühnen-Effekt beim Scrollen, der Top-Knopf.
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
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.vtt': 'text/vtt', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
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

const befunde = [];
function pruefe(name, bedingung, zusatz = '') {
  console.log(`  ${bedingung ? 'ok  ' : 'FEHL'} ${name}${zusatz ? ` — ${zusatz}` : ''}`);
  if (!bedingung) befunde.push(name);
}

async function main() {
  const { server, port } = await starteServer();
  const basis = `http://127.0.0.1:${port}`;
  const browser = await starteBrowser();

  try {
    // ---------------------------------------------------- Kontaktformular
    {
      const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/kontakt.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(400);
      console.log('\nKontaktformular');

      // Leer absenden: Fehler an den Pflichtfeldern, nichts geht raus.
      await seite.click('form[data-formular] button[type="submit"]');
      await seite.waitForTimeout(300);
      const fehlerfelder = await seite.$$eval('.feld--fehler', (e) => e.length);
      const meldung = await seite.$eval('.form__status', (e) => e.textContent.trim());
      pruefe('Leeres Formular wird abgewiesen', fehlerfelder > 0 && meldung.includes('prüfen'),
        `${fehlerfelder} Felder markiert`);

      // Die Meldung nennt das Problem, nicht nur „ungültig".
      const ersteMeldung = await seite.$eval('.feld--fehler .feld__fehler', (e) => e.textContent.trim());
      pruefe('Fehlermeldung sagt, was zu tun ist', ersteMeldung.length > 8, `„${ersteMeldung}"`);

      // E-Mail-Prüfung.
      const mailfeld = await seite.$('input[type="email"]');
      if (mailfeld) {
        await mailfeld.fill('keine-adresse');
        await mailfeld.evaluate((e) => e.blur());
        await seite.waitForTimeout(200);
        const mailMeldung = await seite.evaluate(() => {
          const f = document.querySelector('input[type="email"]');
          const h = f.closest('.feld');
          return h?.querySelector('.feld__fehler')?.textContent.trim() ?? '';
        });
        pruefe('Ungültige E-Mail wird erklärt', mailMeldung.includes('@') || mailMeldung.includes('gültige'),
          `„${mailMeldung}"`);

        // Und verschwindet beim Korrigieren wieder.
        await mailfeld.fill('moin@example.org');
        await seite.waitForTimeout(200);
        const weg = await seite.evaluate(() => {
          const f = document.querySelector('input[type="email"]');
          return !f.closest('.feld')?.classList.contains('feld--fehler');
        });
        pruefe('Fehler verschwindet beim Korrigieren', weg);
      }

      await kontext.close();
    }

    // ------------------------------------------------- Honigtopf und Zeit
    {
      const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/kontakt.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(300);
      console.log('\nSpam-Schutz');

      // Honigtopf gefüllt: der Bot bekommt ein Danke, aber nichts geht raus.
      await seite.evaluate(() => {
        const h = document.querySelector('.honigtopf input');
        if (h) h.value = 'Maschinen GmbH';
      });
      await seite.click('form[data-formular] button[type="submit"]');
      await seite.waitForTimeout(300);
      /* `window.location.href` lässt sich in Chromium nicht abfangen (eigene,
         nicht überschreibbare Eigenschaft von `location`). Statt der mailto-URL
         prüfen wir deshalb die Spur, die der Mail-Weg im Dokument hinterlässt:
         seine Statusmeldung nennt den Empfänger. Beim Honigtopf darf genau
         diese Meldung nicht auftauchen — der Bot bekommt nur ein Danke. */
      const gedankt = await seite.$('.danke');
      const seite_text = await seite.evaluate(() => document.body.textContent ?? '');
      pruefe('Honigtopf: Danke ohne Versand',
        Boolean(gedankt) && !seite_text.includes('E-Mail-Programm'));

      await kontext.close();
    }

    {
      const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/kontakt.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(300);

      // Alles korrekt ausfüllen und sofort absenden.
      await seite.evaluate(() => {
        const form = document.querySelector('form[data-formular]');
        form.querySelectorAll('input, select, textarea').forEach((f) => {
          if (f.closest('.honigtopf') || f.type === 'submit') return;
          if (f.type === 'checkbox') { f.checked = true; return; }
          if (f.tagName === 'SELECT') { if (f.options.length > 1) f.selectedIndex = 1; return; }
          if (f.type === 'email') { f.value = 'moin@example.org'; return; }
          if (f.type === 'tel') { f.value = '040 27075100'; return; }
          f.value = 'Testeintrag für die Prüfung der Formularstrecke.';
        });
      });
      await seite.click('form[data-formular] button[type="submit"]');
      await seite.waitForTimeout(300);
      const nachfrage = await seite.$eval('.form__status', (e) => e.textContent.trim());
      pruefe('Zu schnelles Absenden fragt nach, statt wegzuwerfen',
        nachfrage.includes('schnell') && !(await seite.$('.danke')), `„${nachfrage}"`);

      // Zweiter Klick: jetzt geht es raus.
      await seite.click('form[data-formular] button[type="submit"]');
      await seite.waitForTimeout(500);
      const hinweis = await seite.$eval('.form__status', (e) => e.textContent.trim());
      pruefe('Zweiter Klick öffnet die fertige Mail an die Disposition',
        hinweis.includes('E-Mail-Programm') && hinweis.includes('dispo@hermserviceteam.com'),
        `„${hinweis}"`);

      await kontext.close();
    }

    // -------------------------------------------------------- Bewerbung
    {
      const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/jobs.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(400);
      console.log('\nBewerbung');

      const empfaenger = await seite.$eval('form[data-formular]', (f) => f.dataset.empfaenger);
      pruefe('Bewerbungen gehen an das Personalpostfach', empfaenger === 'info@hermserviceteam.com', empfaenger);

      // „Bewerben" an einer Stelle trägt den Bereich gleich ein.
      const knopf = await seite.$('[data-bereich-waehlen]');
      if (knopf) {
        const wunsch = await knopf.getAttribute('data-bereich-waehlen');
        await knopf.click();
        await seite.waitForTimeout(300);
        const gewaehlt = await seite.$eval('#bewerbung select[name="Bereich"]', (f) => f.value);
        pruefe('„Bewerben" trägt den Bereich gleich ein', gewaehlt === wunsch, `${wunsch} → ${gewaehlt}`);
      }
      await kontext.close();
    }

    // -------------------------------------------------------- Lightbox
    {
      const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/galerie.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(500);
      console.log('\nGalerie');

      await seite.click('.gal__item');
      await seite.waitForTimeout(400);
      const offen = await seite.$eval('#lightbox', (d) => d.open);
      const quelle = await seite.$eval('.lightbox__bild', (b) => b.getAttribute('src') ?? '');
      pruefe('Lightbox öffnet mit Bild', offen && quelle.length > 0, quelle.slice(0, 44));

      const ersterZaehler = await seite.$eval('.lightbox__zaehler', (e) => e.textContent.trim());
      await seite.keyboard.press('ArrowRight');
      await seite.waitForTimeout(300);
      const zweiterZaehler = await seite.$eval('.lightbox__zaehler', (e) => e.textContent.trim());
      pruefe('Pfeiltaste blättert weiter', ersterZaehler !== zweiterZaehler,
        `${ersterZaehler} → ${zweiterZaehler}`);

      await seite.keyboard.press('Escape');
      await seite.waitForTimeout(300);
      pruefe('Esc schließt', !(await seite.$eval('#lightbox', (d) => d.open)));
      await kontext.close();
    }

    // ------------------------------------------------- Bühnen und Top-Knopf
    {
      /* Headless Chromium meldet von sich aus „prefers-reduced-motion: reduce",
         und dann schaltet main.js den Bühnen-Effekt bewusst ab. Hier soll der
         Normalfall geprüft werden, also ausdrücklich ohne die Einstellung. */
      const kontext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE', reducedMotion: 'no-preference' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/index.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(600);
      console.log('\nStartseite');

      const buehnen = await seite.$$eval('.stage', (e) => e.length);
      pruefe('Sechs Bühnen für sechs Bereiche', buehnen === 6, `${buehnen} Bühnen`);

      // In eine Bühne hineinscrollen: die Variablen müssen sich bewegen.
      // --zoom sitzt auf der Szene innerhalb der Bühne, nicht auf der Bühne.
      const vorher = await seite.$eval('.stage .scene', (el) => getComputedStyle(el).getPropertyValue('--zoom'));
      await seite.evaluate(() => {
        const b = document.querySelector('.stage');
        window.scrollTo(0, b.offsetTop + b.offsetHeight * 0.45);
      });
      await seite.waitForTimeout(600);
      const nachher = await seite.$eval('.stage .scene', (el) => getComputedStyle(el).getPropertyValue('--zoom'));
      pruefe('Bühne zoomt beim Scrollen', vorher !== nachher, `--zoom ${vorher.trim()} → ${nachher.trim()}`);

      // Top-Knopf: springt sofort, nicht weich.
      await seite.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
      await seite.waitForTimeout(400);
      const sichtbar = await seite.$eval('#toTop', (e) => getComputedStyle(e).opacity !== '0' && !e.hidden);
      pruefe('Top-Knopf erscheint nach dem Scrollen', sichtbar);
      await seite.click('#toTop');
      await seite.waitForTimeout(150);
      const obenNach = await seite.evaluate(() => window.scrollY);
      pruefe('Top-Knopf springt sofort nach oben', obenNach < 40, `${obenNach} px nach 150 ms`);

      await kontext.close();
    }

    // -------------------------------------------------------- Mobiles Menü
    {
      const kontext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE' });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/index.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(500);
      console.log('\nSmartphone');

      const schalter = await seite.$('.nav__burger, [class*=burger], button[aria-controls]');
      pruefe('Menüschalter vorhanden', Boolean(schalter));
      if (schalter) {
        await schalter.click();
        await seite.waitForTimeout(400);
        const auf = await schalter.getAttribute('aria-expanded');
        const ziele = await seite.$$eval('.nav__panel a, [class*=menu] a', (e) => e.filter((x) => x.offsetParent !== null).length);
        pruefe('Menü öffnet und zeigt Ziele', auf === 'true' && ziele > 3, `${ziele} sichtbare Links`);

        await seite.keyboard.press('Escape');
        await seite.waitForTimeout(300);
        pruefe('Esc schließt das Menü', (await schalter.getAttribute('aria-expanded')) === 'false');
      }
      await kontext.close();
    }

    // ------------------------------------------------------ Ohne JavaScript
    {
      const kontext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
      const seite = await kontext.newPage();
      await seite.goto(`${basis}/index.html`, { waitUntil: 'load' });
      await seite.waitForTimeout(300);
      console.log('\nOhne JavaScript');
      const sichtbarerText = await seite.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().length);
      pruefe('Die Seite bleibt lesbar', sichtbarerText > 1500, `${sichtbarerText} Zeichen sichtbar`);
      await kontext.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log('');
  if (befunde.length === 0) {
    console.log('Die Bedienung tut, was sie soll.');
  } else {
    console.log(`${befunde.length} Befunde:\n  · ${befunde.join('\n  · ')}`);
    process.exit(1);
  }
}

main().catch((f) => { console.error(f); process.exit(1); });

/**
 * Prüft die Menüleiste in einem echten Browser (SecPlan 2).
 *
 *   bash scripts/server-start.sh 3100
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/pruefe-menue.ts
 */
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

const BASIS = process.argv[2] ?? 'http://localhost:3100';
const PASSWORT = process.env.SEED_PASSWORD ?? 'Hafencity!2026';
const ZIEL = process.env.BLICK_ZIEL ?? '/tmp/claude-0/-home-user-Claude/f5e86df2-87a8-51d0-acd3-65daf6dc7d03/scratchpad';

async function starte(): Promise<Browser> {
  const { existsSync, readdirSync } = await import('node:fs');
  const wurzel = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (wurzel && existsSync(wurzel)) {
    const k = readdirSync(wurzel).filter((e) => e.startsWith('chromium'))
      .flatMap((e) => [path.join(wurzel, e, 'chrome-linux', 'chrome'), path.join(wurzel, e, 'chrome-linux', 'headless_shell')])
      .filter((d) => existsSync(d));
    if (k[0]) return chromium.launch({ executablePath: k[0] });
  }
  return chromium.launch();
}

async function main() {
  const email = process.argv[3] ?? 'admin@hermserviceteam.com';
  const browser = await starte();
  const kontext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const antwort = await kontext.request.post(`${BASIS}/api/auth/login`, { data: { email, password: PASSWORT } });
  if (!antwort.ok()) throw new Error(`Anmeldung fehlgeschlagen: ${antwort.status()}`);

  const seite = await kontext.newPage();
  const fehler: string[] = [];
  seite.on('pageerror', (e) => fehler.push(e.message));
  await seite.goto(`${BASIS}/dashboard`, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(500);

  // 1. Stehen alle Bereiche in der Leiste, und passt sie in eine Zeile?
  const knoepfe = await seite.$$eval('.app-menue .menue-knopf', (bs) =>
    bs.map((b) => ({ text: (b.textContent ?? '').trim(), oben: Math.round(b.getBoundingClientRect().top) })));
  const zeilen = new Set(knoepfe.map((k) => k.oben));
  console.log(`  ${zeilen.size === 1 ? 'ok  ' : 'FEHL'} ${knoepfe.length} Bereiche in ${zeilen.size} Zeile(n): ${knoepfe.map((k) => k.text).join(' · ')}`);
  if (zeilen.size !== 1) throw new Error('Die Menüleiste bricht um – das ist keine Menüleiste mehr.');

  // 2. Klappt ein Blatt auf, und steht es im Bild?
  await seite.click('.app-menue .menue-knopf[aria-haspopup="true"] >> nth=0');
  await seite.waitForSelector('.menue-blatt', { timeout: 3000 });
  const blatt = await seite.$eval('.menue-blatt', (el) => {
    const r = el.getBoundingClientRect();
    return { links: Math.round(r.left), rechts: Math.round(r.right), eintraege: el.querySelectorAll('a').length };
  });
  const breite = await seite.evaluate(() => window.innerWidth);
  const drin = blatt.links >= 0 && blatt.rechts <= breite;
  console.log(`  ${drin ? 'ok  ' : 'FEHL'} Blatt mit ${blatt.eintraege} Einträgen, ${blatt.links}–${blatt.rechts} px von ${breite}`);
  await seite.screenshot({ path: path.join(ZIEL, 'menue-offen.png') });
  if (!drin) throw new Error('Das aufgeklappte Blatt steht außerhalb des Fensters.');

  // 3. Esc schließt.
  await seite.keyboard.press('Escape');
  await seite.waitForTimeout(200);
  console.log(`  ${(await seite.$('.menue-blatt')) === null ? 'ok  ' : 'FEHL'} Esc schließt das Blatt`);

  // 4. Das letzte Blatt darf rechts nicht hinausstehen.
  const alle = await seite.$$('.app-menue .menue-knopf[aria-haspopup="true"]');
  await alle[alle.length - 1]!.click();
  await seite.waitForSelector('.menue-blatt', { timeout: 3000 });
  const letztes = await seite.$eval('.menue-blatt', (el) => {
    const r = el.getBoundingClientRect();
    return { links: Math.round(r.left), rechts: Math.round(r.right) };
  });
  const passt = letztes.links >= 0 && letztes.rechts <= breite;
  console.log(`  ${passt ? 'ok  ' : 'FEHL'} Letztes Blatt bleibt im Bild (${letztes.links}–${letztes.rechts} px)`);
  await seite.screenshot({ path: path.join(ZIEL, 'menue-letztes.png') });
  if (!passt) throw new Error('Das letzte Blatt steht rechts hinaus.');

  // 5. Ein Klick im Blatt führt irgendwohin.
  const erster = await seite.$('.menue-blatt a');
  const href = await erster!.getAttribute('href');
  await erster!.click();
  await seite.waitForURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 8000 });
  console.log(`  ok   Klick führt nach ${href}`);

  // 6. Die Leiste bleibt beim Scrollen stehen.
  await seite.evaluate(() => window.scrollTo(0, 600));
  await seite.waitForTimeout(200);
  const oben = await seite.$eval('.app-menue', (el) => Math.round(el.getBoundingClientRect().top));
  console.log(`  ${oben <= 50 ? 'ok  ' : 'FEHL'} Leiste bleibt beim Scrollen stehen (oben bei ${oben} px)`);

  // 7. Auch bei schmalerem Fenster darf die Leiste nicht umbrechen und
  //    kein Blatt hinausstehen.
  for (const breiteTest of [1280, 1100, 900, 760]) {
    const eng = await browser.newContext({ viewport: { width: breiteTest, height: 860 }, locale: 'de-DE' });
    await eng.addCookies((await kontext.cookies()).filter((c) => c.name === 'hst_session'));
    const s2 = await eng.newPage();
    await s2.goto(`${BASIS}/dashboard`, { waitUntil: 'domcontentloaded' });
    await s2.waitForTimeout(350);

    const reihen = await s2.$$eval('.app-menue .menue-knopf', (bs) =>
      new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);

    const gruppen = await s2.$$('.app-menue .menue-knopf[aria-haspopup="true"]');
    let schlimmster = 0;
    for (const g of gruppen) {
      await g.click();
      await s2.waitForSelector('.menue-blatt', { timeout: 3000 });
      const r = await s2.$eval('.menue-blatt', (el) => {
        const b = el.getBoundingClientRect();
        return { links: Math.round(b.left), rechts: Math.round(b.right) };
      });
      schlimmster = Math.max(schlimmster, Math.max(0, -r.links, r.rechts - breiteTest));
      await s2.keyboard.press('Escape');
      await s2.waitForTimeout(80);
    }
    const gut = reihen === 1 && schlimmster === 0;
    console.log(`  ${gut ? 'ok  ' : 'FEHL'} ${breiteTest} px: ${reihen} Zeile(n), Blätter stehen ${schlimmster} px hinaus`);
    await s2.screenshot({ path: path.join(ZIEL, `menue-${breiteTest}.png`) });
    await eng.close();
    if (!gut) throw new Error(`Bei ${breiteTest} px sitzt die Menüleiste nicht richtig.`);
  }

  // 8. Auf dem Smartphone: Leiste weg, Schublade da.
  const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'de-DE' });
  await handy.addCookies((await kontext.cookies()).filter((c) => c.name === 'hst_session'));
  const klein = await handy.newPage();
  await klein.goto(`${BASIS}/dashboard`, { waitUntil: 'domcontentloaded' });
  await klein.waitForTimeout(400);
  const leisteSichtbar = await klein.$eval('.app-menue', (el) => getComputedStyle(el).display !== 'none');
  await klein.click('.nav-schalter');
  await klein.waitForTimeout(300);
  const schubladeOffen = await klein.$eval('.app-nav', (el) => el.getAttribute('data-offen') === 'true');
  console.log(`  ${!leisteSichtbar && schubladeOffen ? 'ok  ' : 'FEHL'} Smartphone: Leiste ausgeblendet, Schublade öffnet`);
  await klein.screenshot({ path: path.join(ZIEL, 'menue-handy.png'), fullPage: false });

  if (fehler.length > 0) throw new Error(`Fehler im Browser:\n${fehler.join('\n')}`);
  console.log('\nDie Menüleiste tut, was sie soll.');
  await browser.close();
}

main().catch((f) => { console.error(f); process.exit(1); });

/** Schnelles Bildschirmfoto einer Seite – zum Hinsehen während der Arbeit. */
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

const BASIS = 'http://localhost:3100';
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
  const [email = 'dispo@hermserviceteam.com', ...pfade] = process.argv.slice(2);
  const browser = await starte();
  const kontext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  if (process.env.BLICK_THEMA) {
    await kontext.addCookies([{ name: 'hst_theme', value: process.env.BLICK_THEMA, url: BASIS }]);
  }
  const antwort = await kontext.request.post(`${BASIS}/api/auth/login`, { data: { email, password: PASSWORT } });
  if (!antwort.ok()) throw new Error(`Anmeldung fehlgeschlagen: ${antwort.status()}`);
  const seite = await kontext.newPage();
  const fehler: string[] = [];
  seite.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  for (const pfad of pfade) {
    const name = pfad.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'start';
    await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await seite.waitForTimeout(700);
    await seite.screenshot({ path: path.join(ZIEL, `${name}.png`), fullPage: true });
    console.log(`${name}.png  ←  ${pfad}`);
  }
  if (fehler.length) console.log('Konsolenfehler:\n' + fehler.join('\n'));
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

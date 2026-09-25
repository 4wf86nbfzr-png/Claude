/** Öffnet demo/index.html in echtem Chromium und sammelt Konsolenfehler. */
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';

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
  const browser = await starte();
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
  const seite = await kontext.newPage();
  const fehler: string[] = [];
  seite.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));

  const datei = `file://${path.resolve('demo/index.html')}`;
  await seite.goto(datei, { waitUntil: 'load' });
  await seite.waitForTimeout(600);

  const reiter = await seite.$$eval('nav.reiter button', (bs) => bs.map((b) => (b as HTMLElement).dataset.ziel!));
  const ziel = process.env.BLICK_ZIEL ?? '/tmp/claude-0/-home-user-Claude/f5e86df2-87a8-51d0-acd3-65daf6dc7d03/scratchpad';
  for (const r of reiter) {
    await seite.click(`nav.reiter button[data-ziel="${r}"]`);
    await seite.waitForTimeout(350);
    const sichtbar = await seite.$eval(`#${r}`, (el) => !(el as HTMLElement).hidden);
    const inhalt = await seite.$eval(`#${r}`, (el) => (el.textContent ?? '').trim().length);
    console.log(`  ${sichtbar ? 'ok  ' : 'FEHL'} ${r.padEnd(14)} ${inhalt} Zeichen`);
    if (process.env.BILDER) {
      await seite.screenshot({ path: path.join(ziel, `demo-${r}.png`), fullPage: true });
    }
  }

  console.log(fehler.length === 0 ? '\nKeine Konsolenfehler.' : `\nKonsolenfehler:\n${fehler.join('\n')}`);
  await browser.close();
  if (fehler.length > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });

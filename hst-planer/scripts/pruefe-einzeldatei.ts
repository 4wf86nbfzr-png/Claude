/**
 * Prüft die eigenständige Demo-Datei in einem echten Browser.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/pruefe-einzeldatei.ts
 *
 * Entscheidend: die Datei wird vorher in einen LEEREN Ordner kopiert.
 * Läge sie neben demo/bilder/, würde ein vergessener Verweis nicht
 * auffallen – genau der Fehler, den diese Fassung vermeiden soll.
 */
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
  const ordner = await mkdtemp(path.join(tmpdir(), 'hst-demo-'));
  const datei = path.join(ordner, 'hst-planer-demo.html');
  await copyFile('demo/hst-planer-demo.html', datei);
  console.log(`Geprüft wird eine Kopie in einem leeren Ordner: ${ordner}`);

  const browser = await starte();
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
  const seite = await kontext.newPage();

  const fehler: string[] = [];
  const fehlend: string[] = [];
  seite.on('console', (m) => { if (m.type() === 'error') fehler.push(m.text()); });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  seite.on('requestfailed', (r) => fehlend.push(r.url()));

  try {
    await seite.goto(`file://${datei}`, { waitUntil: 'load' });
    await seite.waitForTimeout(800);

    // Läuft die echte Fachlogik mit?
    const logik = await seite.evaluate(() => {
      const H = (window as unknown as { HST?: Record<string, unknown> }).HST;
      return H ? Object.keys(H).length : 0;
    });
    console.log(`  ${logik > 30 ? 'ok  ' : 'FEHL'} ${logik} Funktionen aus src/lib stehen bereit`);
    if (logik < 30) throw new Error('Die gebündelte Fachlogik fehlt.');

    // Jeder Reiter muss sich öffnen und Inhalt zeigen.
    const reiter = await seite.$$eval('nav.reiter button', (bs) => bs.map((b) => (b as HTMLElement).dataset.ziel!));
    for (const r of reiter) {
      await seite.click(`nav.reiter button[data-ziel="${r}"]`);
      await seite.waitForTimeout(280);
      const zeichen = await seite.$eval(`#${r}`, (el) => (el.textContent ?? '').trim().length);
      console.log(`  ${zeichen > 200 ? 'ok  ' : 'FEHL'} Reiter ${r.padEnd(12)} ${zeichen} Zeichen`);
      if (zeichen <= 200) throw new Error(`Der Reiter ${r} bleibt leer.`);
    }

    // Die Bilder müssen wirklich geladen sein, nicht nur im Markup stehen.
    await seite.click('nav.reiter button[data-ziel="bilder"]');
    await seite.waitForTimeout(400);
    // Erst alle Bilder sichtbar machen – sonst greift loading="lazy".
    await seite.evaluate(() => {
      document.querySelectorAll('img').forEach((b) => b.setAttribute('loading', 'eager'));
    });
    await seite.waitForTimeout(1500);
    const bilder = await seite.$$eval('#galerie img', (bs) => ({
      gesamt: bs.length,
      geladen: bs.filter((b) => (b as HTMLImageElement).naturalWidth > 0).length,
      extern: bs.filter((b) => !(b as HTMLImageElement).src.startsWith('data:')).length,
    }));
    const bildOk = bilder.gesamt > 50 && bilder.geladen === bilder.gesamt && bilder.extern === 0;
    console.log(`  ${bildOk ? 'ok  ' : 'FEHL'} ${bilder.geladen} von ${bilder.gesamt} Bildern geladen, ${bilder.extern} davon extern`);
    if (!bildOk) throw new Error('Nicht alle Bilder stecken in der Datei.');

    // Und die Werkzeuge müssen rechnen.
    await seite.click('nav.reiter button[data-ziel="zuordnung"]');
    await seite.waitForTimeout(350);
    const meldung = await seite.$eval('#zpErgebnis', (el) => (el.textContent ?? '').trim());
    const rechnet = meldung.includes('eingeplant') || meldung.includes('Einwände');
    console.log(`  ${rechnet ? 'ok  ' : 'FEHL'} Zuordnungsprüfung rechnet: „${meldung.slice(0, 64)}…"`);
    if (!rechnet) throw new Error('Die Zuordnungsprüfung rechnet nicht.');

    // Nichts darf von außerhalb der Datei nachgeladen werden.
    const echteFehlschlaege = fehlend.filter((u) => !u.startsWith('data:'));
    console.log(`  ${echteFehlschlaege.length === 0 ? 'ok  ' : 'FEHL'} keine Datei wird von außen nachgeladen`);
    if (echteFehlschlaege.length > 0) throw new Error(`Fehlende Dateien:\n${echteFehlschlaege.join('\n')}`);

    if (fehler.length > 0) throw new Error(`Fehler im Browser:\n${fehler.join('\n')}`);
    console.log('\nDie Datei läuft für sich allein.');
  } finally {
    await browser.close();
    await rm(ordner, { recursive: true, force: true });
  }
}

main().catch((f) => { console.error(f); process.exit(1); });

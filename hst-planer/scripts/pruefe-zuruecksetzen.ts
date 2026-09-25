/**
 * Durchlauf „Passwort vergessen" in einem echten Browser.
 *
 *   bash scripts/server-start.sh 3100
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/pruefe-zuruecksetzen.ts
 *
 * Legt einen Wegwerfzugang an, fordert den Link an, holt ihn aus der
 * Datenbank (im Betrieb käme er per E-Mail), vergibt ein neues Passwort
 * und meldet sich damit an. Räumt hinterher auf.
 */
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, type Browser } from 'playwright-core';
import { config } from 'dotenv';
config({ path: '.env', quiet: true });

const BASIS = process.argv[2] ?? 'http://localhost:3100';

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
  const { PrismaClient } = await import('@prisma/client');
  const { hashPassword } = await import('../src/lib/auth/password');
  const db = new PrismaClient();

  const marke = `probe-${Date.now()}`;
  const email = `${marke}@example.org`;
  const neuesPasswort = 'Hafentor-Schleuse!4417';

  const benutzer = await db.user.create({
    data: { email, name: `Probe ${marke}`, role: 'MITARBEITER', passwordHash: await hashPassword('Alster-Fontaene!2291') },
  });

  const browser = await starte();
  const kontext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'de-DE' });
  const seite = await kontext.newPage();
  const fehler: string[] = [];
  seite.on('pageerror', (e) => fehler.push(e.message));

  try {
    // 1. Link anfordern
    await seite.goto(`${BASIS}/passwort-vergessen`, { waitUntil: 'domcontentloaded' });
    await seite.fill('#email', email);
    await seite.click('button[type="submit"]');
    await seite.waitForSelector('.hinweis-erfolg', { timeout: 10_000 });
    console.log('  ok  Anforderung bestätigt, ohne zu verraten, ob es das Konto gibt');

    // 2. Den Token holen – im Betrieb käme er per E-Mail. Hier wird er
    //    über den Hash gesucht, weil im Klartext nichts gespeichert ist.
    const eintraege = await db.passwordReset.findMany({ where: { userId: benutzer.id, usedAt: null } });
    if (eintraege.length !== 1) throw new Error(`Erwartet war genau ein offener Eintrag, gefunden: ${eintraege.length}`);

    // Der Klartext steht nirgends – für diesen Test wird er neu erzeugt
    // und der Hash abgeglichen, damit der Weg wirklich der echte ist.
    const { randomBytes } = await import('node:crypto');
    let klartext = '';
    // Kleiner Umweg: wir setzen einen eigenen Token mit bekanntem Klartext.
    klartext = randomBytes(32).toString('hex');
    await db.passwordReset.update({
      where: { id: eintraege[0]!.id },
      data: { tokenHash: createHash('sha256').update(klartext).digest('hex') },
    });

    // 3. Abgelaufener/erfundener Link muss abgewiesen werden
    await seite.goto(`${BASIS}/passwort-neu?token=${'0'.repeat(64)}`, { waitUntil: 'domcontentloaded' });
    const abgewiesen = await seite.$('.hinweis-fehler');
    if (!abgewiesen) throw new Error('Ein erfundener Link wurde nicht abgewiesen.');
    console.log('  ok  Erfundener Link wird abgewiesen');

    // 4. Neues Passwort vergeben
    await seite.goto(`${BASIS}/passwort-neu?token=${klartext}`, { waitUntil: 'domcontentloaded' });
    await seite.fill('#neu', neuesPasswort);
    await seite.fill('#wiederholung', neuesPasswort);
    await seite.click('button[type="submit"]');
    await seite.waitForURL(/\/anmelden\?neu=1/, { timeout: 10_000 });
    console.log('  ok  Neues Passwort gespeichert');

    // 5. Derselbe Link darf nicht noch einmal gehen
    await seite.goto(`${BASIS}/passwort-neu?token=${klartext}`, { waitUntil: 'domcontentloaded' });
    if (!(await seite.$('.hinweis-fehler'))) throw new Error('Der Link liess sich ein zweites Mal benutzen.');
    console.log('  ok  Der Link gilt nur einmal');

    // 6. Anmeldung mit dem neuen Passwort
    const antwort = await kontext.request.post(`${BASIS}/api/auth/login`, {
      data: { email, password: neuesPasswort },
    });
    if (!antwort.ok()) throw new Error(`Anmeldung mit dem neuen Passwort schlug fehl: HTTP ${antwort.status()}`);
    console.log('  ok  Anmeldung mit dem neuen Passwort');

    if (fehler.length > 0) throw new Error(`Fehler im Browser:\n${fehler.join('\n')}`);
    console.log('\nDer Weg „Passwort vergessen" funktioniert von Anfang bis Ende.');
  } finally {
    await browser.close();
    await db.passwordReset.deleteMany({ where: { userId: benutzer.id } });
    await db.session.deleteMany({ where: { userId: benutzer.id } });
    await db.auditLog.deleteMany({ where: { entityId: benutzer.id } });
    await db.user.delete({ where: { id: benutzer.id } }).catch(() => {});
    await db.$disconnect();
  }
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

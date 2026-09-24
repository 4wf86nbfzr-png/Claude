/**
 * Erzeugt die Bildschirmfotos für die Demo-Datei (demo/index.html).
 *
 *   bash scripts/server-start.sh 3100
 *   npx tsx scripts/demo-bilder.ts
 *
 * Die Bilder entstehen aus der echten, laufenden Anwendung mit den Seed-Daten –
 * es sind keine Entwuerfe, sondern Aufnahmen dessen, was der Server ausliefert.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import { config } from 'dotenv';

config({ path: '.env', quiet: true });

const BASIS = process.argv[2] ?? 'http://localhost:3100';
const PASSWORT = process.env.SEED_PASSWORD ?? 'Hafencity!2026';
const ZIEL = path.resolve('demo/bilder');

interface Aufnahme {
  datei: string;
  pfad: string;
  titel: string;
  benutzer: string;
  geraet?: 'desktop' | 'handy';
  thema?: 'hell' | 'dunkel';
  warten?: number;
}

const AUFNAHMEN: Aufnahme[] = [
  { datei: 'anmelden', pfad: '/anmelden', titel: 'Anmeldung', benutzer: '' },
  { datei: 'dashboard', pfad: '/dashboard', titel: 'Dashboard', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'dashboard-dunkel', pfad: '/dashboard', titel: 'Dashboard im Dunkelmodus', benutzer: 'dispo@hermserviceteam.com', thema: 'dunkel' },
  { datei: 'disposition', pfad: '/disposition?tage=7', titel: 'Disposition', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kalender-monat', pfad: '/kalender?ansicht=monat', titel: 'Kalender – Monatsansicht', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kalender-woche', pfad: '/kalender?ansicht=woche', titel: 'Kalender – Woche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'events', pfad: '/events', titel: 'Eventliste', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'event-uebersicht', pfad: '__ERSTES_EVENT__', titel: 'Event – Übersicht', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'event-mitarbeiter', pfad: '__ERSTES_EVENT__/mitarbeiter', titel: 'Event – Team und Personalsuche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'event-positionen', pfad: '__ERSTES_EVENT__/positionen', titel: 'Event – Positionen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'einsatzplan', pfad: '__ERSTES_EVENT__/einsatzplan', titel: 'Druckbarer Einsatzplan', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'mitarbeiter', pfad: '/mitarbeiter', titel: 'Mitarbeiterliste', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'mitarbeiter-detail', pfad: '__ERSTER_MITARBEITER__', titel: 'Mitarbeiterprofil', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kunden', pfad: '/kunden', titel: 'Kunden', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'anfragen', pfad: '/anfragen', titel: 'Anfragen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'anfrage-detail', pfad: '__ERSTE_ANFRAGE__', titel: 'Anfrage prüfen und übernehmen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'abgleiche', pfad: '/abgleiche', titel: 'Abgleiche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'abgleich-hochladen', pfad: '/abgleiche/neu', titel: 'Stundenzettel hochladen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'zeiterfassung', pfad: '/zeiterfassung', titel: 'Zeiterfassung', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'auswertungen', pfad: '/auswertungen', titel: 'Auswertungen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'dokumente', pfad: '/dokumente', titel: 'Dokumente', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kommunikation', pfad: '/kommunikation', titel: 'Kommunikation', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'einstellungen', pfad: '/einstellungen', titel: 'Einstellungen', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'admin', pfad: '/admin', titel: 'Administration', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'protokoll', pfad: '/admin/protokoll', titel: 'Revisionssicheres Protokoll', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'finanzen', pfad: '/finanzen', titel: 'Finanzen', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'suche', pfad: '/suche?q=mustermann', titel: 'Globale Suche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kein-zugriff', pfad: '/events', titel: 'Rollengrenze: Mitarbeiter sieht keine Events', benutzer: 'max.mustermann@example.org' },
  // Mitarbeiter-App auf dem Handy
  { datei: 'app-einsaetze', pfad: '/meine-einsaetze', titel: 'Mitarbeiter-App – Meine Einsätze', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
  { datei: 'app-dokumente', pfad: '/meine-dokumente', titel: 'Mitarbeiter-App – Meine Dokumente', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
  { datei: 'app-verfuegbarkeit', pfad: '/meine-verfuegbarkeit', titel: 'Mitarbeiter-App – Verfügbarkeit', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
];

/**
 * Meldet jeden Benutzer genau EINMAL an und merkt sich die Sitzung.
 *
 * Wichtig, weil die Anmeldung absichtlich begrenzt ist (20 Versuche je Adresse
 * und 10 je Konto in fünf Minuten). Ein Bildschirmfoto je Anmeldung würde
 * genau in diese Schranke laufen – und das soll sie ja auch.
 */
const sitzungen = new Map<string, { cookies: Array<Record<string, unknown>> }>();

async function sitzungFuer(browser: Browser, email: string): Promise<{ cookies: Array<Record<string, unknown>> }> {
  if (!email) return { cookies: [] };
  const vorhanden = sitzungen.get(email);
  if (vorhanden) return vorhanden;

  const kontext = await browser.newContext();
  const antwort = await kontext.request.post(`${BASIS}/api/auth/login`, { data: { email, password: PASSWORT } });
  if (!antwort.ok()) {
    await kontext.close();
    throw new Error(`Anmeldung als ${email} fehlgeschlagen: HTTP ${antwort.status()}`);
  }
  const zustand = await kontext.storageState();
  await kontext.close();

  const sitzung = { cookies: zustand.cookies as unknown as Array<Record<string, unknown>> };
  sitzungen.set(email, sitzung);
  return sitzung;
}

async function kontextFuer(
  browser: Browser, email: string, thema: 'hell' | 'dunkel', geraet: 'desktop' | 'handy',
): Promise<BrowserContext> {
  const kontext = await browser.newContext({
    viewport: geraet === 'handy' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    isMobile: geraet === 'handy',
    hasTouch: geraet === 'handy',
  });

  const sitzung = await sitzungFuer(browser, email);
  if (sitzung.cookies.length) await kontext.addCookies(sitzung.cookies as never);
  await kontext.addCookies([{ name: 'hst_theme', value: thema === 'dunkel' ? 'dark' : 'light', url: BASIS }]);
  return kontext;
}

/** Sucht den vorinstallierten Chromium, fällt sonst auf die Playwright-Suche zurück. */
async function starteBrowser(): Promise<Browser> {
  const { existsSync, readdirSync } = await import('node:fs');
  const wurzel = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (wurzel && existsSync(wurzel)) {
    const kandidaten = readdirSync(wurzel)
      .filter((eintrag) => eintrag.startsWith('chromium'))
      .flatMap((eintrag) => [
        path.join(wurzel, eintrag, 'chrome-linux', 'chrome'),
        path.join(wurzel, eintrag, 'chrome-linux', 'headless_shell'),
      ])
      .filter((datei) => existsSync(datei));
    if (kandidaten[0]) return chromium.launch({ executablePath: kandidaten[0] });
  }
  return chromium.launch();
}

async function main() {
  await mkdir(ZIEL, { recursive: true });

  // Der Browser liegt in dieser Umgebung fest; anderswo findet Playwright ihn selbst.
  const browser = await starteBrowser();

  // IDs aus der Datenbank holen, damit die Detailseiten echte Datensätze zeigen.
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient();
  const event = await db.event.findFirst({ where: { deletedAt: null }, orderBy: { date: 'asc' } });
  const mitarbeiter = await db.employee.findFirst({ where: { deletedAt: null }, orderBy: { personnelNo: 'asc' } });
  const anfrage = await db.request.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } });
  await db.$disconnect();

  const ersetzen = (pfad: string) =>
    pfad
      .replace('__ERSTES_EVENT__', `/events/${event?.id ?? ''}`)
      .replace('__ERSTER_MITARBEITER__', `/mitarbeiter/${mitarbeiter?.id ?? ''}`)
      .replace('__ERSTE_ANFRAGE__', `/anfragen/${anfrage?.id ?? ''}`);

  const verzeichnis: Array<{ datei: string; titel: string; geraet: string; thema: string; pfad: string }> = [];

  for (const aufnahme of AUFNAHMEN) {
    const geraet = aufnahme.geraet ?? 'desktop';
    const thema = aufnahme.thema ?? 'hell';
    const kontext = await kontextFuer(browser, aufnahme.benutzer, thema, geraet);
    const seite = await kontext.newPage();
    const pfad = ersetzen(aufnahme.pfad);

    try {
      await seite.goto(`${BASIS}${pfad}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      // Kurz warten, damit Schriften und Eintrittsanimationen fertig sind.
      await seite.waitForLoadState('load').catch(() => {});
      await seite.waitForTimeout(aufnahme.warten ?? 500);
      await seite.screenshot({ path: path.join(ZIEL, `${aufnahme.datei}.png`), fullPage: geraet === 'desktop' });
      verzeichnis.push({ datei: `${aufnahme.datei}.png`, titel: aufnahme.titel, geraet, thema, pfad });
      console.log(`  ok  ${aufnahme.datei}.png  (${aufnahme.titel})`);
    } catch (fehler) {
      console.error(`  FEHL ${aufnahme.datei}: ${fehler instanceof Error ? fehler.message : String(fehler)}`);
    } finally {
      await kontext.close();
    }
  }

  await browser.close();

  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(ZIEL, 'verzeichnis.json'), `${JSON.stringify(verzeichnis, null, 2)}\n`, 'utf8');
  console.log(`\n${verzeichnis.length} Bilder in demo/bilder/`);
}

main().catch((fehler) => { console.error(fehler); process.exit(1); });

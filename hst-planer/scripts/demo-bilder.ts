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
  { datei: 'dashboard', pfad: '/dashboard', titel: 'Dashboard – die Lage des Tages', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'dashboard-dunkel', pfad: '/dashboard', titel: 'Dashboard im Dunkelmodus', benutzer: 'dispo@hermserviceteam.com', thema: 'dunkel' },
  { datei: 'leitstelle', pfad: '/disposition', titel: 'Tagesplanung als Leitstelle', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'leitstelle-dunkel', pfad: '/disposition', titel: 'Leitstelle im Dunkelmodus', benutzer: 'dispo@hermserviceteam.com', thema: 'dunkel' },
  { datei: 'disposition-woche', pfad: '/disposition/woche', titel: 'Wochenplanung', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'offene-positionen', pfad: '/disposition/offene-positionen', titel: 'Offene Positionen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'unbesetzte-schichten', pfad: '/disposition/unbesetzt', titel: 'Unbesetzte Schichten', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'mitarbeiterzuordnung', pfad: '/disposition/zuordnung', titel: 'Mitarbeiterzuordnung über die Woche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kalender-monat', pfad: '/kalender?ansicht=monat', titel: 'Kalender – Monatsansicht', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'events', pfad: '/events', titel: 'Einsätze', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'event-uebersicht', pfad: '__ERSTES_EVENT__', titel: 'Einsatz – Übersicht', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'event-mitarbeiter', pfad: '__ERSTES_EVENT__/mitarbeiter', titel: 'Einsatz – Team und Personalsuche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'einsatzplan', pfad: '__ERSTES_EVENT__/einsatzplan', titel: 'Druckbarer Einsatzplan', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'einsatzhistorie', pfad: '/einsatzhistorie', titel: 'Einsatzhistorie', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'teamleiter', pfad: '/teamleiter', titel: 'Teamleiter und was sie sehen dürfen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'mitarbeiter', pfad: '/mitarbeiter', titel: 'Mitarbeiterliste', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'akte-uebersicht', pfad: '__ERSTER_MITARBEITER__', titel: 'Mitarbeiterakte – Übersicht (Personal)', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'akte-gesperrt', pfad: '__ERSTER_MITARBEITER__', titel: 'Dieselbe Akte als Teamleitung: gesperrte Felder', benutzer: 'teamleitung@hermserviceteam.com' },
  { datei: 'akte-qualifikationen', pfad: '__ERSTER_MITARBEITER__/qualifikationen', titel: 'Mitarbeiterakte – Qualifikationen', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'akte-dokumente', pfad: '__ERSTER_MITARBEITER__/dokumente', titel: 'Mitarbeiterakte – Dokumente mit Zugriffsebene', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'akte-datenschutz', pfad: '__ERSTER_MITARBEITER__/datenschutz', titel: 'Mitarbeiterakte – Datenschutz', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'mitarbeiterakten', pfad: '/mitarbeiterakten', titel: 'Vollständigkeit der Personalakten', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'bewerber', pfad: '/bewerber', titel: 'Bewerber mit Löschdatum', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'qualifikationen', pfad: '/qualifikationen', titel: 'Qualifikationen und Fristen', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'schulungen', pfad: '/schulungen', titel: 'Schulungen und offene Pflichtunterweisungen', benutzer: 'personal@hermserviceteam.com' },
  { datei: 'verfuegbarkeiten', pfad: '/verfuegbarkeiten', titel: 'Verfügbarkeiten über vier Wochen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'zeiterfassung', pfad: '/zeiterfassung', titel: 'Stundenzettel', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'arbeitszeiten', pfad: '/zeiterfassung/arbeitszeiten', titel: 'Arbeitszeiten je Monat', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'freigaben', pfad: '/zeiterfassung/freigaben', titel: 'Freigaben', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'abgleiche', pfad: '/abgleiche', titel: 'Abgleiche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'abgleich-hochladen', pfad: '/abgleiche/neu', titel: 'Stundenzettel hochladen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'anfragen', pfad: '/anfragen', titel: 'Anfragen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'anfrage-detail', pfad: '__ERSTE_ANFRAGE__', titel: 'Anfrage prüfen und übernehmen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kunden', pfad: '/kunden', titel: 'Kunden', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'partner-unternehmen', pfad: '/partner/unternehmen', titel: 'Partnerunternehmen', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'partner-einsaetze', pfad: '/partner/einsaetze', titel: 'Partner-Einsätze', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kommunikation', pfad: '/kommunikation', titel: 'Kommunikation', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'email-eingang', pfad: '/kommunikation/email', titel: 'E-Mail-Eingänge', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'compliance', pfad: '/compliance', titel: 'HST Compliance – Stand je Bereich', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-datenschutz', pfad: '/compliance/datenschutz', titel: 'Verzeichnis der Verarbeitungstätigkeiten', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-tom', pfad: '/compliance/tom', titel: 'Technische und organisatorische Maßnahmen', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-avv', pfad: '/compliance/avv', titel: 'Auftragsverarbeiter und Drittlandtransfers', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-loeschfristen', pfad: '/compliance/loeschfristen', titel: 'Löschkonzept', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-vorfaelle', pfad: '/compliance/vorfaelle', titel: 'Datenschutzvorfälle', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'compliance-dokumentation', pfad: '/compliance/dokumentation', titel: 'Dokumentation und Nachweise', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'audit-log', pfad: '/compliance/audit-log', titel: 'Audit-Log, Dokumentzugriffe, Exporte', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'sicherheitscheck', pfad: '/compliance/sicherheitscheck', titel: 'Sicherheitscheck', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'admin', pfad: '/admin', titel: 'Administration', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'admin-benutzer', pfad: '/admin/benutzer', titel: 'Benutzer und zweiter Faktor', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'admin-rollen', pfad: '/admin/rollen', titel: 'Die neun Rollen', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'admin-berechtigungen', pfad: '/admin/berechtigungen', titel: 'Vollständige Rechtematrix', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'admin-schnittstellen', pfad: '/admin/schnittstellen', titel: 'Schnittstellen', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'konto-sicherheit', pfad: '/konto/sicherheit', titel: 'Eigene Sicherheit: zweiter Faktor und Sitzungen', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'einstellungen', pfad: '/einstellungen', titel: 'Systemeinstellungen', benutzer: 'admin@hermserviceteam.com' },
  { datei: 'finanzen', pfad: '/finanzen', titel: 'Finanzen', benutzer: 'gf@hermserviceteam.com' },
  { datei: 'suche', pfad: '/suche?q=mustermann', titel: 'Globale Suche', benutzer: 'dispo@hermserviceteam.com' },
  { datei: 'kein-zugriff', pfad: '/events', titel: 'Rollengrenze: ein Mitarbeiter sieht keine Einsätze', benutzer: 'max.mustermann@example.org' },
  { datei: 'app-einsaetze', pfad: '/meine-einsaetze', titel: 'Mitarbeiter-App – Meine Einsätze', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
  { datei: 'app-zeiten', pfad: '/meine-zeiten', titel: 'Mitarbeiter-App – Meine Stunden', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
  { datei: 'app-verfuegbarkeit', pfad: '/meine-verfuegbarkeit', titel: 'Mitarbeiter-App – Verfügbarkeit', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
  { datei: 'app-dokumente', pfad: '/meine-dokumente', titel: 'Mitarbeiter-App – Meine Dokumente', benutzer: 'max.mustermann@example.org', geraet: 'handy' },
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

/**
 * Rauchtest mit echter Anmeldung ueber die REST-API.
 *
 *   npx tsx scripts/pruefe-seiten.ts [basis-url] [email] [passwort]
 *
 * Meldet sich ueber /api/auth/login an, uebernimmt das Sitzungs-Cookie und
 * ruft anschliessend die wichtigsten Seiten je Rolle ab. Gedacht fuer die
 * schnelle Kontrolle nach einem Deployment – nicht als Ersatz fuer die Tests.
 */
const basis = process.argv[2] ?? 'http://localhost:3100';
const email = process.argv[3] ?? 'dispo@hermserviceteam.com';
const passwort = process.argv[4] ?? 'Hafencity!2026';

const SEITEN = [
  '/dashboard', '/disposition', '/kalender', '/events', '/events/neu',
  '/mitarbeiter', '/mitarbeiter/neu', '/kunden', '/kunden/neu', '/partner', '/partner/neu',
  '/anfragen', '/anfragen/neu', '/abgleiche', '/abgleiche/neu', '/zeiterfassung',
  '/dokumente', '/kommunikation', '/auswertungen', '/einstellungen', '/admin',
  '/admin/protokoll', '/meine-einsaetze', '/meine-verfuegbarkeit', '/meine-dokumente', '/konto/passwort',
  '/benachrichtigungen', '/suche?q=mustermann',
  '/api/auth/session', '/api/events', '/api/employees', '/api/shifts',
  '/api/requests', '/api/timesheets', '/api/reconciliation', '/api/customers',
  '/api/partners', '/api/notifications',
];

async function main() {
  const anmeldung = await fetch(`${basis}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: passwort }),
  });
  if (!anmeldung.ok) {
    const text = await anmeldung.text();
    throw new Error(`Anmeldung fehlgeschlagen (HTTP ${anmeldung.status}): ${text}`);
  }
  const cookie = anmeldung.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  if (!cookie.includes('hst_session')) throw new Error('Es wurde kein Sitzungs-Cookie gesetzt.');
  console.log(`Angemeldet als ${email}\n`);

  let fehler = 0;
  let gesperrt = 0;
  for (const pfad of SEITEN) {
    const antwort = await fetch(`${basis}${pfad}`, { headers: { cookie }, redirect: 'manual' });
    const ziel = antwort.headers.get('location') ?? '';

    // Eine Umleitung auf /kein-zugriff ist kein Fehler, sondern die Rollengrenze
    // bei der Arbeit – genau das soll fuer Mitarbeiter, Partner und Kunden passieren.
    const rollengrenze =
      (antwort.status === 307 && (ziel.includes('/kein-zugriff') || ziel.includes('/anmelden'))) ||
      // Die API leitet nicht um, sondern antwortet mit 403.
      (antwort.status === 403 && pfad.startsWith('/api/'));
    const gut = antwort.status === 200 || rollengrenze;
    if (rollengrenze) gesperrt++;
    if (!gut) fehler++;

    const marke = antwort.status === 200 ? '  ok ' : rollengrenze ? ' --- ' : ' FEHL';
    const zusatz = rollengrenze ? '  (Rollengrenze)' : '';
    console.log(`${marke} ${String(antwort.status).padEnd(4)} ${pfad}${zusatz}`);
  }

  console.log(
    fehler === 0
      ? `\nAlles in Ordnung: ${SEITEN.length - gesperrt} Seiten geladen, ${gesperrt} durch die Rolle gesperrt.`
      : `\n${fehler} Seite(n) mit Fehler.`,
  );
  process.exit(fehler === 0 ? 0 : 1);
}

main().catch((error) => { console.error(error.message); process.exit(1); });

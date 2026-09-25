/**
 * Schnittstellen gegen den laufenden Server (Spec 16/41/67).
 *
 * Voraussetzung: `npm run build && npm start` bzw. `bash scripts/server-start.sh`.
 * Ohne erreichbaren Server werden die Tests übersprungen statt fehlzuschlagen,
 * damit `npm test` auch ohne laufende Anwendung durchlaeuft.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from './hilfen/db';

const BASIS = process.env.TEST_BASE_URL ?? 'http://localhost:3100';
const PASSWORT = process.env.SEED_PASSWORD ?? 'Hafencity!2026';

let erreichbar = false;
let cookieDispo = '';
let cookieMitarbeiter = '';
const angelegteAnfragen: string[] = [];

async function anmelden(email: string): Promise<string> {
  const antwort = await fetch(`${BASIS}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORT }),
  });
  if (!antwort.ok) throw new Error(`Anmeldung fehlgeschlagen: HTTP ${antwort.status}`);
  return antwort.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

beforeAll(async () => {
  try {
    const antwort = await fetch(`${BASIS}/anmelden`, { signal: AbortSignal.timeout(2500) });
    erreichbar = antwort.ok;
  } catch {
    erreichbar = false;
  }
  if (!erreichbar) {
    console.warn(`\n  Hinweis: ${BASIS} ist nicht erreichbar – API-Tests werden übersprungen.\n`);
    return;
  }
  cookieDispo = await anmelden('dispo@hermserviceteam.com');
  cookieMitarbeiter = await anmelden('max.mustermann@example.org');
});

afterAll(async () => {
  if (angelegteAnfragen.length) {
    await db.request.deleteMany({ where: { id: { in: angelegteAnfragen } } });
  }
  await db.$disconnect();
});

describe.runIf(process.env.VITEST_SKIP_API !== '1')('Anmeldung', () => {
  it('weist falsche Passwörter ab, ohne zu verraten ob das Konto existiert', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dispo@hermserviceteam.com', password: 'falschfalschfalsch' }),
    });
    expect(antwort.status).toBe(401);
    const daten = await antwort.json();
    expect(daten.error).toBe('E-Mail-Adresse oder Passwort ist nicht korrekt.');

    const unbekannt = await fetch(`${BASIS}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'gibtesnicht@example.org', password: 'falschfalschfalsch' }),
    });
    expect((await unbekannt.json()).error).toBe(daten.error);
  });

  it('verweigert die API ohne Anmeldung', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/events`);
    expect(antwort.status).toBe(401);
  });

  it('liefert nach der Anmeldung die eigene Rolle', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/auth/session`, { headers: { cookie: cookieDispo } });
    expect(antwort.status).toBe(200);
    const daten = await antwort.json();
    expect(daten.rolle).toBe('DISPOSITION');
    expect(daten.sichtbarkeit).toBe('ALLE');
    expect(daten.navigation.map((n: { href: string }) => n.href)).toContain('/disposition');
  });
});

describe.runIf(process.env.VITEST_SKIP_API !== '1')('Rechte in der API', () => {
  it('Mitarbeiter kommt nicht an die Eventliste', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/events`, { headers: { cookie: cookieMitarbeiter } });
    expect(antwort.status).toBe(403);
  });

  it('Mitarbeiter sieht nur eigene Schichten', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/shifts`, { headers: { cookie: cookieMitarbeiter } });
    expect(antwort.status).toBe(403); // Schichten hängen an events.view
  });

  it('Disposition sieht Events mit Besetzungsgrad', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/events`, { headers: { cookie: cookieDispo } });
    expect(antwort.status).toBe(200);
    const daten = await antwort.json();
    expect(Array.isArray(daten.daten)).toBe(true);
    expect(daten.daten[0]).toHaveProperty('besetzung.soll');
  });
});

describe.runIf(process.env.VITEST_SKIP_API !== '1')('Öffentliche Anfrage-Schnittstelle (Spec 16)', () => {
  it('nimmt eine vollständige Anfrage an und vergibt eine Nummer', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/public/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        company: 'Testfirma GmbH', contactPerson: 'Test Person',
        email: `test-${Date.now()}@example.org`, phone: '040 123456',
        eventName: 'Testveranstaltung', eventDate: '2031-06-15',
        startTime: '18:00', endTime: '23:00', location: 'Hamburg',
        employeesNeeded: '6', serviceType: 'GASTRO', message: 'Bitte um ein Angebot.',
      }),
    });
    expect(antwort.status).toBe(201);
    const daten = await antwort.json();
    expect(daten.anfrageNummer).toMatch(/^AN-\d{4}-\d{4}$/);
    expect(daten.fehlendeAngaben).toEqual([]);

    const anfrage = await db.request.findUnique({ where: { reference: daten.anfrageNummer } });
    expect(anfrage?.status).toBe('NEU');
    expect(anfrage?.needsReview).toBe(true); // nie eine Buchung (Spec 17)
    if (anfrage) angelegteAnfragen.push(anfrage.id);
  });

  it('meldet fehlende Angaben zurück', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/public/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `test-${Date.now()}@example.org`, message: 'Wir brauchen Personal.' }),
    });
    expect(antwort.status).toBe(201);
    const daten = await antwort.json();
    expect(daten.fehlendeAngaben).toContain('Datum');
    expect(daten.fehlendeAngaben).toContain('Anzahl Mitarbeiter');
    const anfrage = await db.request.findUnique({ where: { reference: daten.anfrageNummer } });
    if (anfrage) angelegteAnfragen.push(anfrage.id);
  });

  it('weist eine Anfrage ohne E-Mail-Adresse ab', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/public/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Hallo' }),
    });
    expect(antwort.status).toBe(400);
  });

  it('verschluckt Einträge im Honigtopf-Feld', async () => {
    if (!erreichbar) return;
    const vorher = await db.request.count();
    const antwort = await fetch(`${BASIS}/api/public/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'spam@example.org', website: 'http://spam.example', message: 'Werbung' }),
    });
    expect(antwort.status).toBe(200);
    expect(await db.request.count()).toBe(vorher);
  });
});

describe.runIf(process.env.VITEST_SKIP_API !== '1')('Export', () => {
  it('liefert die Stundenliste als Excel-Datei', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/export/zeiten`, { headers: { cookie: cookieDispo } });
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('content-type')).toContain('spreadsheetml');
    const puffer = Buffer.from(await antwort.arrayBuffer());
    // XLSX ist ein ZIP-Container
    expect(puffer.subarray(0, 2).toString('binary')).toBe('PK');
  });

  it('liefert Events auch als CSV', async () => {
    if (!erreichbar) return;
    const antwort = await fetch(`${BASIS}/api/export/events?format=csv`, { headers: { cookie: cookieDispo } });
    expect(antwort.status).toBe(200);
    const text = await antwort.text();
    expect(text).toContain('Event-ID;Datum;Event');
  });
});

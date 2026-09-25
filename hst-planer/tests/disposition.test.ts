/**
 * Eventanlage, Mitarbeiteranlage und Zuweisung gegen die Datenbank (Spec 67).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, testBenutzer, TEST_USER } from './hilfen/db';
import { eventAnlegen, eventDuplizieren, eventStornieren, serieAnlegen } from '@/lib/domain/events';
import { mitarbeiterAnlegen, mitarbeiterDeaktivieren } from '@/lib/domain/employees';
import { pruefeZuweisung, statusSetzen, zuweisen, zuweisungEntfernen } from '@/lib/domain/assignments';

/*
  Die frisch angelegten Testkraefte haben keine Pflichtschulung und keine
  hinterlegten Unterlagen. Das erzeugt zu Recht eine Warnung (SecPlan 4) –
  deshalb steht in den Tests, in denen es nicht um Konflikte geht,
  `trotzdem: true`. Genau das taete ein Disponent an der Stelle auch.
*/
import { positionAnlegen } from '@/lib/domain/positions';
import { besetzungAus } from '@/lib/queries/coverage';

const MARKE = `DISPO-${Date.now()}`;
const aufraeumen: { events: string[]; mitarbeiter: string[] } = { events: [], mitarbeiter: [] };

function formular(daten: Record<string, string | string[]>): FormData {
  const form = new FormData();
  for (const [schluessel, wert] of Object.entries(daten)) {
    if (Array.isArray(wert)) wert.forEach((w) => form.append(schluessel, w));
    else form.set(schluessel, wert);
  }
  return form;
}

const EVENT_VORLAGE = {
  name: `Testeinsatz ${MARKE}`,
  customerId: null, serviceTypeId: null,
  contactName: null, contactPhone: null, contactEmail: null,
  venue: 'Testhalle', street: null, zip: null, city: 'Hamburg',
  date: '2031-08-12', startTime: '18:00', endTime: '02:00',
  buildUpTime: null, teardownTime: null,
  meetingPoint: 'Tor 1', meetingTime: '17:30',
  eventKind: null, priority: 'NORMAL' as const, status: 'PLANUNG' as const,
  dressCode: 'Schwarz', tasks: null, hints: null, notesInternal: 'intern',
  operationLeadId: null, revenue: null,
};

beforeAll(async () => { await testBenutzer(); });

afterAll(async () => {
  await db.assignment.deleteMany({ where: { eventId: { in: aufraeumen.events } } });
  await db.position.deleteMany({ where: { eventId: { in: aufraeumen.events } } });
  await db.event.deleteMany({ where: { id: { in: aufraeumen.events } } });
  await db.employeeQualification.deleteMany({ where: { employeeId: { in: aufraeumen.mitarbeiter } } });
  await db.availability.deleteMany({ where: { employeeId: { in: aufraeumen.mitarbeiter } } });
  await db.employee.deleteMany({ where: { id: { in: aufraeumen.mitarbeiter } } });
  await db.auditLog.deleteMany({ where: { userId: TEST_USER.id } });
  await db.notification.deleteMany({ where: { title: { contains: MARKE } } });
  await db.$disconnect();
});

describe('Eventanlage', () => {
  it('vergibt eine fortlaufende Event-ID und protokolliert die Anlage', async () => {
    const event = await eventAnlegen(TEST_USER, EVENT_VORLAGE);
    aufraeumen.events.push(event.id);

    expect(event.reference).toMatch(/^EV-\d{4}-\d{4}$/);
    expect(event.name).toBe(EVENT_VORLAGE.name);
    expect(event.date.toISOString().slice(0, 10)).toBe('2031-08-12');

    const protokoll = await db.auditLog.findFirst({ where: { entityId: event.id, action: 'event.create' } });
    expect(protokoll?.summary).toContain(event.reference);
  });

  it('legt Positionen an und führt den Eventstatus nach', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Positionstest ${MARKE}` });
    aufraeumen.events.push(event.id);

    await positionAnlegen(TEST_USER, event.id, formular({
      title: 'Ordnungsdienst', requiredCount: '3', startTime: '18:00', endTime: '02:00', breakMinutes: '30',
    }));

    const mitPositionen = await db.event.findUniqueOrThrow({
      where: { id: event.id },
      include: { positions: { include: { assignments: true } } },
    });
    const b = besetzungAus(mitPositionen.positions);
    expect(b.soll).toBe(3);
    expect(b.ist).toBe(0);
    expect(b.offen).toBe(3);
    expect(mitPositionen.status).toBe('PLANUNG');
  });
});

describe('Mitarbeiteranlage', () => {
  it('vergibt automatisch eine Personalnummer', async () => {
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({
      firstName: 'Testine', lastName: MARKE, employmentType: 'AUSHILFE', active: 'on',
    }));
    aufraeumen.mitarbeiter.push(employee.id);
    expect(employee.personnelNo).toMatch(/^HST-\d{4}$/);
  });

  it('weist doppelte Personalnummern zurück', async () => {
    const erste = await mitarbeiterAnlegen(TEST_USER, formular({
      firstName: 'Erste', lastName: MARKE, personnelNo: `${MARKE}-X`, active: 'on',
    }));
    aufraeumen.mitarbeiter.push(erste.id);

    await expect(mitarbeiterAnlegen(TEST_USER, formular({
      firstName: 'Zweite', lastName: MARKE, personnelNo: `${MARKE}-X`, active: 'on',
    }))).rejects.toMatchObject({ userMessage: expect.stringContaining('bereits vergeben') });
  });

  it('verlangt einen Grund für den Sperrvermerk', async () => {
    await expect(mitarbeiterAnlegen(TEST_USER, formular({
      firstName: 'Gesperrt', lastName: MARKE, blocked: 'on', active: 'on',
    }))).rejects.toMatchObject({ userMessage: expect.stringContaining('Grund') });
  });
});

describe('Zuweisung', () => {
  it('teilt einen Mitarbeiter ein und setzt das Event auf teilbesetzt', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Zuweisung ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({
      title: 'Einlass', requiredCount: '2', startTime: '18:00', endTime: '02:00', breakMinutes: '30',
    }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Anton', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    const assignment = await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true });
    expect(assignment.status).toBe('ANGEFRAGT');

    const nachher = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(nachher.status).toBe('TEILBESETZT');

    const protokoll = await db.auditLog.findFirst({ where: { entityId: assignment.id, action: 'assignment.create' } });
    expect(protokoll?.summary).toContain('Anton');
  });

  it('verhindert eine doppelte Zuweisung auf dieselbe Position', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Doppelt ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '2' }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Berta', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true });
    await expect(zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('steht bereits auf dieser Position') });
  });

  it('erkennt eine Überschneidung am selben Tag', async () => {
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Carla', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    const ersterEinsatz = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Frueh ${MARKE}`, startTime: '18:00', endTime: '23:00' });
    const zweiterEinsatz = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Spät ${MARKE}`, startTime: '20:00', endTime: '02:00' });
    aufraeumen.events.push(ersterEinsatz.id, zweiterEinsatz.id);

    const p1 = await positionAnlegen(TEST_USER, ersterEinsatz.id, formular({ title: 'Einlass Nord', requiredCount: '1', startTime: '18:00', endTime: '23:00' }));
    const p2 = await positionAnlegen(TEST_USER, zweiterEinsatz.id, formular({ title: 'Einlass Süd', requiredCount: '1', startTime: '20:00', endTime: '02:00' }));

    await zuweisen(TEST_USER, { positionId: p1.id, employeeId: employee.id, trotzdem: true });
    const konflikte = await pruefeZuweisung(p2.id, employee.id);
    expect(konflikte.some((k) => k.art === 'UEBERSCHNEIDUNG' && k.blockierend)).toBe(true);

    await expect(zuweisen(TEST_USER, { positionId: p2.id, employeeId: employee.id }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('nicht möglich') });
  });

  it('warnt bei Abwesenheit, lässt die Zuweisung aber bewusst zu', async () => {
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Dora', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);
    await db.availability.create({
      data: { employeeId: employee.id, kind: 'URLAUB', from: new Date('2031-08-01T00:00:00Z'), to: new Date('2031-08-20T00:00:00Z') },
    });

    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Urlaub ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));

    await expect(zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id }))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('bestätigen') });

    const assignment = await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true });
    expect(assignment.id).toBeTruthy();
  });

  it('meldet eine Absage an die Disposition und gibt die Position frei', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Absage ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Emil', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    const assignment = await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true, status: 'ZUGESAGT' });
    let nachher = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(nachher.status).toBe('BESETZT');

    await statusSetzen(TEST_USER, assignment.id, 'ABGESAGT', 'krank');
    nachher = await db.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(nachher.status).toBe('PLANUNG');

    const meldung = await db.notification.findFirst({ where: { kind: 'EINSATZ_ABGESAGT', title: { contains: 'Emil' } } });
    expect(meldung).not.toBeNull();
  });

  it('entfernt eine Zuweisung per Soft Delete', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Entfernen ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Frieda', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    const assignment = await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true });
    await zuweisungEntfernen(TEST_USER, assignment.id, 'Planaenderung');

    const geloescht = await db.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    expect(geloescht.deletedAt).not.toBeNull(); // Datensatz bleibt erhalten (Spec 73)
  });
});

describe('Duplizieren und Serien (Spec 33/34)', () => {
  it('übernimmt Positionen und macht Zuweisungen zu Vorschlägen', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Vorlage ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Ordner', requiredCount: '2', startTime: '18:00', endTime: '02:00' }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Gustav', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);
    await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true, status: 'ZUGESAGT' });

    const kopie = await eventDuplizieren(TEST_USER, event.id, { datum: '2031-08-19', mitZuweisungen: true });
    aufraeumen.events.push(kopie.id);

    const geladen = await db.event.findUniqueOrThrow({
      where: { id: kopie.id },
      include: { positions: { include: { assignments: true } } },
    });
    expect(geladen.date.toISOString().slice(0, 10)).toBe('2031-08-19');
    expect(geladen.positions).toHaveLength(1);
    expect(geladen.positions[0]!.requiredCount).toBe(2);
    // Uebernommene Kräfte stehen als Vorschlag, nicht als feste Einteilung.
    expect(geladen.positions[0]!.assignments[0]!.status).toBe('VORGESCHLAGEN');
  });

  it('legt eine woechentliche Serie an', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Serie ${MARKE}` });
    aufraeumen.events.push(event.id);
    await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));

    const erzeugt = await serieAnlegen(TEST_USER, event.id, { rhythmus: 'WOECHENTLICH', anzahl: 3, mitZuweisungen: false });
    aufraeumen.events.push(...erzeugt);
    expect(erzeugt).toHaveLength(3);

    const serie = await db.event.findMany({ where: { seriesId: event.id }, orderBy: { date: 'asc' } });
    expect(serie).toHaveLength(4); // Ursprung + 3 Folgetermine
    expect(serie[1]!.date.toISOString().slice(0, 10)).toBe('2031-08-19');
    expect(serie[3]!.date.toISOString().slice(0, 10)).toBe('2031-09-02');
  });
});

describe('Stornieren und Deaktivieren (Spec 73)', () => {
  it('storniert ein Event und benachrichtigt die Kräfte', async () => {
    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Storno ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Hanna', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);
    await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true, status: 'ZUGESAGT' });

    await eventStornieren(TEST_USER, event.id, 'Kunde hat abgesagt');

    const nachher = await db.event.findUniqueOrThrow({ where: { id: event.id }, include: { assignments: true } });
    expect(nachher.status).toBe('STORNIERT');
    expect(nachher.assignments.every((a) => a.status === 'STORNIERT')).toBe(true);
  });

  it('deaktiviert einen Mitarbeiter nur ohne kommende Einsätze', async () => {
    const employee = await mitarbeiterAnlegen(TEST_USER, formular({ firstName: 'Ida', lastName: MARKE, active: 'on' }));
    aufraeumen.mitarbeiter.push(employee.id);

    const event = await eventAnlegen(TEST_USER, { ...EVENT_VORLAGE, name: `Bindung ${MARKE}` });
    aufraeumen.events.push(event.id);
    const position = await positionAnlegen(TEST_USER, event.id, formular({ title: 'Posten', requiredCount: '1' }));
    const assignment = await zuweisen(TEST_USER, { positionId: position.id, employeeId: employee.id, trotzdem: true });

    await expect(mitarbeiterDeaktivieren(TEST_USER, employee.id, 'Vertragsende'))
      .rejects.toMatchObject({ userMessage: expect.stringContaining('kommende Einsätze') });

    await zuweisungEntfernen(TEST_USER, assignment.id);
    await mitarbeiterDeaktivieren(TEST_USER, employee.id, 'Vertragsende');

    const nachher = await db.employee.findUniqueOrThrow({ where: { id: employee.id } });
    expect(nachher.active).toBe(false);
    expect(nachher.deletedAt).toBeNull(); // wird nicht gelöscht, nur deaktiviert
  });
});

/**
 * Durchlauf durch den kompletten Abgleich gegen die echte Datenbank:
 * Event und Zuweisungen anlegen, Stundenzettel erzeugen, hochladen,
 * abgleichen, korrigieren und abschliessen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { db, testBenutzer, TEST_USER } from './hilfen/db';
import { abgleichAbschliessen, abgleichStarten, dateiHochladen, unkritischeBestaetigen, zeileIgnorieren, zeileKorrigieren } from '@/lib/domain/reconciliation';

const MARKE = `TEST-${Date.now()}`;
let eventId = '';
let positionId = '';
let reconciliationId = '';
const mitarbeiterIds: string[] = [];
const datum = new Date(Date.UTC(2031, 4, 17)); // weit weg von den Seed-Daten

async function stundenzettel(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Stunden');
  ws.addRow(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause', 'Event']);
  // 1: exakt, 2: gedreht + Zeitabweichung, 3: unbekannte Person, 4: Duplikat von 1
  ws.addRow([`Anton ${MARKE}`, '17.05.2031', '17:00', '01:00', 30, 'Testeinsatz']);
  ws.addRow([`${MARKE} Berta`, '17.05.2031', '17:05', '01:40', 30, 'Testeinsatz']);
  ws.addRow(['Niemand Unbekannt', '17.05.2031', '17:00', '01:00', 30, 'Testeinsatz']);
  ws.addRow([`Anton ${MARKE}`, '17.05.2031', '17:00', '01:00', 30, 'Testeinsatz']);
  const puffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([puffer], 'test-stundenzettel.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

beforeAll(async () => {
  await testBenutzer();

  for (const vorname of ['Anton', 'Berta', 'Cesar']) {
    const employee = await db.employee.create({
      data: { personnelNo: `${MARKE}-${vorname}`, firstName: vorname, lastName: MARKE },
    });
    mitarbeiterIds.push(employee.id);
  }

  const event = await db.event.create({
    data: {
      reference: `EV-TEST-${MARKE}`, name: 'Testeinsatz', date: datum,
      startTime: '17:00', endTime: '01:00', status: 'BESTAETIGT',
      positions: {
        create: { title: 'Testposition', requiredCount: 3, startTime: '17:00', endTime: '01:00', breakMinutes: 30 },
      },
    },
    include: { positions: true },
  });
  eventId = event.id;
  positionId = event.positions[0]!.id;

  for (const employeeId of mitarbeiterIds) {
    await db.assignment.create({
      data: {
        eventId, positionId, employeeId, status: 'EINGETEILT',
        plannedStart: '17:00', plannedEnd: '01:00', plannedBreakMinutes: 30,
      },
    });
  }
});

afterAll(async () => {
  await db.reconciliationRow.deleteMany({ where: { reconciliationId } });
  await db.reconciliation.deleteMany({ where: { id: reconciliationId } });
  await db.timeEntry.deleteMany({ where: { employeeId: { in: mitarbeiterIds } } });
  await db.assignment.deleteMany({ where: { eventId } });
  await db.position.deleteMany({ where: { eventId } });
  await db.event.deleteMany({ where: { id: eventId } });
  await db.employeeQualification.deleteMany({ where: { employeeId: { in: mitarbeiterIds } } });
  await db.employee.deleteMany({ where: { id: { in: mitarbeiterIds } } });
  await db.auditLog.deleteMany({ where: { userId: TEST_USER.id } });
  await db.$disconnect();
});

describe('Abgleich von Anfang bis Ende', () => {
  it('liest die Datei und schlaegt die Spalten vor', async () => {
    const vorschau = await dateiHochladen(TEST_USER, await stundenzettel(), `Test ${MARKE}`);
    reconciliationId = vorschau.reconciliationId;

    expect(vorschau.headers).toEqual(['Mitarbeiter', 'Datum', 'Beginn', 'Ende', 'Pause', 'Event']);
    expect(vorschau.mapping.name).toBe('Mitarbeiter');
    expect(vorschau.mapping.start).toBe('Beginn');
    expect(vorschau.fehlendePflichtfelder).toEqual([]);
    expect(vorschau.gesamtZeilen).toBe(4);
  });

  it('erkennt beim Abgleich alle Faelle', async () => {
    const zusammenfassung = await abgleichStarten(TEST_USER, reconciliationId, {
      mapping: { name: 'Mitarbeiter', date: 'Datum', start: 'Beginn', end: 'Ende', break: 'Pause', event: 'Event' },
      toleranzMinuten: 15,
    });

    expect(zusammenfassung.totalRows).toBe(5);   // 4 Zeilen + 1 geplante Kraft ohne Ist-Zeit
    expect(zusammenfassung.duplicateRows).toBe(1);
    expect(zusammenfassung.unknownRows).toBe(1);
    expect(zusammenfassung.missingRows).toBe(1);
    expect(zusammenfassung.deviationRows).toBe(1);

    const zeilen = await db.reconciliationRow.findMany({ where: { reconciliationId }, orderBy: { rowNumber: 'asc' } });
    expect(zeilen.find((z) => z.rowNumber === 2)?.status).toBe('OK');
    // Gedrehter Name wurde trotzdem zugeordnet
    expect(zeilen.find((z) => z.rowNumber === 3)?.employeeId).toBe(mitarbeiterIds[1]);
    expect(zeilen.find((z) => z.rowNumber === 3)?.diffMinutes).toBe(35);
    expect(zeilen.find((z) => z.rowNumber === 5)?.status).toBe('DUPLIKAT');
  });

  it('verhindert den Abschluss, solange Zeilen ungeklaert sind', async () => {
    await expect(abgleichAbschliessen(TEST_USER, reconciliationId)).rejects.toMatchObject({
      userMessage: expect.stringContaining('ungeklaert'),
    });
  });

  it('bestaetigt unkritische Abweichungen in einem Zug', async () => {
    const anzahl = await unkritischeBestaetigen(TEST_USER, reconciliationId, 60);
    expect(anzahl).toBe(1);
    const geprueft = await db.reconciliationRow.count({ where: { reconciliationId, status: 'GEPRUEFT' } });
    expect(geprueft).toBe(1);
  });

  it('laesst die ungeklaerten Zeilen manuell aufloesen', async () => {
    const zeilen = await db.reconciliationRow.findMany({ where: { reconciliationId } });
    const unbekannt = zeilen.find((z) => z.status === 'UNBEKANNT')!;
    const duplikat = zeilen.find((z) => z.status === 'DUPLIKAT')!;

    // Unbekannte Person von Hand dem dritten Mitarbeiter zuordnen
    await zeileKorrigieren(TEST_USER, unbekannt.id, {
      employeeId: mitarbeiterIds[2]!,
      assignmentId: (await db.assignment.findFirst({ where: { eventId, employeeId: mitarbeiterIds[2]! } }))!.id,
      comment: 'Von Hand zugeordnet',
    });
    await zeileIgnorierenAktionErsatz(duplikat.id);

    const nachher = await db.reconciliationRow.findUnique({ where: { id: unbekannt.id } });
    expect(nachher?.status).toBe('GEPRUEFT');
    expect(nachher?.employeeId).toBe(mitarbeiterIds[2]);
    expect(nachher?.plannedMinutes).toBe(450);
    expect(nachher?.actualMinutes).toBe(450);
    expect(nachher?.diffMinutes).toBe(0);
  });

  it('schreibt beim Abschluss die Zeiten in die Zeiterfassung', async () => {
    const ergebnis = await abgleichAbschliessen(TEST_USER, reconciliationId);
    expect(ergebnis.geschrieben).toBe(3);

    const zeiten = await db.timeEntry.findMany({ where: { employeeId: { in: mitarbeiterIds } } });
    expect(zeiten).toHaveLength(3);
    // Nachtschicht 17:00–01:00 abzueglich 30 Minuten Pause
    expect(zeiten.find((z) => z.employeeId === mitarbeiterIds[0])?.minutes).toBe(450);
    expect(zeiten.every((z) => z.status === 'GEPRUEFT')).toBe(true);

    const abgleich = await db.reconciliation.findUnique({ where: { id: reconciliationId } });
    expect(abgleich?.status).toBe('ABGESCHLOSSEN');
    expect(abgleich?.closedAt).toBeInstanceOf(Date);
  });

  it('protokolliert eine Aenderung nach dem Abschluss gesondert', async () => {
    const zeile = await db.reconciliationRow.findFirst({ where: { reconciliationId, status: 'OK' } });
    if (zeile) {
      await zeileKorrigieren(TEST_USER, zeile.id, { comment: 'Nachtraegliche Korrektur' });
      const eintrag = await db.auditLog.findFirst({
        where: { entityId: zeile.id, action: 'reconciliation.row.change_after_close' },
      });
      expect(eintrag).not.toBeNull();
      expect(eintrag?.summary).toContain('nach Abschluss');
    }
  });
});

async function zeileIgnorierenAktionErsatz(rowId: string) {
  await zeileIgnorieren(TEST_USER, rowId, 'Doppelt erfasst');
}

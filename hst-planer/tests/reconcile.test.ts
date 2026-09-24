import { describe, expect, it } from 'vitest';
import { reconcile, type ActualRow, type EmployeeRef, type PlannedShift } from '@/lib/reconcile/engine';

const employees: EmployeeRef[] = [
  { id: 'e1', firstName: 'Max', lastName: 'Mustermann', personnelNo: 'HST-001' },
  { id: 'e2', firstName: 'Lena', lastName: 'Bergmann', personnelNo: 'HST-002' },
  { id: 'e3', firstName: 'Ayse', lastName: 'Yilmaz', personnelNo: 'HST-003' },
];

function shift(partial: Partial<PlannedShift> & { assignmentId: string; employeeId: string }): PlannedShift {
  return {
    eventId: 'ev1', eventReference: 'EV-2026-0001', eventName: 'HSV Spieltag',
    positionId: 'p1', positionTitle: 'Ordnungsdienst Sued',
    date: '2026-10-15', start: '17:00', end: '01:00', breakMinutes: 30,
    ...partial,
  };
}

const planned: PlannedShift[] = [
  shift({ assignmentId: 'a1', employeeId: 'e1' }),
  shift({ assignmentId: 'a2', employeeId: 'e2' }),
  shift({ assignmentId: 'a3', employeeId: 'e3' }),
];

function row(rowNumber: number, partial: Partial<ActualRow>): ActualRow {
  return { rowNumber, name: '', date: '15.10.2026', start: '17:00', end: '01:00', break: 30, ...partial };
}

describe('Abgleich – Grundfaelle', () => {
  it('erkennt identische Zeiten als OK', () => {
    const result = reconcile([row(2, { name: 'Max Mustermann' })], planned.slice(0, 1), employees, { reportMissing: false });
    expect(result.rows[0]!.status).toBe('OK');
    expect(result.rows[0]!.diffMinutes).toBe(0);
    expect(result.summary.matchedRows).toBe(1);
  });

  it('erkennt gedrehte Namen und Tippfehler', () => {
    const result = reconcile(
      [row(2, { name: 'Mustermann Max' }), row(3, { name: 'Bergmann, Lena' })],
      planned.slice(0, 2), employees, { reportMissing: false },
    );
    expect(result.rows.map((r) => r.employeeId)).toEqual(['e1', 'e2']);
  });

  it('meldet Abweichungen oberhalb der Toleranz', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', start: '17:05', end: '01:30' })],
      planned.slice(0, 1), employees, { reportMissing: false, toleranceMinutes: 15 },
    );
    const r = result.rows[0]!;
    expect(r.status).toBe('ABWEICHUNG');
    expect(r.issues).toContain('ENDZEIT_ABWEICHEND');
    expect(r.issues).not.toContain('STARTZEIT_ABWEICHEND'); // 5 Minuten liegen in der Toleranz
    expect(r.diffMinutes).toBe(25); // 5 Minuten spaeter begonnen, 30 Minuten laenger geblieben
    expect(result.summary.deviationRows).toBe(1);
  });

  it('rechnet Nachtschichten korrekt (Spec 69)', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', start: '18:00', end: '02:00', break: 0 })],
      [shift({ assignmentId: 'a1', employeeId: 'e1', start: '18:00', end: '02:00', breakMinutes: 0 })],
      employees, { reportMissing: false },
    );
    expect(result.rows[0]!.actualMinutes).toBe(480);
    expect(result.rows[0]!.plannedMinutes).toBe(480);
  });
});

describe('Abgleich – Sonderfaelle (Spec 68)', () => {
  it('meldet unbekannte Mitarbeiter', () => {
    const result = reconcile([row(2, { name: 'Petra Schneider' })], planned, employees, { reportMissing: false });
    expect(result.rows[0]!.status).toBe('UNBEKANNT');
    expect(result.rows[0]!.issues).toContain('MITARBEITER_UNBEKANNT');
    expect(result.summary.unknownRows).toBe(1);
  });

  it('meldet doppelte Datensaetze', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann' }), row(3, { name: 'Max Mustermann' })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[1]!.status).toBe('DUPLIKAT');
    expect(result.summary.duplicateRows).toBe(1);
  });

  it('meldet geplante Mitarbeiter ohne Ist-Zeit', () => {
    const result = reconcile([row(2, { name: 'Max Mustermann' })], planned, employees);
    const fehlend = result.rows.filter((r) => r.status === 'FEHLEND');
    expect(fehlend).toHaveLength(2);
    expect(fehlend[0]!.issues).toContain('KEINE_IST_ZEIT');
    expect(result.summary.missingRows).toBe(2);
  });

  it('meldet Ist-Zeiten ohne Planung', () => {
    const result = reconcile(
      [row(2, { name: 'Ayse Yilmaz', date: '16.10.2026' })],
      planned, employees, { reportMissing: false },
    );
    const r = result.rows[0]!;
    expect(r.status).toBe('ZUSAETZLICH');
    expect(r.issues).toContain('NICHT_GEPLANT');
    expect(r.issues).toContain('DATUM_ABWEICHEND'); // am Vortag war der Einsatz geplant
  });

  it('meldet fehlende Zeitangaben', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', end: '' })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[0]!.issues).toContain('ENDZEIT_FEHLT');
    expect(result.rows[0]!.actualMinutes).toBeNull();
  });

  it('meldet unlesbare Datumsangaben', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', date: 'naechste Woche' })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[0]!.issues).toContain('DATUM_UNGUELTIG');
  });

  it('erkennt ein abweichendes Event', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', event: 'Hafengeburtstag' })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[0]!.issues).toContain('EVENT_ABWEICHEND');
  });

  it('nutzt das Event zur Auswahl bei zwei Einsaetzen am selben Tag', () => {
    const zweiEinsaetze = [
      shift({ assignmentId: 'a1', employeeId: 'e1', start: '08:00', end: '12:00', breakMinutes: 0 }),
      shift({ assignmentId: 'a2', employeeId: 'e1', eventId: 'ev2', eventReference: 'EV-2026-0002', eventName: 'Messe Hamburg', start: '17:00', end: '23:00', breakMinutes: 0 }),
    ];
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', start: '17:00', end: '23:00', break: 0, event: 'Messe Hamburg' })],
      zweiEinsaetze, employees, { reportMissing: false },
    );
    expect(result.rows[0]!.eventId).toBe('ev2');
    expect(result.rows[0]!.status).toBe('OK');
  });

  it('ordnet ueber die Personalnummer auch bei abweichendem Namen zu', () => {
    const result = reconcile(
      [row(2, { name: 'M. Mustermann jun.', personnelNo: 'HST-001' })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[0]!.employeeId).toBe('e1');
    expect(result.rows[0]!.matchScore).toBe(1);
  });

  it('liefert eine vollstaendige Zusammenfassung (Spec 21)', () => {
    const rows: ActualRow[] = [
      row(2, { name: 'Max Mustermann' }),
      row(3, { name: 'Lena Bergmann', end: '02:00' }),
      row(4, { name: 'Unbekannt Person' }),
      row(5, { name: 'Max Mustermann' }),
    ];
    const result = reconcile(rows, planned, employees);
    expect(result.summary.totalRows).toBe(5); // 4 Zeilen + 1 fehlender Mitarbeiter
    expect(result.summary.matchedRows).toBe(2);
    expect(result.summary.deviationRows).toBe(1);
    expect(result.summary.unknownRows).toBe(1);
    expect(result.summary.duplicateRows).toBe(1);
    expect(result.summary.missingRows).toBe(1);
    expect(result.periodFrom).toBe('2026-10-15');
  });
});

describe('Pausen', () => {
  it('liest Pausen in verschiedenen Schreibweisen', () => {
    const variants: Array<[unknown, number]> = [[30, 30], ['30', 30], ['0:30', 30], ['0,5 h', 30], ['45 min', 45]];
    for (const [input, expected] of variants) {
      const result = reconcile(
        [row(2, { name: 'Max Mustermann', break: input })],
        planned.slice(0, 1), employees, { reportMissing: false },
      );
      expect(result.rows[0]!.actualBreak, String(input)).toBe(expected);
    }
  });

  it('meldet abweichende Pausen', () => {
    const result = reconcile(
      [row(2, { name: 'Max Mustermann', break: 90 })],
      planned.slice(0, 1), employees, { reportMissing: false },
    );
    expect(result.rows[0]!.issues).toContain('PAUSE_ABWEICHEND');
  });
});

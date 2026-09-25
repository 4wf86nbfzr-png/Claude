/**
 * Abgleich Planung gegen Ist-Zeiten (Spec 19-23, 68).
 *
 * Die Funktion ist bewusst frei von Datenbank- und Framework-Code:
 * Sie bekommt die Planung und die eingelesenen Zeilen und liefert das
 * vollständige Ergebnis zurück. Dadurch ist sie testbar und lässt sich
 * später auch für Vorschau ("Was wäre, wenn") ohne Schreibzugriff nutzen.
 */

import { matchName, nameSimilarity, normalizeName, type MatchCandidate } from '../match';
import {
  formatMinutes,
  isoDate,
  normalizeTime,
  parseGermanDate,
  parseTimeToMinutes,
  shiftMinutes,
  timeDiffMinutes,
} from '../time';

export type RowStatus =
  | 'OK'
  | 'ABWEICHUNG'
  | 'FEHLEND'
  | 'UNBEKANNT'
  | 'ZUSAETZLICH'
  | 'DUPLIKAT'
  | 'MEHRDEUTIG';

/** Fachliche Befunde je Zeile – erscheinen als Chips in der Abgleich-Tabelle. */
export type Issue =
  | 'MITARBEITER_UNBEKANNT'
  | 'MITARBEITER_MEHRDEUTIG'
  | 'NICHT_GEPLANT'
  | 'KEINE_IST_ZEIT'
  | 'STARTZEIT_FEHLT'
  | 'ENDZEIT_FEHLT'
  | 'DATUM_FEHLT'
  | 'DATUM_UNGUELTIG'
  | 'DATUM_ABWEICHEND'
  | 'EVENT_ABWEICHEND'
  | 'EVENT_UNBEKANNT'
  | 'STARTZEIT_ABWEICHEND'
  | 'ENDZEIT_ABWEICHEND'
  | 'PAUSE_ABWEICHEND'
  | 'DOPPELTER_DATENSATZ';

export const ISSUE_LABEL: Record<Issue, string> = {
  MITARBEITER_UNBEKANNT: 'Mitarbeiter unbekannt',
  MITARBEITER_MEHRDEUTIG: 'Mehrere ähnliche Treffer',
  NICHT_GEPLANT: 'Nicht geplant',
  KEINE_IST_ZEIT: 'Keine Ist-Zeit',
  STARTZEIT_FEHLT: 'Startzeit fehlt',
  ENDZEIT_FEHLT: 'Endzeit fehlt',
  DATUM_FEHLT: 'Datum fehlt',
  DATUM_UNGUELTIG: 'Datum unlesbar',
  DATUM_ABWEICHEND: 'Datum weicht ab',
  EVENT_ABWEICHEND: 'Anderes Event',
  EVENT_UNBEKANNT: 'Event nicht gefunden',
  STARTZEIT_ABWEICHEND: 'Startzeit weicht ab',
  ENDZEIT_ABWEICHEND: 'Endzeit weicht ab',
  PAUSE_ABWEICHEND: 'Pause weicht ab',
  DOPPELTER_DATENSATZ: 'Doppelter Datensatz',
};

export interface EmployeeRef {
  id: string;
  firstName: string;
  lastName: string;
  personnelNo: string;
}

export interface PlannedShift {
  assignmentId: string;
  employeeId: string;
  eventId: string;
  eventReference: string;
  eventName: string;
  positionId: string;
  positionTitle: string;
  /** ISO-Datum "YYYY-MM-DD". */
  date: string;
  start: string | null;
  end: string | null;
  breakMinutes: number;
}

export interface ActualRow {
  rowNumber: number;
  name: string;
  personnelNo?: string | null;
  date?: unknown;
  start?: unknown;
  end?: unknown;
  break?: unknown;
  event?: string | null;
  position?: string | null;
  note?: string | null;
  raw?: Record<string, unknown>;
}

export interface ReconcileOptions {
  /** Abweichung in Minuten, die noch als "identisch" gilt. */
  toleranceMinutes?: number;
  /** Pausenabweichung in Minuten, die noch als "identisch" gilt. */
  breakToleranceMinutes?: number;
  /** Geplante Schichten ohne Ist-Zeit melden (nur innerhalb des Datei-Zeitraums). */
  reportMissing?: boolean;
  referenceDate?: Date;
}

export interface ResultRow {
  rowNumber: number;
  status: RowStatus;
  issues: Issue[];
  matchScore: number;

  rawName: string | null;
  rawDate: string | null;
  rawStart: string | null;
  rawEnd: string | null;
  rawBreak: string | null;
  rawEvent: string | null;
  rawPosition: string | null;
  raw: Record<string, unknown> | null;

  employeeId: string | null;
  employeeName: string | null;
  candidates: Array<{ employeeId: string; name: string; score: number }>;

  assignmentId: string | null;
  eventId: string | null;
  eventName: string | null;
  positionId: string | null;

  date: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  plannedBreak: number | null;
  plannedMinutes: number | null;
  actualStart: string | null;
  actualEnd: string | null;
  actualBreak: number | null;
  actualMinutes: number | null;
  diffMinutes: number | null;

  comment: string | null;
}

export interface ReconcileSummary {
  totalRows: number;
  matchedRows: number;
  deviationRows: number;
  unknownRows: number;
  duplicateRows: number;
  missingRows: number;
  extraRows: number;
  ambiguousRows: number;
}

export interface ReconcileResult {
  rows: ResultRow[];
  summary: ReconcileSummary;
  periodFrom: string | null;
  periodTo: string | null;
}

const EMPTY_SUMMARY: ReconcileSummary = {
  totalRows: 0, matchedRows: 0, deviationRows: 0, unknownRows: 0,
  duplicateRows: 0, missingRows: 0, extraRows: 0, ambiguousRows: 0,
};

export function reconcile(
  actualRows: readonly ActualRow[],
  planned: readonly PlannedShift[],
  employees: readonly EmployeeRef[],
  options: ReconcileOptions = {},
): ReconcileResult {
  const {
    toleranceMinutes = 15,
    breakToleranceMinutes = 15,
    reportMissing = true,
    referenceDate = new Date(),
  } = options;

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const byPersonnelNo = new Map(
    employees.filter((e) => e.personnelNo).map((e) => [e.personnelNo.trim().toLowerCase(), e]),
  );

  // Planung nach Mitarbeiter + Datum gruppieren.
  const planIndex = new Map<string, PlannedShift[]>();
  for (const shift of planned) {
    const key = `${shift.employeeId}|${shift.date}`;
    const list = planIndex.get(key);
    if (list) list.push(shift);
    else planIndex.set(key, [shift]);
  }

  const usedAssignments = new Set<string>();
  const seenKeys = new Map<string, number>();
  const rows: ResultRow[] = [];
  const dates: string[] = [];

  for (const actual of actualRows) {
    const issues: Issue[] = [];
    const row = blankRow(actual);

    // --- Mitarbeiter bestimmen -------------------------------------------
    let employee: EmployeeRef | null = null;
    let score = 0;
    let candidates: Array<MatchCandidate<EmployeeRef>> = [];
    let ambiguous = false;

    const pnr = actual.personnelNo ? String(actual.personnelNo).trim().toLowerCase() : '';
    if (pnr && byPersonnelNo.has(pnr)) {
      employee = byPersonnelNo.get(pnr)!;
      score = 1;
    } else if (actual.name?.trim()) {
      const result = matchName(actual.name, employees, (e) => [
        `${e.firstName} ${e.lastName}`,
        `${e.lastName} ${e.firstName}`,
        e.personnelNo,
      ]);
      employee = result.match;
      score = result.score;
      candidates = result.candidates;
      ambiguous = result.ambiguous;
    }

    row.matchScore = score;
    row.candidates = candidates.map((c) => ({
      employeeId: c.item.id,
      name: `${c.item.firstName} ${c.item.lastName}`,
      score: c.score,
    }));
    if (employee) {
      row.employeeId = employee.id;
      row.employeeName = `${employee.firstName} ${employee.lastName}`;
    }

    // --- Datum ------------------------------------------------------------
    const parsedDate = actual.date == null || actual.date === ''
      ? null
      : parseGermanDate(actual.date, referenceDate);
    if (actual.date == null || actual.date === '') issues.push('DATUM_FEHLT');
    else if (!parsedDate) issues.push('DATUM_UNGUELTIG');
    if (parsedDate) {
      row.date = isoDate(parsedDate);
      dates.push(row.date);
    }

    // --- Ist-Zeiten -------------------------------------------------------
    row.actualStart = normalizeTime(actual.start);
    row.actualEnd = normalizeTime(actual.end);
    row.actualBreak = parseBreak(actual.break);
    if (!row.actualStart) issues.push('STARTZEIT_FEHLT');
    if (!row.actualEnd) issues.push('ENDZEIT_FEHLT');
    if (row.actualStart && row.actualEnd) {
      row.actualMinutes = shiftMinutes(row.actualStart, row.actualEnd, row.actualBreak ?? 0);
    }

    // --- Duplikate --------------------------------------------------------
    const dupKey = [
      employee?.id ?? normalizeName(actual.name ?? ''),
      row.date ?? '',
      row.actualStart ?? '',
      row.actualEnd ?? '',
    ].join('|');
    const firstSeen = seenKeys.get(dupKey);
    if (firstSeen !== undefined && dupKey.replace(/\|/g, '') !== '') {
      issues.push('DOPPELTER_DATENSATZ');
      row.issues = issues;
      row.status = 'DUPLIKAT';
      row.comment = `Gleicher Datensatz wie Zeile ${firstSeen}.`;
      rows.push(row);
      continue;
    }
    seenKeys.set(dupKey, actual.rowNumber);

    if (!employee) {
      issues.push(ambiguous ? 'MITARBEITER_MEHRDEUTIG' : 'MITARBEITER_UNBEKANNT');
      row.issues = issues;
      row.status = ambiguous ? 'MEHRDEUTIG' : 'UNBEKANNT';
      rows.push(row);
      continue;
    }

    // --- Passende Planung suchen -----------------------------------------
    const shift = row.date
      ? pickPlannedShift(planIndex, employee.id, row.date, actual, usedAssignments)
      : null;

    if (!shift) {
      // Ist-Zeit vorhanden, aber nicht geplant (Spec 68/17).
      issues.push('NICHT_GEPLANT');
      // Falls der Mitarbeiter an einem anderen Tag geplant war, ist das ein Datumsfehler.
      if (row.date && hasPlanNearby(planIndex, employee.id, row.date)) issues.push('DATUM_ABWEICHEND');
      if (actual.event && !matchesAnyEvent(planned, actual.event)) issues.push('EVENT_UNBEKANNT');
      row.issues = issues;
      row.status = 'ZUSAETZLICH';
      rows.push(row);
      continue;
    }

    usedAssignments.add(shift.assignmentId);
    row.assignmentId = shift.assignmentId;
    row.eventId = shift.eventId;
    row.eventName = shift.eventName;
    row.positionId = shift.positionId;
    row.plannedStart = shift.start;
    row.plannedEnd = shift.end;
    row.plannedBreak = shift.breakMinutes;
    row.plannedMinutes = shift.start && shift.end
      ? shiftMinutes(shift.start, shift.end, shift.breakMinutes)
      : null;

    if (actual.event?.trim() && !eventMatches(shift, actual.event)) issues.push('EVENT_ABWEICHEND');

    const startDiff = timeDiffMinutes(shift.start, row.actualStart);
    const endDiff = timeDiffMinutes(shift.end, row.actualEnd);
    if (startDiff != null && Math.abs(startDiff) > toleranceMinutes) issues.push('STARTZEIT_ABWEICHEND');
    if (endDiff != null && Math.abs(endDiff) > toleranceMinutes) issues.push('ENDZEIT_ABWEICHEND');
    if (
      row.actualBreak != null &&
      Math.abs(row.actualBreak - shift.breakMinutes) > breakToleranceMinutes
    ) issues.push('PAUSE_ABWEICHEND');

    if (row.plannedMinutes != null && row.actualMinutes != null) {
      row.diffMinutes = row.actualMinutes - row.plannedMinutes;
    }

    row.issues = issues;
    row.status = issues.length === 0 ? 'OK' : 'ABWEICHUNG';
    rows.push(row);
  }

  // --- Geplant, aber keine Ist-Zeit (Spec 68/16) --------------------------
  const periodFrom = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
  const periodTo = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;

  let nextRowNumber = actualRows.reduce((max, r) => Math.max(max, r.rowNumber), 0) + 1;
  if (reportMissing && periodFrom && periodTo) {
    for (const shift of planned) {
      if (usedAssignments.has(shift.assignmentId)) continue;
      if (shift.date < periodFrom || shift.date > periodTo) continue;
      const employee = employeeById.get(shift.employeeId);
      rows.push({
        ...blankRow({ rowNumber: nextRowNumber++, name: '' }),
        status: 'FEHLEND',
        issues: ['KEINE_IST_ZEIT'],
        matchScore: 1,
        rawName: employee ? `${employee.firstName} ${employee.lastName}` : null,
        employeeId: shift.employeeId,
        employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
        assignmentId: shift.assignmentId,
        eventId: shift.eventId,
        eventName: shift.eventName,
        positionId: shift.positionId,
        date: shift.date,
        plannedStart: shift.start,
        plannedEnd: shift.end,
        plannedBreak: shift.breakMinutes,
        plannedMinutes: shift.start && shift.end ? shiftMinutes(shift.start, shift.end, shift.breakMinutes) : null,
      });
    }
  }

  return { rows, summary: summarize(rows), periodFrom, periodTo };
}

export function summarize(rows: readonly ResultRow[]): ReconcileSummary {
  const summary: ReconcileSummary = { ...EMPTY_SUMMARY, totalRows: rows.length };
  for (const row of rows) {
    switch (row.status) {
      case 'OK': summary.matchedRows++; break;
      case 'ABWEICHUNG': summary.matchedRows++; summary.deviationRows++; break;
      case 'UNBEKANNT': summary.unknownRows++; break;
      case 'MEHRDEUTIG': summary.unknownRows++; summary.ambiguousRows++; break;
      case 'DUPLIKAT': summary.duplicateRows++; break;
      case 'FEHLEND': summary.missingRows++; break;
      case 'ZUSAETZLICH': summary.extraRows++; break;
    }
  }
  return summary;
}

// ------------------------------------------------------------------ Hilfen

function blankRow(actual: Pick<ActualRow, 'rowNumber' | 'name'> & Partial<ActualRow>): ResultRow {
  return {
    rowNumber: actual.rowNumber,
    status: 'ABWEICHUNG',
    issues: [],
    matchScore: 0,
    rawName: actual.name?.trim() || null,
    rawDate: actual.date == null ? null : String(actual.date),
    rawStart: actual.start == null ? null : String(actual.start),
    rawEnd: actual.end == null ? null : String(actual.end),
    rawBreak: actual.break == null ? null : String(actual.break),
    rawEvent: actual.event?.trim() || null,
    rawPosition: actual.position?.trim() || null,
    raw: actual.raw ?? null,
    employeeId: null,
    employeeName: null,
    candidates: [],
    assignmentId: null,
    eventId: null,
    eventName: null,
    positionId: null,
    date: null,
    plannedStart: null,
    plannedEnd: null,
    plannedBreak: null,
    plannedMinutes: null,
    actualStart: null,
    actualEnd: null,
    actualBreak: null,
    actualMinutes: null,
    diffMinutes: null,
    comment: actual.note?.trim() || null,
  };
}

function parseBreak(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Bruchteil eines Tages (Excel-Uhrzeit) -> Minuten
    if (value > 0 && value < 1) return Math.round(value * 24 * 60);
    return Math.round(value);
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  // "0:30" bedeutet 30 Minuten
  if (/^\d{1,2}[:.]\d{1,2}$/.test(raw)) return parseTimeToMinutes(raw);
  const num = Number(raw.replace(',', '.').replace(/\s*(minuten|min|std|stunden|stunde|h|m)\.?$/, '').trim());
  if (!Number.isFinite(num)) return null;
  // "0,5 h" / "1 h" -> Stunden, alles andere sind Minuten
  if (/(^|\s|\d)(h|std|stunde|stunden)\.?$/.test(raw)) return Math.round(num * 60);
  return Math.round(num);
}

/**
 * Wählt aus der Planung eines Mitarbeiters an einem Tag die passendste Schicht:
 * 1. gleiches Event (Name oder Referenz), 2. naechstliegende Startzeit.
 * Bereits belegte Zuweisungen werden übersprungen, damit zwei Ist-Zeilen
 * nicht auf dieselbe Planung laufen.
 */
function pickPlannedShift(
  planIndex: Map<string, PlannedShift[]>,
  employeeId: string,
  date: string,
  actual: ActualRow,
  used: Set<string>,
): PlannedShift | null {
  const list = (planIndex.get(`${employeeId}|${date}`) ?? []).filter((s) => !used.has(s.assignmentId));
  if (!list.length) return null;
  if (list.length === 1) return list[0]!;

  const eventHint = actual.event?.trim();
  if (eventHint) {
    const byEvent = list.filter((s) => eventMatches(s, eventHint));
    if (byEvent.length === 1) return byEvent[0]!;
    if (byEvent.length > 1) return closestByStart(byEvent, actual.start) ?? byEvent[0]!;
  }
  return closestByStart(list, actual.start) ?? list[0]!;
}

function closestByStart(list: PlannedShift[], start: unknown): PlannedShift | null {
  const actualStart = parseTimeToMinutes(start);
  if (actualStart == null) return null;
  let best: PlannedShift | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const shift of list) {
    const diff = timeDiffMinutes(shift.start, formatMinutes(actualStart));
    if (diff == null) continue;
    if (Math.abs(diff) < bestDiff) { bestDiff = Math.abs(diff); best = shift; }
  }
  return best;
}

function eventMatches(shift: PlannedShift, hint: string): boolean {
  const h = normalizeName(hint);
  if (!h) return true;
  if (normalizeName(shift.eventReference) === h) return true;
  if (normalizeName(shift.eventName) === h) return true;
  if (normalizeName(shift.eventName).includes(h) || h.includes(normalizeName(shift.eventName))) return true;
  return nameSimilarity(shift.eventName, hint) >= 0.8;
}

function matchesAnyEvent(planned: readonly PlannedShift[], hint: string): boolean {
  return planned.some((s) => eventMatches(s, hint));
}

function hasPlanNearby(planIndex: Map<string, PlannedShift[]>, employeeId: string, date: string): boolean {
  const base = new Date(`${date}T00:00:00Z`).getTime();
  for (const offset of [-2, -1, 1, 2]) {
    const key = `${employeeId}|${isoDate(new Date(base + offset * 86400000))}`;
    if ((planIndex.get(key)?.length ?? 0) > 0) return true;
  }
  return false;
}

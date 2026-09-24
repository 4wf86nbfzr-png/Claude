import 'server-only';
import { db } from '../db';
import { audit } from '../audit';
import { nextReference } from '../refs';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { notifyDispo } from '../notify';
import { storeUpload, resolveStored } from '../storage';
import { parseSpreadsheet, type SheetData } from '../import/sheet';
import { readCell, readName, suggestMapping, type ColumnMapping } from '../import/columns';
import { reconcile, type ActualRow, type EmployeeRef, type PlannedShift, type ResultRow } from '../reconcile/engine';
import { isoDate, parseGermanDate, shiftMinutes } from '../time';
import type { SessionUser } from '../auth/session';
import type { $Enums } from '@prisma/client';
import { readFile } from 'node:fs/promises';

/**
 * Ablauf eines Abgleichs (Spec 19–23):
 *   1. Datei hochladen  -> `dateiHochladen`  (speichert Datei, erkennt Spalten, zeigt Vorschau)
 *   2. Abgleich starten -> `abgleichStarten` (rechnet, schreibt Zeilen)
 *   3. Korrigieren      -> `zeileKorrigieren`, `zeilenBestaetigen`
 *   4. Abschliessen     -> `abgleichAbschliessen` (schreibt Zeiten fest)
 *
 * Nach Schritt 4 sind Aenderungen weiterhin moeglich, werden aber
 * ausnahmslos protokolliert (Spec 70).
 */

export interface Vorschau {
  reconciliationId: string;
  headers: string[];
  mapping: ColumnMapping;
  fehlendePflichtfelder: string[];
  zeilen: Array<Record<string, unknown>>;
  gesamtZeilen: number;
  uebersprungen: number;
  blatt?: string;
}

const VORSCHAU_ZEILEN = 12;

export async function dateiHochladen(user: SessionUser, datei: File, name?: string): Promise<Vorschau> {
  const gespeichert = await storeUpload(datei, 'abgleiche');
  const inhalt = await readFile(resolveStored(gespeichert.filePath));
  const blatt = await parseSpreadsheet(gespeichert.fileName, inhalt);
  if (blatt.rows.length === 0) throw new ValidationError('Die Datei enthaelt keine Datenzeilen.');

  const vorschlag = suggestMapping(blatt.headers);
  const reference = await nextReference('AB');

  const abgleich = await db.reconciliation.create({
    data: {
      reference,
      name: name?.trim() || `Abgleich ${gespeichert.fileName}`,
      status: 'ENTWURF',
      fileName: gespeichert.fileName,
      filePath: gespeichert.filePath,
      mapping: vorschlag.mapping,
      createdById: user.id, updatedById: user.id,
      totalRows: blatt.rows.length,
    },
  });

  await audit(user, {
    action: 'reconciliation.upload', entity: 'Reconciliation', entityId: abgleich.id,
    summary: `Datei "${gespeichert.fileName}" fuer Abgleich ${reference} hochgeladen (${blatt.rows.length} Zeilen)`,
  });

  return {
    reconciliationId: abgleich.id,
    headers: blatt.headers,
    mapping: vorschlag.mapping,
    fehlendePflichtfelder: vorschlag.missingRequired,
    zeilen: blatt.rows.slice(0, VORSCHAU_ZEILEN),
    gesamtZeilen: blatt.rows.length,
    uebersprungen: blatt.skippedEmpty,
    blatt: blatt.sheetName,
  };
}

/** Liest die gespeicherte Datei erneut ein. */
export async function blattLesen(reconciliationId: string): Promise<SheetData> {
  const abgleich = await db.reconciliation.findUnique({ where: { id: reconciliationId } });
  if (!abgleich?.filePath || !abgleich.fileName) throw new NotFoundError('Zu diesem Abgleich ist keine Datei hinterlegt.');
  const inhalt = await readFile(resolveStored(abgleich.filePath));
  return parseSpreadsheet(abgleich.fileName, inhalt);
}

export interface AbgleichOptionen {
  mapping: ColumnMapping;
  toleranzMinuten?: number;
  pausenToleranzMinuten?: number;
  fehlendeMelden?: boolean;
  vorlageSpeichernAls?: string;
}

export async function abgleichStarten(user: SessionUser, reconciliationId: string, optionen: AbgleichOptionen) {
  const abgleich = await db.reconciliation.findUnique({ where: { id: reconciliationId } });
  if (!abgleich) throw new NotFoundError('Der Abgleich wurde nicht gefunden.');
  if (abgleich.status === 'ABGESCHLOSSEN') {
    throw new ConflictError('Der Abgleich ist abgeschlossen und kann nicht erneut berechnet werden.');
  }

  const blatt = await blattLesen(reconciliationId);
  const mapping = optionen.mapping;
  if (!mapping.date || (!mapping.name && !(mapping.firstName && mapping.lastName))) {
    throw new ValidationError('Bitte ordnen Sie mindestens Mitarbeiter und Datum einer Spalte zu.');
  }

  // Ist-Zeilen aufbereiten
  const istZeilen: ActualRow[] = blatt.rows.map((row, index) => ({
    rowNumber: index + 2, // Kopfzeile ist Zeile 1
    name: readName(row, mapping),
    personnelNo: mapping.personnelNo ? String(row[mapping.personnelNo] ?? '') : null,
    date: readCell(row, mapping, 'date'),
    start: readCell(row, mapping, 'start'),
    end: readCell(row, mapping, 'end'),
    break: readCell(row, mapping, 'break'),
    event: mapping.event ? String(row[mapping.event] ?? '') : null,
    position: mapping.position ? String(row[mapping.position] ?? '') : null,
    note: mapping.note ? String(row[mapping.note] ?? '') : null,
    raw: row,
  }));

  // Planung im Zeitraum der Datei laden – nicht die gesamte Datenbank.
  const daten = istZeilen.map((z) => z.date).filter(Boolean);
  const { von, bis } = zeitraum(daten);
  const zuweisungen = await db.assignment.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ['ABGESAGT', 'STORNIERT', 'VORGESCHLAGEN'] },
      event: { deletedAt: null, date: { gte: von, lte: bis } },
    },
    include: {
      event: { select: { id: true, reference: true, name: true, date: true, startTime: true, endTime: true } },
      position: { select: { id: true, title: true, startTime: true, endTime: true, breakMinutes: true } },
    },
  });

  const planung: PlannedShift[] = zuweisungen.map((a) => ({
    assignmentId: a.id,
    employeeId: a.employeeId,
    eventId: a.eventId,
    eventReference: a.event.reference,
    eventName: a.event.name,
    positionId: a.positionId,
    positionTitle: a.position.title,
    date: isoDate(a.event.date),
    start: a.plannedStart ?? a.position.startTime ?? a.event.startTime,
    end: a.plannedEnd ?? a.position.endTime ?? a.event.endTime,
    breakMinutes: a.plannedBreakMinutes || a.position.breakMinutes || 0,
  }));

  const mitarbeiter: EmployeeRef[] = (
    await db.employee.findMany({
      where: { deletedAt: null },
      select: { id: true, firstName: true, lastName: true, personnelNo: true },
    })
  );

  const ergebnis = reconcile(istZeilen, planung, mitarbeiter, {
    toleranceMinutes: optionen.toleranzMinuten ?? 15,
    breakToleranceMinutes: optionen.pausenToleranzMinuten ?? 15,
    reportMissing: optionen.fehlendeMelden ?? true,
  });

  await db.$transaction([
    db.reconciliationRow.deleteMany({ where: { reconciliationId } }),
    db.reconciliation.update({
      where: { id: reconciliationId },
      data: {
        status: 'VERARBEITET',
        mapping: mapping as object,
        periodFrom: ergebnis.periodFrom ? new Date(`${ergebnis.periodFrom}T00:00:00Z`) : null,
        periodTo: ergebnis.periodTo ? new Date(`${ergebnis.periodTo}T00:00:00Z`) : null,
        totalRows: ergebnis.summary.totalRows,
        matchedRows: ergebnis.summary.matchedRows,
        deviationRows: ergebnis.summary.deviationRows,
        unknownRows: ergebnis.summary.unknownRows,
        duplicateRows: ergebnis.summary.duplicateRows,
        missingRows: ergebnis.summary.missingRows,
        updatedById: user.id,
      },
    }),
    db.reconciliationRow.createMany({ data: ergebnis.rows.map((row) => zuZeile(reconciliationId, row)) }),
  ]);

  if (optionen.vorlageSpeichernAls?.trim()) {
    await db.importTemplate.upsert({
      where: { name: optionen.vorlageSpeichernAls.trim() },
      create: {
        name: optionen.vorlageSpeichernAls.trim(), kind: 'TIMESHEET',
        mapping: mapping as object,
        options: { toleranzMinuten: optionen.toleranzMinuten ?? 15, pausenToleranzMinuten: optionen.pausenToleranzMinuten ?? 15 },
        createdById: user.id,
      },
      update: { mapping: mapping as object, options: { toleranzMinuten: optionen.toleranzMinuten ?? 15 } },
    });
  }

  await audit(user, {
    action: 'reconciliation.run', entity: 'Reconciliation', entityId: reconciliationId,
    summary: `Abgleich ${abgleich.reference} berechnet: ${ergebnis.summary.totalRows} Datensaetze, ${ergebnis.summary.matchedRows} zugeordnet, ${ergebnis.summary.deviationRows} Abweichungen, ${ergebnis.summary.unknownRows} unbekannt, ${ergebnis.summary.duplicateRows} doppelt`,
    after: ergebnis.summary,
  });

  return ergebnis.summary;
}

function zuZeile(reconciliationId: string, row: ResultRow) {
  return {
    reconciliationId,
    rowNumber: row.rowNumber,
    rawName: row.rawName, rawDate: row.rawDate, rawStart: row.rawStart, rawEnd: row.rawEnd,
    rawBreak: row.rawBreak, rawEvent: row.rawEvent, rawPosition: row.rawPosition,
    raw: (row.raw ?? undefined) as object | undefined,
    employeeId: row.employeeId, eventId: row.eventId, positionId: row.positionId, assignmentId: row.assignmentId,
    date: row.date ? new Date(`${row.date}T00:00:00Z`) : null,
    plannedStart: row.plannedStart, plannedEnd: row.plannedEnd, plannedBreak: row.plannedBreak,
    plannedMinutes: row.plannedMinutes,
    actualStart: row.actualStart, actualEnd: row.actualEnd, actualBreak: row.actualBreak,
    actualMinutes: row.actualMinutes, diffMinutes: row.diffMinutes,
    status: row.status as $Enums.RowStatus,
    matchScore: row.matchScore,
    candidates: row.candidates as unknown as object,
    issues: row.issues,
    comment: row.comment,
  };
}

/**
 * Zeitraum der Datei bestimmen, um nur die passende Planung zu laden.
 *
 * Wichtig: Hier muss derselbe Datumsleser wie im Abgleich selbst laufen.
 * `new Date("17.05.2031")` liefert ein ungueltiges Datum – mit dieser Faelle
 * wuerde der Zeitraum auf "heute" zusammenfallen und die gesamte Planung
 * uebersehen. Nur wenn sich kein einziges Datum lesen laesst, nehmen wir
 * ersatzweise ein grosszuegiges Fenster um heute.
 */
function zeitraum(daten: unknown[]): { von: Date; bis: Date } {
  const zeiten = daten
    .map((wert) => parseGermanDate(wert)?.getTime())
    .filter((wert): wert is number => typeof wert === 'number');

  const heute = Date.now();
  if (zeiten.length === 0) {
    return { von: new Date(heute - 400 * 86400000), bis: new Date(heute + 400 * 86400000) };
  }
  return {
    von: new Date(Math.min(...zeiten) - 3 * 86400000),
    bis: new Date(Math.max(...zeiten) + 3 * 86400000),
  };
}

// ------------------------------------------------------------ Manuelle Korrektur

export interface Korrektur {
  employeeId?: string | null;
  assignmentId?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  actualBreak?: number | null;
  status?: $Enums.RowStatus;
  comment?: string | null;
}

export async function zeileKorrigieren(user: SessionUser, rowId: string, korrektur: Korrektur) {
  const zeile = await db.reconciliationRow.findUnique({ where: { id: rowId }, include: { reconciliation: true } });
  if (!zeile) throw new NotFoundError('Die Zeile wurde nicht gefunden.');

  const daten: Record<string, unknown> = { reviewedAt: new Date(), reviewedById: user.id };

  if (korrektur.employeeId !== undefined) daten.employeeId = korrektur.employeeId;
  if (korrektur.comment !== undefined) daten.comment = korrektur.comment;
  if (korrektur.actualStart !== undefined) daten.actualStart = korrektur.actualStart;
  if (korrektur.actualEnd !== undefined) daten.actualEnd = korrektur.actualEnd;
  if (korrektur.actualBreak !== undefined) daten.actualBreak = korrektur.actualBreak;

  // Wird eine Zuweisung gewaehlt, uebernehmen wir Event, Position und Sollzeiten.
  if (korrektur.assignmentId) {
    const assignment = await db.assignment.findUnique({
      where: { id: korrektur.assignmentId },
      include: {
        event: { select: { id: true, startTime: true, endTime: true, date: true } },
        position: { select: { id: true, startTime: true, endTime: true, breakMinutes: true } },
      },
    });
    if (!assignment) throw new ValidationError('Die gewaehlte Einteilung wurde nicht gefunden.');
    const start = assignment.plannedStart ?? assignment.position.startTime ?? assignment.event.startTime;
    const ende = assignment.plannedEnd ?? assignment.position.endTime ?? assignment.event.endTime;
    const pause = assignment.plannedBreakMinutes || assignment.position.breakMinutes || 0;
    Object.assign(daten, {
      assignmentId: assignment.id,
      employeeId: korrektur.employeeId ?? assignment.employeeId,
      eventId: assignment.eventId,
      positionId: assignment.positionId,
      date: assignment.event.date,
      plannedStart: start, plannedEnd: ende, plannedBreak: pause,
      plannedMinutes: start && ende ? shiftMinutes(start, ende, pause) : null,
    });
  }

  // Ist-Minuten und Differenz neu rechnen
  const start = (daten.actualStart as string | null | undefined) ?? zeile.actualStart;
  const ende = (daten.actualEnd as string | null | undefined) ?? zeile.actualEnd;
  const pause = (daten.actualBreak as number | null | undefined) ?? zeile.actualBreak ?? 0;
  const istMinuten = start && ende ? shiftMinutes(start, ende, pause) : null;
  daten.actualMinutes = istMinuten;
  const sollMinuten = (daten.plannedMinutes as number | null | undefined) ?? zeile.plannedMinutes;
  daten.diffMinutes = istMinuten != null && sollMinuten != null ? istMinuten - sollMinuten : null;

  daten.status = korrektur.status ?? 'GEPRUEFT';

  await db.reconciliationRow.update({ where: { id: rowId }, data: daten });
  await zaehlerAktualisieren(zeile.reconciliationId);

  await audit(user, {
    action: zeile.reconciliation.status === 'ABGESCHLOSSEN' ? 'reconciliation.row.change_after_close' : 'reconciliation.row.correct',
    entity: 'ReconciliationRow', entityId: rowId,
    summary: `Zeile ${zeile.rowNumber} in ${zeile.reconciliation.reference} manuell korrigiert${zeile.reconciliation.status === 'ABGESCHLOSSEN' ? ' (nach Abschluss!)' : ''}`,
    before: { status: zeile.status, employeeId: zeile.employeeId, actualStart: zeile.actualStart, actualEnd: zeile.actualEnd },
    after: daten,
  });
}

/** Alle unkritischen Abweichungen in einem Zug bestaetigen (Spec 70). */
export async function unkritischeBestaetigen(user: SessionUser, reconciliationId: string, grenzeMinuten = 30): Promise<number> {
  const zeilen = await db.reconciliationRow.findMany({
    where: { reconciliationId, status: 'ABWEICHUNG' },
    select: { id: true, diffMinutes: true, issues: true },
  });
  const passend = zeilen.filter((z) =>
    Math.abs(z.diffMinutes ?? 0) <= grenzeMinuten &&
    !z.issues.some((i) => ['EVENT_ABWEICHEND', 'DATUM_ABWEICHEND', 'STARTZEIT_FEHLT', 'ENDZEIT_FEHLT'].includes(i)),
  );
  if (!passend.length) return 0;

  await db.reconciliationRow.updateMany({
    where: { id: { in: passend.map((z) => z.id) } },
    data: { status: 'GEPRUEFT', reviewedAt: new Date(), reviewedById: user.id },
  });
  await zaehlerAktualisieren(reconciliationId);
  await audit(user, {
    action: 'reconciliation.bulk_confirm', entity: 'Reconciliation', entityId: reconciliationId,
    summary: `${passend.length} unkritische Abweichungen (bis ${grenzeMinuten} Min) bestaetigt`,
  });
  return passend.length;
}

export async function zeileIgnorieren(user: SessionUser, rowId: string, grund: string) {
  const zeile = await db.reconciliationRow.findUnique({ where: { id: rowId }, include: { reconciliation: true } });
  if (!zeile) throw new NotFoundError('Die Zeile wurde nicht gefunden.');
  await db.reconciliationRow.update({
    where: { id: rowId },
    data: { status: 'IGNORIERT', comment: grund, reviewedAt: new Date(), reviewedById: user.id },
  });
  await zaehlerAktualisieren(zeile.reconciliationId);
  await audit(user, {
    action: 'reconciliation.row.ignore', entity: 'ReconciliationRow', entityId: rowId,
    summary: `Zeile ${zeile.rowNumber} in ${zeile.reconciliation.reference} ignoriert: ${grund}`,
  });
}

async function zaehlerAktualisieren(reconciliationId: string) {
  const gruppen = await db.reconciliationRow.groupBy({
    by: ['status'], where: { reconciliationId }, _count: true,
  });
  const zaehler = Object.fromEntries(gruppen.map((g) => [g.status, g._count]));
  await db.reconciliation.update({
    where: { id: reconciliationId },
    data: {
      totalRows: gruppen.reduce((s, g) => s + g._count, 0),
      matchedRows: (zaehler.OK ?? 0) + (zaehler.ABWEICHUNG ?? 0) + (zaehler.GEPRUEFT ?? 0),
      deviationRows: zaehler.ABWEICHUNG ?? 0,
      unknownRows: (zaehler.UNBEKANNT ?? 0) + (zaehler.MEHRDEUTIG ?? 0),
      duplicateRows: zaehler.DUPLIKAT ?? 0,
      missingRows: zaehler.FEHLEND ?? 0,
    },
  });
}

/**
 * Abschluss: aus jeder zugeordneten Zeile mit Ist-Zeit wird ein
 * Zeiterfassungs-Datensatz. Bereits geschriebene Zeiten werden
 * aktualisiert, nicht dupliziert.
 */
export async function abgleichAbschliessen(user: SessionUser, reconciliationId: string): Promise<{ geschrieben: number; uebersprungen: number }> {
  const abgleich = await db.reconciliation.findUnique({
    where: { id: reconciliationId },
    include: { rows: true },
  });
  if (!abgleich) throw new NotFoundError('Der Abgleich wurde nicht gefunden.');

  const offen = abgleich.rows.filter((z) => ['UNBEKANNT', 'MEHRDEUTIG', 'DUPLIKAT', 'ZUSAETZLICH'].includes(z.status));
  if (offen.length > 0) {
    throw new ConflictError(
      `Es sind noch ${offen.length} Zeilen ungeklaert (unbekannt, doppelt oder nicht geplant). Bitte ordnen Sie diese zu oder setzen Sie sie auf "ignorieren".`,
    );
  }

  let geschrieben = 0;
  let uebersprungen = 0;

  for (const zeile of abgleich.rows) {
    if (zeile.status === 'IGNORIERT' || zeile.status === 'FEHLEND') { uebersprungen++; continue; }
    if (!zeile.employeeId || !zeile.date || !zeile.actualStart || !zeile.actualEnd) { uebersprungen++; continue; }

    const minuten = zeile.actualMinutes ?? shiftMinutes(zeile.actualStart, zeile.actualEnd, zeile.actualBreak ?? 0) ?? 0;
    const daten = {
      employeeId: zeile.employeeId,
      eventId: zeile.eventId, positionId: zeile.positionId, assignmentId: zeile.assignmentId,
      date: zeile.date,
      start: zeile.actualStart, end: zeile.actualEnd,
      breakMinutes: zeile.actualBreak ?? 0,
      minutes: minuten,
      source: 'IMPORT' as const,
      status: 'GEPRUEFT' as const,
      note: zeile.comment,
      updatedById: user.id,
    };

    if (zeile.timeEntryId) {
      await db.timeEntry.update({ where: { id: zeile.timeEntryId }, data: daten });
    } else {
      const eintrag = await db.timeEntry.create({ data: { ...daten, createdById: user.id } });
      await db.reconciliationRow.update({ where: { id: zeile.id }, data: { timeEntryId: eintrag.id } });
    }
    geschrieben++;
  }

  await db.reconciliation.update({
    where: { id: reconciliationId },
    data: { status: 'ABGESCHLOSSEN', closedAt: new Date(), closedById: user.id, updatedById: user.id },
  });

  await audit(user, {
    action: 'reconciliation.close', entity: 'Reconciliation', entityId: reconciliationId,
    summary: `Abgleich ${abgleich.reference} abgeschlossen: ${geschrieben} Zeiten geschrieben, ${uebersprungen} uebersprungen`,
    after: { geschrieben, uebersprungen },
  });
  await notifyDispo({
    kind: 'ABGLEICH_ABGESCHLOSSEN',
    title: `Abgleich ${abgleich.reference} abgeschlossen`,
    body: `${geschrieben} Zeiten uebernommen.`,
    link: `/abgleiche/${reconciliationId}`,
    webhookEvent: 'reconciliation.closed',
    webhookPayload: { id: reconciliationId, reference: abgleich.reference, geschrieben },
  });

  return { geschrieben, uebersprungen };
}

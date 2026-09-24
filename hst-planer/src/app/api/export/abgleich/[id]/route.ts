import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { minutesToHours } from '@/lib/time';
import { ISSUE_LABEL, type Issue } from '@/lib/reconcile/engine';
import { alsExcel, dateiname, EXCEL_TYP, type Spalte } from '@/lib/export/excel';
import { ROW_STATUS } from '@/lib/status';

export const GET = route(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requirePermission('reconciliation.view');
  const { id } = await context.params;

  const abgleich = await db.reconciliation.findUnique({
    where: { id },
    include: {
      rows: {
        orderBy: { rowNumber: 'asc' },
        include: { event: { select: { reference: true, name: true } }, position: { select: { title: true } } },
      },
    },
  });
  if (!abgleich) throw new NotFoundError('Der Abgleich wurde nicht gefunden.');

  type Zeile = (typeof abgleich.rows)[number];
  const spalten: Array<Spalte<Zeile>> = [
    { titel: 'Zeile', wert: (z) => z.rowNumber, breite: 8 },
    { titel: 'Mitarbeiter (Datei)', wert: (z) => z.rawName ?? '', breite: 26 },
    { titel: 'Datum', wert: (z) => z.date ?? z.rawDate ?? '', format: 'DD.MM.YYYY', breite: 12 },
    { titel: 'Event', wert: (z) => z.event?.name ?? z.rawEvent ?? '', breite: 30 },
    { titel: 'Position', wert: (z) => z.position?.title ?? z.rawPosition ?? '', breite: 24 },
    { titel: 'Soll Beginn', wert: (z) => z.plannedStart ?? '', breite: 12 },
    { titel: 'Soll Ende', wert: (z) => z.plannedEnd ?? '', breite: 12 },
    { titel: 'Soll Stunden', wert: (z) => (z.plannedMinutes == null ? '' : minutesToHours(z.plannedMinutes)), format: '0.00', breite: 12 },
    { titel: 'Ist Beginn', wert: (z) => z.actualStart ?? '', breite: 12 },
    { titel: 'Ist Ende', wert: (z) => z.actualEnd ?? '', breite: 12 },
    { titel: 'Ist Pause', wert: (z) => z.actualBreak ?? '', breite: 10 },
    { titel: 'Ist Stunden', wert: (z) => (z.actualMinutes == null ? '' : minutesToHours(z.actualMinutes)), format: '0.00', breite: 12 },
    { titel: 'Differenz (Min)', wert: (z) => z.diffMinutes ?? '', breite: 14 },
    { titel: 'Status', wert: (z) => ROW_STATUS[z.status]?.label ?? z.status, breite: 16 },
    { titel: 'Befund', wert: (z) => z.issues.map((b) => ISSUE_LABEL[b as Issue] ?? b).join(', '), breite: 34 },
    { titel: 'Kommentar', wert: (z) => z.comment ?? '', breite: 30 },
  ];

  const puffer = await alsExcel('Abgleich', spalten, abgleich.rows, [
    `HST Planer – Abgleich ${abgleich.reference}`,
    `${abgleich.name} · Stand: ${new Date().toLocaleString('de-DE')}`,
    `${abgleich.totalRows} Datensaetze · ${abgleich.matchedRows} zugeordnet · ${abgleich.deviationRows} Abweichungen · ${abgleich.unknownRows} unbekannt · ${abgleich.duplicateRows} doppelt`,
  ]);
  return new NextResponse(new Uint8Array(puffer), {
    headers: { 'content-type': EXCEL_TYP, 'content-disposition': `attachment; filename="${dateiname(`hst-abgleich-${abgleich.reference}`)}"` },
  });
});

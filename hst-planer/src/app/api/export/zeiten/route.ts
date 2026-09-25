import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { minutesToHours } from '@/lib/time';
import { alsCsv, alsExcel, dateiname, EXCEL_TYP, type Spalte } from '@/lib/export/excel';
import { filterAusUrl, protokolliereExport } from '@/lib/export/protokoll';
import { TIME_ENTRY_STATUS } from '@/lib/status';
import type { Prisma } from '@prisma/client';

/** Stundennachweis für die Abrechnung (Spec 25/62). */
export const GET = route(async (request: Request) => {
  const user = await requirePermission('timesheets.view');
  const params = new URL(request.url).searchParams;
  const format = params.get('format') === 'csv' ? 'csv' : 'xlsx';

  const where: Prisma.TimeEntryWhereInput = { deletedAt: null };
  if (user.scope === 'EIGENE') where.employeeId = user.employeeId ?? '__keiner__';
  if (user.scope === 'PARTNER') where.employee = { partnerId: user.partnerId ?? '__kein_partner__' };
  if (params.get('von')) where.date = { gte: new Date(`${params.get('von')}T00:00:00Z`) };
  if (params.get('bis')) where.date = { ...(where.date as object ?? {}), lte: new Date(`${params.get('bis')}T00:00:00Z`) };
  if (params.get('status')) where.status = params.get('status') as Prisma.TimeEntryWhereInput['status'];
  if (params.get('event')) where.eventId = params.get('event');

  const zeiten = await db.timeEntry.findMany({
    where,
    include: {
      employee: { select: { personnelNo: true, firstName: true, lastName: true } },
      event: { select: { reference: true, name: true } },
      position: { select: { title: true } },
    },
    orderBy: [{ date: 'asc' }, { employee: { lastName: 'asc' } }],
    take: 50000,
  });

  await protokolliereExport(user, {
    bereich: 'zeiten',
    format: format === 'csv' ? 'CSV' : 'XLSX',
    rowCount: zeiten.length,
    filter: filterAusUrl(request.url),
  });

  type Zeile = (typeof zeiten)[number];
  const spalten: Array<Spalte<Zeile>> = [
    { titel: 'Datum', wert: (z) => z.date, format: 'DD.MM.YYYY', breite: 12 },
    { titel: 'Personalnummer', wert: (z) => z.employee.personnelNo, breite: 16 },
    { titel: 'Nachname', wert: (z) => z.employee.lastName, breite: 20 },
    { titel: 'Vorname', wert: (z) => z.employee.firstName, breite: 18 },
    { titel: 'Event-ID', wert: (z) => z.event?.reference ?? '', breite: 16 },
    { titel: 'Event', wert: (z) => z.event?.name ?? '', breite: 34 },
    { titel: 'Position', wert: (z) => z.position?.title ?? '', breite: 26 },
    { titel: 'Beginn', wert: (z) => z.start, breite: 10 },
    { titel: 'Ende', wert: (z) => z.end, breite: 10 },
    { titel: 'Pause (Min)', wert: (z) => z.breakMinutes, breite: 12 },
    { titel: 'Stunden', wert: (z) => minutesToHours(z.minutes), format: '0.00', breite: 10 },
    { titel: 'Quelle', wert: (z) => z.source, breite: 12 },
    { titel: 'Status', wert: (z) => TIME_ENTRY_STATUS[z.status]?.label ?? z.status, breite: 14 },
    { titel: 'Notiz', wert: (z) => z.note ?? '', breite: 30 },
  ];

  if (format === 'csv') {
    return new NextResponse(alsCsv(spalten, zeiten), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${dateiname('hst-stunden').replace('.xlsx', '.csv')}"` },
    });
  }

  const summe = zeiten.reduce((s, z) => s + z.minutes, 0);
  const puffer = await alsExcel('Stunden', spalten, zeiten, [
    'HST Planer – Stundennachweis',
    `Stand: ${new Date().toLocaleString('de-DE')} · ${zeiten.length} Einträge · ${minutesToHours(summe).toLocaleString('de-DE')} Stunden`,
  ]);
  return new NextResponse(new Uint8Array(puffer), {
    headers: { 'content-type': EXCEL_TYP, 'content-disposition': `attachment; filename="${dateiname('hst-stunden')}"` },
  });
});

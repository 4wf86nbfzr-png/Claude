import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { besetzungAus, EVENT_MIT_BESETZUNG } from '@/lib/queries/coverage';
import { alsCsv, alsExcel, dateiname, EXCEL_TYP, type Spalte } from '@/lib/export/excel';
import { filterAusUrl, protokolliereExport } from '@/lib/export/protokoll';
import { EVENT_STATUS } from '@/lib/status';

export const GET = route(async (request: Request) => {
  const user = await requirePermission('events.view');
  const params = new URL(request.url).searchParams;
  const format = params.get('format') === 'csv' ? 'csv' : 'xlsx';

  const events = await db.event.findMany({
    where: {
      ...eventFilter(user),
      ...(params.get('von') ? { date: { gte: new Date(`${params.get('von')}T00:00:00Z`) } } : {}),
    },
    include: { customer: { select: { name: true } }, serviceType: { select: { name: true } }, ...EVENT_MIT_BESETZUNG },
    orderBy: { date: 'asc' },
    take: 5000,
  });

  await protokolliereExport(user, {
    bereich: 'einsaetze',
    format: format === 'csv' ? 'CSV' : 'XLSX',
    rowCount: events.length,
    filter: filterAusUrl(request.url),
  });

  type Zeile = (typeof events)[number];
  const spalten: Array<Spalte<Zeile>> = [
    { titel: 'Event-ID', wert: (e) => e.reference, breite: 16 },
    { titel: 'Datum', wert: (e) => e.date, format: 'DD.MM.YYYY', breite: 12 },
    { titel: 'Event', wert: (e) => e.name, breite: 40 },
    { titel: 'Kunde', wert: (e) => e.customer?.name ?? '', breite: 26 },
    { titel: 'Bereich', wert: (e) => e.serviceType?.name ?? '', breite: 24 },
    { titel: 'Ort', wert: (e) => [e.venue, e.city].filter(Boolean).join(', '), breite: 28 },
    { titel: 'Beginn', wert: (e) => e.startTime ?? '', breite: 10 },
    { titel: 'Ende', wert: (e) => e.endTime ?? '', breite: 10 },
    { titel: 'Soll', wert: (e) => besetzungAus(e.positions).soll, breite: 8 },
    { titel: 'Besetzt', wert: (e) => besetzungAus(e.positions).ist, breite: 9 },
    { titel: 'Offen', wert: (e) => besetzungAus(e.positions).offen, breite: 8 },
    { titel: 'Status', wert: (e) => EVENT_STATUS[e.status]?.label ?? e.status, breite: 16 },
  ];

  if (format === 'csv') {
    return new NextResponse(alsCsv(spalten, events), {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${dateiname('hst-events').replace('.xlsx', '.csv')}"` },
    });
  }

  const puffer = await alsExcel('Events', spalten, events, ['HST Planer – Events', `Stand: ${new Date().toLocaleString('de-DE')}`]);
  return new NextResponse(new Uint8Array(puffer), {
    headers: { 'content-type': EXCEL_TYP, 'content-disposition': `attachment; filename="${dateiname('hst-events')}"` },
  });
});

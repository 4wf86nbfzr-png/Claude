import { NextResponse } from 'next/server';
import { route } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { toDateOnly } from '@/lib/time';
import { alsExcel, dateiname, EXCEL_TYP, type Spalte } from '@/lib/export/excel';
import { ASSIGNMENT_STATUS } from '@/lib/status';

/** Einsatzplanung je Mitarbeiter und Position (Spec 25/62). */
export const GET = route(async (request: Request) => {
  const user = await requirePermission('events.view');
  const params = new URL(request.url).searchParams;
  const von = params.get('von') ? new Date(`${params.get('von')}T00:00:00Z`) : toDateOnly(new Date());
  const bis = params.get('bis') ? new Date(`${params.get('bis')}T00:00:00Z`) : new Date(von.getTime() + 30 * 86400000);

  const zuweisungen = await db.assignment.findMany({
    where: { deletedAt: null, event: { ...eventFilter(user), date: { gte: von, lte: bis } } },
    include: {
      event: { select: { reference: true, name: true, date: true, venue: true, city: true, meetingPoint: true, meetingTime: true, dressCode: true, startTime: true, endTime: true } },
      position: { select: { title: true, startTime: true, endTime: true, breakMinutes: true } },
      employee: { select: { personnelNo: true, firstName: true, lastName: true, mobile: true } },
    },
    orderBy: [{ event: { date: 'asc' } }, { position: { sortOrder: 'asc' } }],
    take: 20000,
  });

  type Zeile = (typeof zuweisungen)[number];
  const spalten: Array<Spalte<Zeile>> = [
    { titel: 'Datum', wert: (a) => a.event.date, format: 'DD.MM.YYYY', breite: 12 },
    { titel: 'Event-ID', wert: (a) => a.event.reference, breite: 16 },
    { titel: 'Event', wert: (a) => a.event.name, breite: 34 },
    { titel: 'Ort', wert: (a) => [a.event.venue, a.event.city].filter(Boolean).join(', '), breite: 26 },
    { titel: 'Position', wert: (a) => a.position.title, breite: 26 },
    { titel: 'Personalnummer', wert: (a) => a.employee.personnelNo, breite: 16 },
    { titel: 'Mitarbeiter', wert: (a) => `${a.employee.lastName}, ${a.employee.firstName}`, breite: 26 },
    { titel: 'Telefon', wert: (a) => a.employee.mobile ?? '', breite: 18 },
    { titel: 'Von', wert: (a) => a.plannedStart ?? a.position.startTime ?? a.event.startTime ?? '', breite: 10 },
    { titel: 'Bis', wert: (a) => a.plannedEnd ?? a.position.endTime ?? a.event.endTime ?? '', breite: 10 },
    { titel: 'Pause (Min)', wert: (a) => a.plannedBreakMinutes || a.position.breakMinutes, breite: 12 },
    { titel: 'Rolle', wert: (a) => (a.isReserve ? 'Ersatz' : a.roleInTeam), breite: 14 },
    { titel: 'Status', wert: (a) => ASSIGNMENT_STATUS[a.status]?.label ?? a.status, breite: 16 },
    { titel: 'Treffpunkt', wert: (a) => [a.event.meetingPoint, a.event.meetingTime].filter(Boolean).join(' '), breite: 30 },
    { titel: 'Dresscode', wert: (a) => a.event.dressCode ?? '', breite: 30 },
    { titel: 'Hinweis', wert: (a) => a.noteForEmployee ?? '', breite: 24 },
  ];

  const puffer = await alsExcel('Einsatzplanung', spalten, zuweisungen, [
    'HST Planer – Einsatzplanung',
    `${von.toLocaleDateString('de-DE')} bis ${bis.toLocaleDateString('de-DE')} · ${zuweisungen.length} Einteilungen`,
  ]);
  return new NextResponse(new Uint8Array(puffer), {
    headers: { 'content-type': EXCEL_TYP, 'content-disposition': `attachment; filename="${dateiname('hst-einsatzplanung')}"` },
  });
});

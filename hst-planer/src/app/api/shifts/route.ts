import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { isoDate } from '@/lib/time';
import type { Prisma } from '@prisma/client';

/** Einteilungen (Schichten) – Grundlage für Fremdsysteme und die spätere App. */
export const GET = route(async (request: Request) => {
  const zugang = await apiZugang(request, 'events.view', 'events');
  const params = new URL(request.url).searchParams;
  const { page, perPage, skip } = pagination(params, 100);

  const where: Prisma.AssignmentWhereInput = { deletedAt: null };
  if (zugang.benutzer) where.event = eventFilter(zugang.benutzer);
  if (params.get('mitarbeiter')) where.employeeId = params.get('mitarbeiter')!;
  if (params.get('event')) where.eventId = params.get('event')!;
  if (params.get('status')) where.status = params.get('status') as Prisma.AssignmentWhereInput['status'];
  if (params.get('von') || params.get('bis')) {
    where.event = {
      ...(where.event as object ?? {}),
      date: {
        ...(params.get('von') ? { gte: new Date(`${params.get('von')}T00:00:00Z`) } : {}),
        ...(params.get('bis') ? { lte: new Date(`${params.get('bis')}T00:00:00Z`) } : {}),
      },
    };
  }

  const [zuweisungen, gesamt] = await Promise.all([
    db.assignment.findMany({
      where,
      include: {
        event: { select: { id: true, reference: true, name: true, date: true, startTime: true, endTime: true, venue: true, meetingPoint: true, meetingTime: true, dressCode: true } },
        position: { select: { id: true, title: true, startTime: true, endTime: true, breakMinutes: true } },
        employee: { select: { id: true, personnelNo: true, firstName: true, lastName: true } },
      },
      orderBy: [{ event: { date: 'asc' } }, { plannedStart: 'asc' }],
      skip, take: perPage,
    }),
    db.assignment.count({ where }),
  ]);

  return ok({
    daten: zuweisungen.map((a) => ({
      id: a.id, status: a.status, rolle: a.roleInTeam, ersatz: a.isReserve,
      datum: isoDate(a.event.date),
      beginn: a.plannedStart ?? a.position.startTime ?? a.event.startTime,
      ende: a.plannedEnd ?? a.position.endTime ?? a.event.endTime,
      pauseMinuten: a.plannedBreakMinutes || a.position.breakMinutes,
      event: { id: a.event.id, referenz: a.event.reference, name: a.event.name, ort: a.event.venue, treffpunkt: a.event.meetingPoint, treffzeit: a.event.meetingTime, dresscode: a.event.dressCode },
      position: { id: a.position.id, titel: a.position.title },
      mitarbeiter: { id: a.employee.id, personalnummer: a.employee.personnelNo, vorname: a.employee.firstName, nachname: a.employee.lastName },
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});

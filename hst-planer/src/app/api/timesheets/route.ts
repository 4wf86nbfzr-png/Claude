import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { isoDate, minutesToHours } from '@/lib/time';
import type { Prisma } from '@prisma/client';

export const GET = route(async (request: Request) => {
  const zugang = await apiZugang(request, 'timesheets.view', 'timesheets');
  const params = new URL(request.url).searchParams;
  const { page, perPage, skip } = pagination(params, 100);

  const where: Prisma.TimeEntryWhereInput = { deletedAt: null };
  if (zugang.benutzer?.scope === 'EIGENE') where.employeeId = zugang.benutzer.employeeId ?? '__keiner__';
  if (zugang.benutzer?.scope === 'PARTNER') where.employee = { partnerId: zugang.benutzer.partnerId ?? '__kein_partner__' };
  if (params.get('von')) where.date = { gte: new Date(`${params.get('von')}T00:00:00Z`) };
  if (params.get('bis')) where.date = { ...(where.date as object ?? {}), lte: new Date(`${params.get('bis')}T00:00:00Z`) };
  if (params.get('status')) where.status = params.get('status') as Prisma.TimeEntryWhereInput['status'];
  if (params.get('event')) where.eventId = params.get('event')!;

  const [zeiten, gesamt, summe] = await Promise.all([
    db.timeEntry.findMany({
      where,
      include: {
        employee: { select: { id: true, personnelNo: true, firstName: true, lastName: true } },
        event: { select: { id: true, reference: true, name: true } },
      },
      orderBy: [{ date: 'asc' }], skip, take: perPage,
    }),
    db.timeEntry.count({ where }),
    db.timeEntry.aggregate({ where, _sum: { minutes: true } }),
  ]);

  return ok({
    daten: zeiten.map((z) => ({
      id: z.id, datum: isoDate(z.date), beginn: z.start, ende: z.end,
      pauseMinuten: z.breakMinutes, minuten: z.minutes, stunden: minutesToHours(z.minutes),
      quelle: z.source, status: z.status, notiz: z.note,
      mitarbeiter: { id: z.employee.id, personalnummer: z.employee.personnelNo, vorname: z.employee.firstName, nachname: z.employee.lastName },
      event: z.event ? { id: z.event.id, referenz: z.event.reference, name: z.event.name } : null,
    })),
    summe: { minuten: summe._sum.minutes ?? 0, stunden: minutesToHours(summe._sum.minutes ?? 0) },
    seite: page, proSeite: perPage, gesamt,
  });
});

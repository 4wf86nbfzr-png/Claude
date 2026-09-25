import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { besetzungAus, EVENT_MIT_BESETZUNG } from '@/lib/queries/coverage';
import { isoDate } from '@/lib/time';
import type { Prisma } from '@prisma/client';

export const GET = route(async (request: Request) => {
  const zugang = await apiZugang(request, 'events.view', 'events');
  const params = new URL(request.url).searchParams;
  const { page, perPage, skip } = pagination(params, 50);

  const where: Prisma.EventWhereInput = zugang.benutzer ? eventFilter(zugang.benutzer) : { deletedAt: null };
  if (params.get('von')) where.date = { gte: new Date(`${params.get('von')}T00:00:00Z`) };
  if (params.get('bis')) where.date = { ...(where.date as object ?? {}), lte: new Date(`${params.get('bis')}T00:00:00Z`) };
  if (params.get('status')) where.status = params.get('status') as Prisma.EventWhereInput['status'];
  if (params.get('kunde')) where.customerId = params.get('kunde')!;

  const [events, gesamt] = await Promise.all([
    db.event.findMany({
      where,
      include: { customer: { select: { id: true, name: true } }, serviceType: { select: { code: true, name: true } }, ...EVENT_MIT_BESETZUNG },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      skip, take: perPage,
    }),
    db.event.count({ where }),
  ]);

  return ok({
    daten: events.map((event) => {
      const b = besetzungAus(event.positions);
      return {
        id: event.id, referenz: event.reference, name: event.name,
        datum: isoDate(event.date), beginn: event.startTime, ende: event.endTime,
        ort: { veranstaltungsort: event.venue, strasse: event.street, plz: event.zip, stadt: event.city },
        treffpunkt: event.meetingPoint, treffzeit: event.meetingTime,
        status: event.status, prioritaet: event.priority,
        kunde: event.customer, leistungsbereich: event.serviceType,
        besetzung: { soll: b.soll, ist: b.ist, bestaetigt: b.bestaetigt, offen: b.offen },
      };
    }),
    seite: page, proSeite: perPage, gesamt,
  });
});

import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const GET = route(async (request: Request) => {
  await apiZugang(request, 'requests.view', 'requests');
  const params = new URL(request.url).searchParams;
  const { page, perPage, skip } = pagination(params, 50);

  const where: Prisma.RequestWhereInput = { deletedAt: null };
  if (params.get('status')) where.status = params.get('status') as Prisma.RequestWhereInput['status'];

  const [anfragen, gesamt] = await Promise.all([
    db.request.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: perPage }),
    db.request.count({ where }),
  ]);

  return ok({
    daten: anfragen.map((a) => ({
      id: a.id, referenz: a.reference, status: a.status, kanal: a.channel,
      firma: a.company, ansprechpartner: a.contactPerson, email: a.email, telefon: a.phone,
      anlass: a.eventName, datum: a.eventDate ? a.eventDate.toISOString().slice(0, 10) : null,
      beginn: a.startTime, ende: a.endTime, ort: a.location,
      benoetigteMitarbeiter: a.employeesNeeded, leistungsart: a.serviceType,
      fehlendeAngaben: a.missingFields, konfidenz: a.confidence,
      eventId: a.eventId, eingegangen: a.createdAt.toISOString(),
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});

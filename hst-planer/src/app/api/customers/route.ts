import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const GET = route(async (request: Request) => {
  await apiZugang(request, 'customers.view', 'customers');
  const { page, perPage, skip } = pagination(new URL(request.url).searchParams, 50);

  const [kunden, gesamt] = await Promise.all([
    db.customer.findMany({
      where: { deletedAt: null },
      include: { contacts: { select: { name: true, role: true, email: true, phone: true, primary: true } } },
      orderBy: { name: 'asc' }, skip, take: perPage,
    }),
    db.customer.count({ where: { deletedAt: null } }),
  ]);

  return ok({
    daten: kunden.map((k) => ({
      id: k.id, name: k.name, kurzname: k.shortName, email: k.email, telefon: k.phone,
      adresse: { strasse: k.street, plz: k.zip, ort: k.city },
      ansprechpartner: k.contacts, aktiv: k.active,
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});

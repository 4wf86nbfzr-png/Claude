import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';

export const GET = route(async (request: Request) => {
  await apiZugang(request, 'partners.view', 'partners');
  const { page, perPage, skip } = pagination(new URL(request.url).searchParams, 50);

  const [partner, gesamt] = await Promise.all([
    db.partner.findMany({
      where: { deletedAt: null },
      include: { _count: { select: { employees: { where: { deletedAt: null } } } } },
      orderBy: { name: 'asc' }, skip, take: perPage,
    }),
    db.partner.count({ where: { deletedAt: null } }),
  ]);

  return ok({
    daten: partner.map((p) => ({
      id: p.id, name: p.name, ansprechpartner: p.contactName, email: p.email, telefon: p.phone,
      adresse: { strasse: p.street, plz: p.zip, ort: p.city },
      anzahlKraefte: p._count.employees, aktiv: p.active,
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});

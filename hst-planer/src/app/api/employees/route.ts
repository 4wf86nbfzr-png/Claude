import { ok, pagination, route } from '@/lib/api';
import { apiZugang } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import type { Prisma } from '@prisma/client';

export const GET = route(async (request: Request) => {
  const zugang = await apiZugang(request, 'employees.view', 'employees');
  const params = new URL(request.url).searchParams;
  const { page, perPage, skip } = pagination(params, 50);

  const where: Prisma.EmployeeWhereInput = zugang.benutzer ? employeeFilter(zugang.benutzer) : { deletedAt: null };
  if (params.get('aktiv') !== 'alle') where.active = true;
  if (params.get('q')) {
    where.OR = [
      { firstName: { contains: params.get('q')!, mode: 'insensitive' } },
      { lastName: { contains: params.get('q')!, mode: 'insensitive' } },
      { personnelNo: { contains: params.get('q')!, mode: 'insensitive' } },
    ];
  }

  const [mitarbeiter, gesamt] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true, personnelNo: true, firstName: true, lastName: true,
        mobile: true, email: true, zip: true, city: true, employmentType: true,
        active: true, blocked: true, preferredAreas: true,
        qualifications: { select: { expiresAt: true, qualification: { select: { code: true, name: true } } } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip, take: perPage,
    }),
    db.employee.count({ where }),
  ]);

  return ok({
    daten: mitarbeiter.map((person) => ({
      id: person.id, personalnummer: person.personnelNo,
      vorname: person.firstName, nachname: person.lastName,
      mobil: person.mobile, email: person.email,
      plz: person.zip, ort: person.city,
      beschaeftigung: person.employmentType,
      aktiv: person.active, gesperrt: person.blocked,
      bereiche: person.preferredAreas,
      qualifikationen: person.qualifications.map((q) => ({
        code: q.qualification.code, name: q.qualification.name,
        gueltigBis: q.expiresAt ? q.expiresAt.toISOString().slice(0, 10) : null,
      })),
    })),
    seite: page, proSeite: perPage, gesamt,
  });
});

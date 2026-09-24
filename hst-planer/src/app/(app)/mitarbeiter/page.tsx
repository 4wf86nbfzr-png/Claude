import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { employeeFilter } from '@/lib/queries/scope';
import { EMPLOYMENT_TYPE } from '@/lib/status';
import { Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Mitarbeiter' };
export const dynamic = 'force-dynamic';

export default async function MitarbeiterListe({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('employees.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 30);

  const where: Prisma.EmployeeWhereInput = { ...employeeFilter(user) };
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { personnelNo: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
      { mobile: { contains: params.q } },
      { phone: { contains: params.q } },
      { city: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.beschaeftigung) where.employmentType = params.beschaeftigung as Prisma.EmployeeWhereInput['employmentType'];
  if (params.qualifikation) where.qualifications = { some: { qualificationId: params.qualifikation } };
  if (params.status === 'inaktiv') where.active = false;
  else if (params.status === 'gesperrt') where.blocked = true;
  else if (params.status !== 'alle') where.active = true;

  const [mitarbeiter, gesamt, qualifikationen] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true, personnelNo: true, firstName: true, lastName: true, mobile: true, email: true,
        city: true, employmentType: true, active: true, blocked: true, preferredAreas: true,
        partner: { select: { name: true } },
        qualifications: { select: { expiresAt: true, qualification: { select: { code: true, name: true } } } },
        _count: { select: { assignments: { where: { deletedAt: null } } } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip, take: perPage,
    }),
    db.employee.count({ where }),
    db.qualification.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const heute = new Date();

  return (
    <>
      <Seitenkopf
        titel="Mitarbeiter"
        unter={`${gesamt.toLocaleString('de-DE')} Eintraege`}
        aktionen={
          <>
            <Link href="/api/export/mitarbeiter" className="knopf"><Icon name="download" /> Excel-Export</Link>
            {can(user.role, 'employees.edit') && <Link href="/mitarbeiter/neu" className="knopf knopf-primaer"><Icon name="plus" /> Neuer Mitarbeiter</Link>}
          </>
        }
      />

      <Karte>
        <Filterleiste
          platzhalter="Name, Personalnummer, Telefon oder Ort …"
          felder={[
            { name: 'beschaeftigung', label: 'Beschaeftigung', optionen: Object.entries(EMPLOYMENT_TYPE).map(([wert, label]) => ({ wert, label })) },
            { name: 'qualifikation', label: 'Qualifikation', optionen: qualifikationen.map((q) => ({ wert: q.id, label: q.name })) },
            { name: 'status', label: 'Status', optionen: [{ wert: 'alle', label: 'alle' }, { wert: 'inaktiv', label: 'inaktiv' }, { wert: 'gesperrt', label: 'gesperrt' }] },
          ]}
        />

        {mitarbeiter.length === 0 ? (
          <Leer>Keine Mitarbeiter gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Name</th><th>Personalnr.</th><th>Beschaeftigung</th><th>Ort</th><th>Kontakt</th><th>Qualifikationen</th><th>Einsaetze</th></tr>
              </thead>
              <tbody>
                {mitarbeiter.map((person) => {
                  const abgelaufen = person.qualifications.filter((q) => q.expiresAt && q.expiresAt < heute);
                  return (
                    <tr key={person.id} className={person.blocked ? 'zeile-rot' : !person.active ? 'zeile-grau' : undefined}>
                      <td>
                        <Link href={`/mitarbeiter/${person.id}`} style={{ fontWeight: 500 }}>{person.lastName}, {person.firstName}</Link>
                        <span style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                          {!person.active && <span className="marke marke-grau">inaktiv</span>}
                          {person.blocked && <span className="marke marke-rot">Sperrvermerk</span>}
                          {person.partner && <span className="marke marke-blau">{person.partner.name}</span>}
                        </span>
                      </td>
                      <td className="zahl" style={{ fontSize: 12, color: 'var(--text-gedaempft)' }}>{person.personnelNo}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>{EMPLOYMENT_TYPE[person.employmentType] ?? person.employmentType}</td>
                      <td style={{ color: 'var(--text-sekundaer)' }}>{person.city ?? '–'}</td>
                      <td style={{ fontSize: 12 }}>
                        {person.mobile ? <a href={`tel:${person.mobile.replace(/\s/g, '')}`}>{person.mobile}</a> : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {person.qualifications.slice(0, 4).map((q) => (
                            <span key={q.qualification.code}
                                  className={`marke ${q.expiresAt && q.expiresAt < heute ? 'marke-rot' : 'marke-grau'}`}>
                              {q.qualification.code}
                            </span>
                          ))}
                          {person.qualifications.length > 4 && <span className="marke marke-grau">+{person.qualifications.length - 4}</span>}
                          {abgelaufen.length > 0 && <span className="marke marke-rot">{abgelaufen.length} abgelaufen</span>}
                        </span>
                      </td>
                      <td className="zahl">{person._count.assignments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Blaettern seite={page} proSeite={perPage} gesamt={gesamt} />
      </Karte>
    </>
  );
}

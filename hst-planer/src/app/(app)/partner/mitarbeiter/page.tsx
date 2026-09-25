import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { personenfelder } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { EMPLOYMENT_TYPE } from '@/lib/status';
import { Gesperrt, Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';

export const metadata: Metadata = { title: 'Partner-Mitarbeiter' };
export const dynamic = 'force-dynamic';

/**
 * Partner-Mitarbeiter (SecPlan 2, Bereich PARTNER).
 *
 * Kräfte, die über ein Partnerunternehmen kommen. Von ihnen führen wir
 * weniger Daten als vom eigenen Personal – das ist keine Lücke, sondern
 * Datenminimierung: Vertrag und Vergütung sind Sache des Partners.
 */
export default async function PartnerMitarbeiter({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('partners.view');
  const params = await searchParams;
  const felder = personenfelder(user.role);

  const where: Prisma.EmployeeWhereInput = { ...employeeFilter(user), partnerId: { not: null } };
  if (user.scope === 'PARTNER') where.partnerId = user.partnerId ?? '__kein_partner__';
  else if (params.partner) where.partnerId = params.partner;
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { personnelNo: { contains: params.q, mode: 'insensitive' } },
    ];
  }

  const [kraefte, partner] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true, personnelNo: true, firstName: true, lastName: true,
        employmentType: true, active: true, blocked: true,
        mobile: felder.kontakt, email: felder.kontakt,
        partner: { select: { id: true, name: true, active: true } },
        qualifications: { select: { expiresAt: true, qualification: { select: { code: true } } } },
        _count: { select: { assignments: { where: { deletedAt: null } } } },
      },
      orderBy: [{ partner: { name: 'asc' } }, { lastName: 'asc' }],
      take: 300,
    }),
    db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  const heute = new Date();

  return (
    <>
      <Seitenkopf titel="Partner-Mitarbeiter" unter={`${kraefte.length} gemeldete Kräfte`} />

      <div style={{ marginBottom: 12 }}>
        <Hinweis art="info">
          Für Kräfte eines Partnerunternehmens führen wir nur, was für die Planung nötig ist:
          Name, Qualifikation, Erreichbarkeit im Einsatz. Arbeitsvertrag, Vergütung und
          Personalakte liegen beim Partner.
        </Hinweis>
      </div>

      <Karte>
        <Filterleiste
          platzhalter="Name oder Personalnummer …"
          felder={user.scope === 'PARTNER' ? [] : [{ name: 'partner', label: 'Unternehmen', optionen: partner.map((p) => ({ wert: p.id, label: p.name })) }]}
        />

        {kraefte.length === 0 ? (
          <Leer>Es ist keine Kraft eines Partnerunternehmens hinterlegt.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Name</th><th>Unternehmen</th><th>Personalnr.</th><th>Beschäftigung</th><th>Erreichbar</th><th>Qualifikationen</th><th>Einsätze</th></tr>
              </thead>
              <tbody>
                {kraefte.map((person) => {
                  const abgelaufen = person.qualifications.filter((q) => q.expiresAt && q.expiresAt < heute).length;
                  return (
                    <tr key={person.id} className={person.blocked ? 'zeile-rot' : !person.active ? 'zeile-grau' : undefined}>
                      <td>
                        <Link href={`/mitarbeiter/${person.id}`} style={{ fontWeight: 500 }}>
                          {person.lastName}, {person.firstName}
                        </Link>
                        {person.blocked && <span className="marke marke-rot" style={{ marginLeft: 5 }}>Sperrvermerk</span>}
                      </td>
                      <td>
                        {person.partner && (
                          <Link href={`/partner/${person.partner.id}`}>{person.partner.name}</Link>
                        )}
                      </td>
                      <td className="zahl" style={{ color: 'var(--text-3)' }}>{person.personnelNo}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {EMPLOYMENT_TYPE[person.employmentType] ?? person.employmentType}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {!felder.kontakt ? <Gesperrt />
                          : person.mobile ? <a href={`tel:${person.mobile.replace(/\s/g, '')}`}>{person.mobile}</a> : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {person.qualifications.slice(0, 4).map((q) => (
                          <span key={q.qualification.code}
                                className={`marke ${q.expiresAt && q.expiresAt < heute ? 'marke-rot' : 'marke-grau'}`}
                                style={{ marginRight: 3 }}>
                            {q.qualification.code}
                          </span>
                        ))}
                        {abgelaufen > 0 && <span className="marke marke-rot">{abgelaufen} abgelaufen</span>}
                        {person.qualifications.length === 0 && <span style={{ color: 'var(--text-3)' }}>–</span>}
                      </td>
                      <td className="zahl">{person._count.assignments}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { APPLICANT_STATUS, label } from '@/lib/status';
import { formatDateDE } from '@/lib/time';
import { Hinweis, Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Bewerber' };
export const dynamic = 'force-dynamic';

/**
 * Bewerber (SecPlan 2, Bereich PERSONAL).
 *
 * Bewusst getrennt vom Mitarbeiterstamm: von einem Bewerber liegen
 * weniger Daten vor, und die Aufbewahrung endet früher. Das Löschdatum
 * steht deshalb in der Liste und nicht erst in der Akte.
 */
export default async function Bewerberliste({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('applicants.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 30);

  const where: Prisma.ApplicantWhereInput = { deletedAt: null };
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' } },
      { lastName: { contains: params.q, mode: 'insensitive' } },
      { email: { contains: params.q, mode: 'insensitive' } },
      { position: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.ApplicantWhereInput['status'];

  const [bewerber, gesamt, faellig] = await Promise.all([
    db.applicant.findMany({ where, orderBy: [{ appliedAt: 'desc' }], skip, take: perPage }),
    db.applicant.count({ where }),
    db.applicant.count({ where: { deletedAt: null, deleteAt: { not: null, lte: new Date() } } }),
  ]);

  const heute = new Date();

  return (
    <>
      <Seitenkopf
        titel="Bewerber"
        unter={`${gesamt.toLocaleString('de-DE')} Einträge`}
      />

      {faellig > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Hinweis art="warnung">
            {faellig} {faellig === 1 ? 'Bewerbung hat' : 'Bewerbungen haben'} das Löschdatum aus dem
            Löschkonzept erreicht.{' '}
            <Link href="/compliance/loeschfristen">Löschfristen ansehen</Link>
          </Hinweis>
        </div>
      )}

      <Karte>
        <Filterleiste
          platzhalter="Name, E-Mail oder beworbene Stelle …"
          felder={[{
            name: 'status', label: 'Status',
            optionen: Object.entries(APPLICANT_STATUS).map(([wert, s]) => ({ wert, label: s.label })),
          }]}
        />

        {bewerber.length === 0 ? (
          <Leer>Keine Bewerbung gefunden.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Name</th><th>Beworben als</th><th>Eingang</th><th>Status</th>
                  <th>Kontakt</th><th>Quelle</th><th>Löschdatum</th>
                </tr>
              </thead>
              <tbody>
                {bewerber.map((person) => {
                  const ueberfaellig = person.deleteAt !== null && person.deleteAt <= heute;
                  return (
                    <tr key={person.id} className={ueberfaellig ? 'zeile-rot' : undefined}>
                      <td style={{ fontWeight: 500 }}>{person.lastName}, {person.firstName}</td>
                      <td>{person.position ?? '–'}</td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(person.appliedAt)}</td>
                      <td><StatusMarke status={label(APPLICANT_STATUS, person.status)} /></td>
                      <td style={{ fontSize: 12 }}>
                        {person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : person.phone ?? '–'}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{person.source ?? '–'}</td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {person.deleteAt
                          ? <span className={ueberfaellig ? 'marke marke-rot' : undefined}>{formatDateDE(person.deleteAt)}</span>
                          : <span style={{ color: 'var(--text-3)' }}>offen</span>}
                      </td>
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

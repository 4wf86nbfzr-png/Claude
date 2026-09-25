import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { formatDateDE } from '@/lib/time';
import { EMPLOYMENT_TYPE } from '@/lib/status';
import { Karte, Leer, Paar, Seitenkopf } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function PartnerDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('partners.view');
  const { id } = await params;
  if (user.scope === 'PARTNER' && user.partnerId !== id) notFound();

  const partner = await db.partner.findFirst({
    where: { id, deletedAt: null },
    include: {
      employees: { where: { deletedAt: null }, orderBy: { lastName: 'asc' } },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      assignments: {
        where: { deletedAt: null },
        include: { event: { select: { id: true, name: true, date: true } }, employee: { select: { firstName: true, lastName: true } } },
        orderBy: { event: { date: 'desc' } }, take: 25,
      },
    },
  });
  if (!partner) notFound();

  const darfBearbeiten = can(user.role, 'partners.edit');
  const darfFinanzen = can(user.role, 'finance.view');

  return (
    <>
      <Seitenkopf titel={partner.name} brotkrumen={[{ href: '/partner', label: 'Partner' }]}
                  unter={[partner.contactName, partner.city].filter(Boolean).join(' · ') || undefined}
                  aktionen={darfBearbeiten && <Link href={`/partner/${id}/bearbeiten`} className="knopf knopf-primaer">Bearbeiten</Link>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Kräfte des Partners">
            {partner.employees.length === 0 ? <Leer>Keine Mitarbeiter hinterlegt.</Leer> : (
              <table className="tabelle">
                <thead><tr><th>Name</th><th>Personalnr.</th><th>Beschäftigung</th><th>Kontakt</th></tr></thead>
                <tbody>
                  {partner.employees.map((person) => (
                    <tr key={person.id}>
                      <td><Link href={`/mitarbeiter/${person.id}`}>{person.lastName}, {person.firstName}</Link></td>
                      <td className="zahl" style={{ fontSize: 12, color: 'var(--text-3)' }}>{person.personnelNo}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{EMPLOYMENT_TYPE[person.employmentType] ?? person.employmentType}</td>
                      <td style={{ fontSize: 12 }}>{person.mobile ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Karte>

          <Karte titel="Einsätze">
            {partner.assignments.length === 0 ? <Leer>Noch keine Einsätze.</Leer> : (
              <table className="tabelle">
                <thead><tr><th>Datum</th><th>Event</th><th>Kraft</th></tr></thead>
                <tbody>
                  {partner.assignments.map((a) => (
                    <tr key={a.id}>
                      <td className="zahl">{formatDateDE(a.event.date)}</td>
                      <td><Link href={`/events/${a.event.id}`}>{a.event.name}</Link></td>
                      <td style={{ color: 'var(--text-2)' }}>{a.employee.firstName} {a.employee.lastName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Karte>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Karte titel="Stammdaten">
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Paar label="Ansprechpartner">{partner.contactName ?? '–'}</Paar>
              <Paar label="E-Mail">{partner.email ? <a href={`mailto:${partner.email}`}>{partner.email}</a> : '–'}</Paar>
              <Paar label="Telefon">{partner.phone ?? '–'}</Paar>
              <Paar label="Adresse">{[partner.street, [partner.zip, partner.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '–'}</Paar>
              {darfFinanzen && <Paar label="Verrechnungssatz">{partner.hourlyRate ? `${String(partner.hourlyRate)} EUR` : '–'}</Paar>}
            </div>
          </Karte>
          {darfBearbeiten && partner.notesInternal && (
            <Karte titel="Interne Notizen">
              <div style={{ padding: 14, whiteSpace: 'pre-wrap', fontSize: 13 }}>{partner.notesInternal}</div>
            </Karte>
          )}
        </div>
      </div>
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter, employeeFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { EVENT_STATUS, label } from '@/lib/status';
import { Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Suche' };
export const dynamic = 'force-dynamic';

/**
 * Globale Suche (Spec 27).
 * Gesucht wird über Mitarbeiter, Events, Kunden, Partner und Anfragen –
 * jeweils nur in dem, was die Rolle sehen darf.
 */
export default async function Suche({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite();
  const begriff = (await searchParams).q?.trim() ?? '';

  if (begriff.length < 2) {
    return (
      <>
        <Seitenkopf titel="Suche" />
        <Karte><Leer>Bitte geben Sie mindestens zwei Zeichen ein. Gesucht wird in Mitarbeitern, Events, Kunden, Partnern und Anfragen.</Leer></Karte>
      </>
    );
  }

  const enthaelt = { contains: begriff, mode: 'insensitive' as const };
  const ziffern = begriff.replace(/\D/g, '');

  const [mitarbeiter, events, kunden, partner, anfragen] = await Promise.all([
    can(user.role, 'employees.view')
      ? db.employee.findMany({
          where: {
            ...employeeFilter(user),
            OR: [
              { firstName: enthaelt }, { lastName: enthaelt }, { personnelNo: enthaelt },
              { email: enthaelt }, { city: enthaelt },
              ...(ziffern.length >= 4 ? [{ mobile: { contains: ziffern } }, { phone: { contains: ziffern } }] : []),
            ],
          },
          select: { id: true, firstName: true, lastName: true, personnelNo: true, mobile: true, city: true },
          take: 12,
        })
      : Promise.resolve([]),

    can(user.role, 'events.view')
      ? db.event.findMany({
          where: { ...eventFilter(user), OR: [{ name: enthaelt }, { reference: enthaelt }, { venue: enthaelt }, { city: enthaelt }] },
          select: { id: true, reference: true, name: true, date: true, status: true, venue: true },
          orderBy: { date: 'desc' }, take: 12,
        })
      : Promise.resolve([]),

    can(user.role, 'customers.view')
      ? db.customer.findMany({
          where: { deletedAt: null, OR: [{ name: enthaelt }, { shortName: enthaelt }, { email: enthaelt }, { city: enthaelt }] },
          select: { id: true, name: true, city: true, email: true }, take: 8,
        })
      : Promise.resolve([]),

    can(user.role, 'partners.view')
      ? db.partner.findMany({
          where: { deletedAt: null, OR: [{ name: enthaelt }, { contactName: enthaelt }, { email: enthaelt }] },
          select: { id: true, name: true, contactName: true }, take: 8,
        })
      : Promise.resolve([]),

    can(user.role, 'requests.view')
      ? db.request.findMany({
          where: { deletedAt: null, OR: [{ reference: enthaelt }, { company: enthaelt }, { contactPerson: enthaelt }, { email: enthaelt }, { eventName: enthaelt }] },
          select: { id: true, reference: true, company: true, contactPerson: true, eventDate: true, status: true }, take: 8,
        })
      : Promise.resolve([]),
  ]);

  const gesamt = mitarbeiter.length + events.length + kunden.length + partner.length + anfragen.length;

  return (
    <>
      <Seitenkopf titel={`Suche: „${begriff}“`} unter={`${gesamt} Treffer`} />

      {gesamt === 0 && <Karte><Leer>Keine Treffer. Versuchen Sie es mit einem Teil des Namens, einer Personalnummer oder einer Event-ID.</Leer></Karte>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {mitarbeiter.length > 0 && (
          <Karte titel={`Mitarbeiter (${mitarbeiter.length})`}>
            <table className="tabelle">
              <tbody>
                {mitarbeiter.map((person) => (
                  <tr key={person.id}>
                    <td><Link href={`/mitarbeiter/${person.id}`} style={{ fontWeight: 500 }}>{person.lastName}, {person.firstName}</Link></td>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-3)' }}>{person.personnelNo}</td>
                    <td style={{ color: 'var(--text-2)' }}>{person.city ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>{person.mobile ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Karte>
        )}

        {events.length > 0 && (
          <Karte titel={`Events (${events.length})`}>
            <table className="tabelle">
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(event.date)}</td>
                    <td><Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link></td>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-3)' }}>{event.reference}</td>
                    <td style={{ color: 'var(--text-2)' }}>{event.venue ?? '–'}</td>
                    <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Karte>
        )}

        {kunden.length > 0 && (
          <Karte titel={`Kunden (${kunden.length})`}>
            <table className="tabelle">
              <tbody>
                {kunden.map((kunde) => (
                  <tr key={kunde.id}>
                    <td><Link href={`/kunden/${kunde.id}`} style={{ fontWeight: 500 }}>{kunde.name}</Link></td>
                    <td style={{ color: 'var(--text-2)' }}>{kunde.city ?? '–'}</td>
                    <td style={{ fontSize: 12 }}>{kunde.email ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Karte>
        )}

        {partner.length > 0 && (
          <Karte titel={`Partner (${partner.length})`}>
            <table className="tabelle">
              <tbody>
                {partner.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/partner/${p.id}`} style={{ fontWeight: 500 }}>{p.name}</Link></td>
                    <td style={{ color: 'var(--text-2)' }}>{p.contactName ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Karte>
        )}

        {anfragen.length > 0 && (
          <Karte titel={`Anfragen (${anfragen.length})`}>
            <table className="tabelle">
              <tbody>
                {anfragen.map((anfrage) => (
                  <tr key={anfrage.id}>
                    <td className="zahl" style={{ fontSize: 12, color: 'var(--text-3)' }}>{anfrage.reference}</td>
                    <td><Link href={`/anfragen/${anfrage.id}`} style={{ fontWeight: 500 }}>{anfrage.company ?? anfrage.contactPerson ?? 'ohne Angabe'}</Link></td>
                    <td className="zahl">{anfrage.eventDate ? formatDateDE(anfrage.eventDate) : '–'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{anfrage.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Karte>
        )}
      </div>
    </>
  );
}

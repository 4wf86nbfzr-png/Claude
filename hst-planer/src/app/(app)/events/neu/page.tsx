import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { isoDate } from '@/lib/time';
import { Seitenkopf } from '@/components/ui';
import { EventFormular } from '../event-formular';

export const metadata: Metadata = { title: 'Neues Event' };

export default async function NeuesEvent({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('events.edit');
  const params = await searchParams;

  const [kunden, bereiche, leitungen] = await Promise.all([
    db.customer.findMany({ where: { deletedAt: null, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.employee.findMany({ where: { deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
  ]);

  return (
    <>
      <Seitenkopf titel="Neues Event" brotkrumen={[{ href: '/events', label: 'Events' }]}
                  unter="Positionen und Mitarbeiter werden im naechsten Schritt ergaenzt." />
      <EventFormular
        werte={{ date: params.datum ?? isoDate(new Date()), customerId: params.kunde ?? null, name: params.name ?? '' }}
        kunden={kunden}
        bereiche={bereiche}
        leitungen={leitungen.map((l) => ({ id: l.id, name: `${l.firstName} ${l.lastName}` }))}
        darfFinanzen={can(user.role, 'finance.view')}
      />
    </>
  );
}

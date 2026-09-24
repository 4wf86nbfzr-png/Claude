import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { besetzungAus, EVENT_MIT_BESETZUNG } from '@/lib/queries/coverage';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, weekdayDE } from '@/lib/time';
import { EVENT_STATUS, PRIORITY, label } from '@/lib/status';
import { Balken, StatusMarke } from '@/components/ui';
import { Icon } from '@/components/icons';
import { EventReiter } from './reiter';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const user = await seite('events.view');
  const { id } = await params;

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    select: {
      id: true, reference: true, name: true, date: true, startTime: true, endTime: true,
      venue: true, city: true, status: true, priority: true, archivedAt: true,
      customer: { select: { id: true, name: true } },
      serviceType: { select: { name: true } },
      ...EVENT_MIT_BESETZUNG,
    },
  });
  if (!event) notFound();

  const b = besetzungAus(event.positions);
  const darfPlanen = can(user.role, 'dispo.edit');

  return (
    <>
      <header style={{ marginBottom: 14 }}>
        <nav aria-label="Brotkrumen" style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-gedaempft)', marginBottom: 4 }}>
          <Link href="/events" style={{ color: 'inherit' }}>Events</Link>
          <span aria-hidden>/</span>
          <span className="zahl">{event.reference}</span>
        </nav>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 20, fontWeight: 650, letterSpacing: '-.01em', margin: 0 }}>{event.name}</h1>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-sekundaer)', marginTop: 5 }}>
              {event.customer && <Link href={`/kunden/${event.customer.id}`} style={{ color: 'inherit' }}>{event.customer.name}</Link>}
              <span className="zahl">{weekdayDE(event.date)}, {formatDateDE(event.date)} · {event.startTime ?? '–'}–{event.endTime ?? '–'}</span>
              {(event.venue || event.city) && <span>{[event.venue, event.city].filter(Boolean).join(', ')}</span>}
              {event.serviceType && <span>{event.serviceType.name}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <StatusMarke status={label(EVENT_STATUS, event.status)} />
              {event.priority !== 'NORMAL' && <StatusMarke status={label(PRIORITY, event.priority)} />}
              {event.archivedAt && <span className="marke marke-grau">Archiviert</span>}
              <Balken ist={b.ist} soll={b.soll} />
              {b.bestaetigt < b.ist && (
                <span className="marke marke-gelb">{b.ist - b.bestaetigt} noch ohne Zusage</span>
              )}
            </div>
          </div>

          <div className="nicht-drucken" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/events/${event.id}/einsatzplan`} className="knopf"><Icon name="print" /> Einsatzplan</Link>
            {darfPlanen && <Link href={`/events/${event.id}/bearbeiten`} className="knopf">Bearbeiten</Link>}
            {darfPlanen && <Link href={`/disposition?event=${event.id}`} className="knopf knopf-primaer"><Icon name="board" /> Disponieren</Link>}
          </div>
        </div>
      </header>

      <EventReiter id={event.id} rolle={user.role} />
      {children}
    </>
  );
}

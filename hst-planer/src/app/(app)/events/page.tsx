import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { besetzungAus, EVENT_MIT_BESETZUNG } from '@/lib/queries/coverage';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, toDateOnly } from '@/lib/time';
import { EVENT_STATUS, label } from '@/lib/status';
import { Balken, Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';
import { Icon } from '@/components/icons';

export const metadata: Metadata = { title: 'Events' };
export const dynamic = 'force-dynamic';

export default async function EventListe({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('events.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params);

  const where: Prisma.EventWhereInput = { ...eventFilter(user) };
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { reference: { contains: params.q, mode: 'insensitive' } },
      { venue: { contains: params.q, mode: 'insensitive' } },
      { city: { contains: params.q, mode: 'insensitive' } },
      { customer: { name: { contains: params.q, mode: 'insensitive' } } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.EventWhereInput['status'];
  if (params.kunde) where.customerId = params.kunde;
  if (params.bereich) where.serviceTypeId = params.bereich;
  if (params.zeitraum === 'kommend') where.date = { gte: toDateOnly(new Date()) };
  if (params.zeitraum === 'vergangen') where.date = { lt: toDateOnly(new Date()) };
  if (params.archiv !== 'ja') where.archivedAt = null;

  const [events, gesamt, kunden, bereiche] = await Promise.all([
    db.event.findMany({
      where,
      select: {
        id: true, reference: true, name: true, date: true, startTime: true, endTime: true,
        venue: true, city: true, status: true, priority: true,
        customer: { select: { name: true } },
        serviceType: { select: { name: true, color: true } },
        ...EVENT_MIT_BESETZUNG,
      },
      orderBy: params.zeitraum === 'vergangen' ? [{ date: 'desc' }] : [{ date: 'asc' }, { startTime: 'asc' }],
      skip, take: perPage,
    }),
    db.event.count({ where }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <>
      <Seitenkopf
        titel="Events"
        unter={`${gesamt.toLocaleString('de-DE')} Einträge`}
        aktionen={
          <>
            <Link href="/api/export/events" className="knopf"><Icon name="download" /> Excel-Export</Link>
            {can(user.role, 'events.edit') && <Link href="/events/neu" className="knopf knopf-primaer"><Icon name="plus" /> Neues Event</Link>}
          </>
        }
      />

      <Karte>
        <Filterleiste
          platzhalter="Event, Event-ID, Ort oder Kunde suchen …"
          felder={[
            { name: 'status', label: 'Status', optionen: Object.entries(EVENT_STATUS).map(([wert, s]) => ({ wert, label: s.label })) },
            { name: 'kunde', label: 'Kunde', optionen: kunden.map((k) => ({ wert: k.id, label: k.name })) },
            { name: 'bereich', label: 'Bereich', optionen: bereiche.map((b) => ({ wert: b.id, label: b.name })) },
            { name: 'zeitraum', label: 'Zeitraum', optionen: [{ wert: 'kommend', label: 'Ab heute' }, { wert: 'vergangen', label: 'Vergangen' }] },
          ]}
        />

        {events.length === 0 ? (
          <Leer>Keine Events gefunden. Passen Sie die Filter an oder legen Sie ein neues Event an.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Datum</th><th>Event-ID</th><th>Event</th><th>Kunde</th>
                  <th>Ort</th><th>Zeit</th><th>Besetzung</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
                  const b = besetzungAus(event.positions);
                  return (
                    <tr key={event.id} className={b.offen > 0 ? 'zeile-gelb' : undefined}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(event.date)}</td>
                      <td className="zahl" style={{ color: 'var(--text-gedaempft)', fontSize: 12 }}>{event.reference}</td>
                      <td>
                        <Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link>
                        {event.serviceType && (
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{event.serviceType.name}</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-sekundaer)' }}>{event.customer?.name ?? '–'}</td>
                      <td style={{ color: 'var(--text-sekundaer)' }}>{event.venue ?? event.city ?? '–'}</td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{event.startTime ?? '–'}–{event.endTime ?? '–'}</td>
                      <td><Balken ist={b.ist} soll={b.soll} /></td>
                      <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
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

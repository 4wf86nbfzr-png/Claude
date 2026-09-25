import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { eventFilter } from '@/lib/queries/scope';
import { besetzungAus } from '@/lib/queries/coverage';
import { formatDateDE, formatHours, toDateOnly, weekdayDE } from '@/lib/time';
import { EVENT_STATUS, label } from '@/lib/status';
import { Balken, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Einsatzhistorie' };
export const dynamic = 'force-dynamic';

/**
 * Einsatzhistorie (SecPlan 2, Bereich EINSÄTZE).
 *
 * Nur Vergangenes. Die Eventliste zeigt den Betrieb, diese Seite den
 * Nachweis: was war, wie war es besetzt, was wurde gearbeitet. Dafür
 * steht hier auch, was in der laufenden Planung nichts zu suchen hat –
 * abgeschlossene und abgerechnete Einsätze.
 */
export default async function Einsatzhistorie({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('events.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 40);
  const heute = toDateOnly(new Date());

  const where: Prisma.EventWhereInput = { ...eventFilter(user), date: { lt: heute } };
  if (params.q) {
    where.OR = [
      { name: { contains: params.q, mode: 'insensitive' } },
      { venue: { contains: params.q, mode: 'insensitive' } },
      { reference: { contains: params.q, mode: 'insensitive' } },
    ];
  }
  if (params.kunde) where.customerId = params.kunde;
  if (params.status) where.status = params.status as Prisma.EventWhereInput['status'];
  if (params.jahr) {
    const jahr = Number(params.jahr);
    where.date = { gte: new Date(Date.UTC(jahr, 0, 1)), lt: new Date(Date.UTC(jahr + 1, 0, 1)) };
  }

  const [events, gesamt, kunden, minuten] = await Promise.all([
    db.event.findMany({
      where,
      select: {
        id: true, reference: true, name: true, date: true, venue: true, status: true,
        startTime: true, endTime: true,
        customer: { select: { id: true, name: true } },
        positions: { select: { requiredCount: true, assignments: { where: { deletedAt: null }, select: { status: true, isReserve: true } } } },
        _count: { select: { incidents: true } },
      },
      orderBy: { date: 'desc' },
      skip, take: perPage,
    }),
    db.event.count({ where }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.timeEntry.aggregate({ where: { deletedAt: null, event: where }, _sum: { minutes: true } }),
  ]);

  const jahre = [...new Set([heute.getFullYear(), heute.getFullYear() - 1, heute.getFullYear() - 2])];

  return (
    <>
      <Seitenkopf
        titel="Einsatzhistorie"
        unter={`${gesamt.toLocaleString('de-DE')} abgeschlossene Einsätze`}
        aktionen={<Link href="/api/export/zeiten" className="knopf">Zeiten exportieren</Link>}
      />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Einsätze im Filter" />
        <Kennzahl wert={formatHours(minuten._sum.minutes ?? 0)} label="Erfasste Stunden" />
        <Kennzahl wert={events.reduce((s, e) => s + e._count.incidents, 0)} label="Vorfälle (Seite)"
                  farbe={events.some((e) => e._count.incidents > 0) ? 'gelb' : 'gruen'} />
        <Kennzahl wert={events.filter((e) => e.status === 'ABGERECHNET').length} label="Abgerechnet (Seite)" />
      </Raster>

      <div style={{ marginTop: 12 }}>
        <Karte>
          <Filterleiste
            platzhalter="Name, Ort oder Referenz …"
            felder={[
              { name: 'kunde', label: 'Kunde', optionen: kunden.map((k) => ({ wert: k.id, label: k.name })) },
              { name: 'jahr', label: 'Jahr', optionen: jahre.map((j) => ({ wert: String(j), label: String(j) })) },
              { name: 'status', label: 'Status', optionen: Object.entries(EVENT_STATUS).map(([wert, s]) => ({ wert, label: s.label })) },
            ]}
          />

          {events.length === 0 ? (
            <Leer>Keine vergangenen Einsätze im gewählten Filter.</Leer>
          ) : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr><th>Datum</th><th>Referenz</th><th>Einsatz</th><th>Kunde</th><th>Ort</th><th>Zeit</th><th>Besetzung</th><th>Vorfälle</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const b = besetzungAus(event.positions);
                    return (
                      <tr key={event.id} className={event._count.incidents > 0 ? 'zeile-gelb' : undefined}>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                          {weekdayDE(event.date).slice(0, 2)}. {formatDateDE(event.date)}
                        </td>
                        <td className="zahl" style={{ fontSize: 11, color: 'var(--text-3)' }}>{event.reference}</td>
                        <td><Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link></td>
                        <td style={{ color: 'var(--text-2)' }}>{event.customer?.name ?? '–'}</td>
                        <td style={{ color: 'var(--text-2)' }}>{event.venue ?? '–'}</td>
                        <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{event.startTime ?? '–'}–{event.endTime ?? '–'}</td>
                        <td><Balken ist={b.ist} soll={b.soll} /></td>
                        <td className="zahl">
                          {event._count.incidents > 0
                            ? <Link href={`/events/${event.id}`} className="marke marke-gelb">{event._count.incidents}</Link>
                            : '–'}
                        </td>
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
      </div>
    </>
  );
}

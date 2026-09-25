import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, isoDate, toDateOnly, weekdayDE } from '@/lib/time';
import { Karte, Leer, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Offene Positionen' };
export const dynamic = 'force-dynamic';

/**
 * Offene Positionen (SecPlan 2, Bereich DISPOSITION).
 *
 * Eine Position gilt als offen, solange weniger Kräfte darauf stehen als
 * verlangt. Sortiert ist nach Datum – die Lücke, die morgen aufgeht,
 * steht oben, nicht die mit den meisten fehlenden Leuten.
 */
export default async function OffenePositionen({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('dispo.view');
  const params = await searchParams;
  const darfPlanen = can(user.role, 'dispo.assign');

  const heute = toDateOnly(new Date());
  const tage = Math.min(180, Math.max(1, Number(params.tage ?? 30)));
  const bis = new Date(heute.getTime() + tage * 86400000);

  const events = await db.event.findMany({
    where: {
      ...eventFilter(user),
      date: { gte: heute, lte: bis },
      status: { notIn: ['STORNIERT', 'ABGESCHLOSSEN', 'ABGERECHNET'] },
    },
    select: {
      id: true, name: true, date: true, venue: true, startTime: true, endTime: true,
      customer: { select: { name: true } },
      positions: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, title: true, startTime: true, endTime: true, requiredCount: true,
          requirements: { select: { qualification: { select: { name: true } } } },
          assignments: { where: { deletedAt: null }, select: { status: true, isReserve: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  const zeilen = events.flatMap((event) =>
    event.positions
      .map((position) => {
        const besetzt = position.assignments.filter(
          (a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'].includes(a.status),
        ).length;
        return { event, position, besetzt, offen: position.requiredCount - besetzt };
      })
      .filter((z) => z.offen > 0),
  );

  const fehlend = zeilen.reduce((s, z) => s + z.offen, 0);

  return (
    <>
      <Seitenkopf
        titel="Offene Positionen"
        unter={`${zeilen.length} Positionen · ${fehlend} fehlende Kräfte in den nächsten ${tage} Tagen`}
        aktionen={
          <span className="knopfgruppe">
            {[7, 30, 90].map((n) => (
              <Link key={n} href={`/disposition/offene-positionen?tage=${n}`}
                    className="knopf knopf-klein" aria-pressed={tage === n}>
                {n} Tage
              </Link>
            ))}
          </span>
        }
      />

      <Karte>
        {zeilen.length === 0 ? (
          <Leer>In diesem Zeitraum ist jede Position besetzt.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Datum</th><th>Einsatz</th><th>Position</th><th>Zeit</th>
                  <th>Fehlt</th><th>Anforderung</th>{darfPlanen && <th style={{ width: 1 }} />}
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ event, position, besetzt, offen }) => (
                  <tr key={position.id} className={besetzt === 0 ? 'zeile-rot' : 'zeile-gelb'}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/disposition?tag=${isoDate(event.date)}`}>
                        {weekdayDE(event.date).slice(0, 2)}. {formatDateDE(event.date)}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link>
                      {event.customer && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{event.customer.name}</span>}
                    </td>
                    <td>{position.title}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                      {position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'}
                    </td>
                    <td className="zahl">
                      <span className={`marke marke-${besetzt === 0 ? 'rot' : 'gelb'}`}>{offen} von {position.requiredCount}</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>
                      {position.requirements.map((r) => r.qualification.name).join(', ') || '–'}
                    </td>
                    {darfPlanen && (
                      <td>
                        <Link href={`/events/${event.id}/mitarbeiter?position=${position.id}`} className="knopf knopf-klein knopf-primaer">
                          Besetzen
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}

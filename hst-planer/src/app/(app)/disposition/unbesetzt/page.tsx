import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, isoDate, toDateOnly, weekdayDE } from '@/lib/time';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';

export const metadata: Metadata = { title: 'Unbesetzte Schichten' };
export const dynamic = 'force-dynamic';

/**
 * Unbesetzte Schichten (SecPlan 2, Bereich DISPOSITION).
 *
 * Unterschied zu den offenen Positionen: hier steht nur, was komplett
 * ohne Zusage dasteht. Eine Position mit drei von vier Leuten ist eine
 * Lücke; eine Position mit null Leuten ist ein Problem. Zuerst die
 * nächsten 72 Stunden, denn dort wird es eng.
 */
export default async function UnbesetzteSchichten() {
  const user = await seite('dispo.view');
  const darfPlanen = can(user.role, 'dispo.assign');

  const heute = toDateOnly(new Date());
  const in72h = new Date(heute.getTime() + 3 * 86400000);
  const in60Tagen = new Date(heute.getTime() + 60 * 86400000);

  const events = await db.event.findMany({
    where: {
      ...eventFilter(user),
      date: { gte: heute, lte: in60Tagen },
      status: { notIn: ['STORNIERT', 'ABGESCHLOSSEN', 'ABGERECHNET'] },
    },
    select: {
      id: true, name: true, date: true, venue: true, startTime: true, endTime: true,
      customer: { select: { name: true } },
      operationLead: { select: { firstName: true, lastName: true, mobile: true } },
      positions: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, title: true, startTime: true, endTime: true, requiredCount: true,
          assignments: { where: { deletedAt: null }, select: { status: true, isReserve: true } },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  const zeilen = events.flatMap((event) =>
    event.positions
      .filter((position) => {
        if (position.requiredCount <= 0) return false;
        const zugesagt = position.assignments.filter(
          (a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ERSCHIENEN'].includes(a.status),
        ).length;
        return zugesagt === 0;
      })
      .map((position) => {
        const angefragt = position.assignments.filter((a) => !a.isReserve && a.status === 'ANGEFRAGT').length;
        return { event, position, angefragt, dringend: event.date <= in72h };
      }),
  );

  const dringend = zeilen.filter((z) => z.dringend);

  return (
    <>
      <Seitenkopf
        titel="Unbesetzte Schichten"
        unter="Positionen, auf denen niemand zugesagt hat – unabhängig davon, wie viele Kräfte verlangt sind."
      />

      {dringend.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Hinweis art="fehler">
            <strong>{dringend.length} {dringend.length === 1 ? 'Schicht beginnt' : 'Schichten beginnen'} in den nächsten 72 Stunden</strong>
            {' '}und {dringend.length === 1 ? 'hat' : 'haben'} noch keine Zusage.
          </Hinweis>
        </div>
      )}

      <Karte>
        {zeilen.length === 0 ? (
          <Leer>Auf jeder Schicht der nächsten 60 Tage steht mindestens eine zugesagte Kraft.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Datum</th><th>Einsatz</th><th>Position</th><th>Zeit</th>
                  <th>Verlangt</th><th>Angefragt</th><th>Einsatzleitung</th>{darfPlanen && <th style={{ width: 1 }} />}
                </tr>
              </thead>
              <tbody>
                {zeilen.map(({ event, position, angefragt, dringend: eilt }) => (
                  <tr key={position.id} className={eilt ? 'zeile-rot' : 'zeile-gelb'}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/disposition?tag=${isoDate(event.date)}`}>
                        {weekdayDE(event.date).slice(0, 2)}. {formatDateDE(event.date)}
                      </Link>
                      {eilt && <span className="marke marke-rot" style={{ marginLeft: 5 }}>eilt</span>}
                    </td>
                    <td>
                      <Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link>
                      {event.venue && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{event.venue}</span>}
                    </td>
                    <td>{position.title}</td>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                      {position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'}
                    </td>
                    <td className="zahl">{position.requiredCount}</td>
                    <td className="zahl">
                      {angefragt > 0
                        ? <span className="marke marke-gelb">{angefragt} ohne Antwort</span>
                        : <span style={{ color: 'var(--text-3)' }}>niemand</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {event.operationLead ? `${event.operationLead.firstName} ${event.operationLead.lastName}` : '–'}
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

import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { employeeFilter, eventFilter } from '@/lib/queries/scope';
import { formatDateDE, toDateOnly, weekdayDE } from '@/lib/time';
import { ASSIGNMENT_STATUS, label } from '@/lib/status';
import { Karte, Leer, StatusMarke } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Einsätze' };

/** Reiter „Einsätze" der Mitarbeiterakte (SecPlan 5). */
export default async function AkteEinsaetze({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('employees.view');
  const { id } = await params;
  const heute = toDateOnly(new Date());

  // Auch hier gilt die Sichtbarkeit: eine Teamleitung sieht in der Akte
  // nur die Einsätze, die sie ohnehin sehen darf.
  const sichtbar = await db.employee.count({ where: { id, ...employeeFilter(user) } });
  if (sichtbar === 0) return <Karte><Leer>Dieser Datensatz ist für Ihre Rolle nicht sichtbar.</Leer></Karte>;

  const einsaetze = await db.assignment.findMany({
    where: { employeeId: id, deletedAt: null, event: eventFilter(user) },
    select: {
      id: true, status: true, isReserve: true, roleInTeam: true,
      plannedStart: true, plannedEnd: true, noteForEmployee: true,
      event: { select: { id: true, name: true, date: true, venue: true, reference: true } },
      position: { select: { title: true } },
    },
    orderBy: { event: { date: 'desc' } },
    take: 200,
  });

  const kommend = einsaetze.filter((a) => a.event.date >= heute);
  const vergangen = einsaetze.filter((a) => a.event.date < heute);

  function tabelle(liste: typeof einsaetze, leer: string) {
    if (liste.length === 0) return <Leer>{leer}</Leer>;
    return (
      <div className="tabelle-scroll">
        <table className="tabelle">
          <thead>
            <tr><th>Datum</th><th>Einsatz</th><th>Position</th><th>Funktion</th><th>Zeit</th><th>Status</th></tr>
          </thead>
          <tbody>
            {liste.map((a) => (
              <tr key={a.id}>
                <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                  {weekdayDE(a.event.date).slice(0, 2)}. {formatDateDE(a.event.date)}
                </td>
                <td>
                  <Link href={`/events/${a.event.id}`}>{a.event.name}</Link>
                  {a.event.venue && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-3)' }}>{a.event.venue}</span>}
                </td>
                <td style={{ color: 'var(--text-2)' }}>{a.position.title}</td>
                <td style={{ fontSize: 12 }}>
                  {a.roleInTeam === 'MITARBEITER' ? '–' : <span className="marke marke-beige">{a.roleInTeam.toLowerCase()}</span>}
                  {a.isReserve && <span className="marke marke-grau" style={{ marginLeft: 4 }}>Ersatz</span>}
                </td>
                <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{a.plannedStart ?? '–'}–{a.plannedEnd ?? '–'}</td>
                <td><StatusMarke status={label(ASSIGNMENT_STATUS, a.status)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Karte titel={`Kommende Einsätze (${kommend.length})`}>
        {tabelle(kommend, 'Für diese Person ist nichts geplant.')}
      </Karte>
      <Karte titel={`Bisherige Einsätze (${vergangen.length})`}>
        {tabelle(vergangen, 'Noch keine Einsätze.')}
      </Karte>
    </div>
  );
}

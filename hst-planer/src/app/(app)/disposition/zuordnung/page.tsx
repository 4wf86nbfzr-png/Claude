import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { employeeFilter, eventFilter } from '@/lib/queries/scope';
import { formatDateDE, isoDate, shiftDuration, toDateOnly, weekdayDE } from '@/lib/time';
import { ASSIGNMENT_STATUS } from '@/lib/status';
import { Hinweis, Karte, Leer, Seitenkopf } from '@/components/ui';
import { Filterleiste } from '@/components/filter';

export const metadata: Metadata = { title: 'Mitarbeiterzuordnung' };
export const dynamic = 'force-dynamic';

/**
 * Mitarbeiterzuordnung (SecPlan 2, Bereich DISPOSITION).
 *
 * Die Leitstelle fragt „wer besetzt diese Schicht?". Diese Seite fragt
 * andersherum: „wo steht diese Person in der Woche, und wo passt sie
 * noch hin?". Beides braucht man – je nachdem, ob eine Lücke oder eine
 * Person der Anlass ist.
 */
export default async function Mitarbeiterzuordnung({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('dispo.view');
  const params = await searchParams;
  const darfPlanen = can(user.role, 'dispo.assign');

  const von = params.von && /^\d{4}-\d{2}-\d{2}$/.test(params.von)
    ? new Date(`${params.von}T00:00:00Z`)
    : toDateOnly(new Date());
  const bis = new Date(von.getTime() + 6 * 86400000);
  const tage = Array.from({ length: 7 }, (_, i) => new Date(von.getTime() + i * 86400000));

  const where = { ...employeeFilter(user), active: true };
  if (params.q) {
    where.OR = [
      { firstName: { contains: params.q, mode: 'insensitive' as const } },
      { lastName: { contains: params.q, mode: 'insensitive' as const } },
      { personnelNo: { contains: params.q, mode: 'insensitive' as const } },
    ];
  }
  if (params.qualifikation) where.qualifications = { some: { qualificationId: params.qualifikation } };

  const [mitarbeiter, qualifikationen, gewaehlt] = await Promise.all([
    db.employee.findMany({
      where,
      select: {
        id: true, firstName: true, lastName: true, personnelNo: true, blocked: true,
        qualifications: { select: { qualification: { select: { code: true } } } },
        availabilities: { where: { from: { lte: bis }, to: { gte: von } }, select: { kind: true, from: true, to: true } },
        assignments: {
          where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { ...eventFilter(user), date: { gte: von, lte: bis } } },
          select: {
            id: true, status: true, plannedStart: true, plannedEnd: true,
            position: { select: { title: true, startTime: true, endTime: true } },
            event: { select: { id: true, name: true, date: true, startTime: true, endTime: true } },
          },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 120,
    }),
    db.qualification.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    params.person
      ? db.employee.findFirst({
          where: { id: params.person, ...employeeFilter(user) },
          select: { id: true, firstName: true, lastName: true, qualifications: { select: { qualificationId: true, qualification: { select: { name: true } } } } },
        })
      : null,
  ]);

  // Für die gewählte Person: offene Positionen der Woche, die zu ihren
  // Nachweisen passen. Ohne Auswahl wird das nicht geladen.
  const passende = gewaehlt
    ? (await db.position.findMany({
        where: {
          event: { ...eventFilter(user), date: { gte: von, lte: bis }, status: { notIn: ['STORNIERT', 'ABGESCHLOSSEN', 'ABGERECHNET'] } },
          requirements: { every: { qualificationId: { in: gewaehlt.qualifications.map((q) => q.qualificationId) } } },
        },
        select: {
          id: true, title: true, requiredCount: true, startTime: true, endTime: true,
          event: { select: { id: true, name: true, date: true, startTime: true, endTime: true } },
          assignments: { where: { deletedAt: null }, select: { status: true, isReserve: true, employeeId: true } },
        },
        orderBy: { event: { date: 'asc' } },
        take: 60,
      })).filter((p) => {
        const besetzt = p.assignments.filter((a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'].includes(a.status)).length;
        return besetzt < p.requiredCount && !p.assignments.some((a) => a.employeeId === gewaehlt.id);
      })
    : [];

  function stunden(person: (typeof mitarbeiter)[number]): number {
    return person.assignments.reduce((summe, a) => {
      const start = a.plannedStart ?? a.position.startTime ?? a.event.startTime;
      const ende = a.plannedEnd ?? a.position.endTime ?? a.event.endTime;
      return summe + (start && ende ? (shiftDuration(start, ende)?.grossMinutes ?? 0) : 0);
    }, 0) / 60;
  }

  const vorwoche = new Date(von.getTime() - 7 * 86400000);
  const nachwoche = new Date(von.getTime() + 7 * 86400000);

  return (
    <>
      <Seitenkopf
        titel="Mitarbeiterzuordnung"
        unter={`Woche ${formatDateDE(von)} bis ${formatDateDE(bis)}`}
        aktionen={
          <>
            <Link href={`/disposition/zuordnung?von=${isoDate(vorwoche)}`} className="knopf knopf-klein">← Vorwoche</Link>
            <Link href="/disposition/zuordnung" className="knopf knopf-klein">Diese Woche</Link>
            <Link href={`/disposition/zuordnung?von=${isoDate(nachwoche)}`} className="knopf knopf-klein">Folgewoche →</Link>
          </>
        }
      />

      <Karte>
        <Filterleiste
          platzhalter="Name oder Personalnummer …"
          felder={[{ name: 'qualifikation', label: 'Qualifikation', optionen: qualifikationen.map((q) => ({ wert: q.id, label: q.name })) }]}
        />

        {mitarbeiter.length === 0 ? (
          <Leer>Keine Kraft passt zu dieser Suche.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Mitarbeiter</th>
                  {tage.map((tag) => (
                    <th key={isoDate(tag)} style={{ textAlign: 'center', minWidth: 78 }}>
                      {weekdayDE(tag).slice(0, 2)}. {tag.getUTCDate()}.
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Woche</th>
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((person) => {
                  const h = stunden(person);
                  return (
                    <tr key={person.id} className={person.id === params.person ? 'zeile-beige' : person.blocked ? 'zeile-rot' : undefined}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <Link href={`/disposition/zuordnung?von=${isoDate(von)}&person=${person.id}`} style={{ fontWeight: 500 }}>
                          {person.lastName}, {person.firstName}
                        </Link>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-3)' }}>
                          {person.qualifications.map((q) => q.qualification.code).join(' · ') || 'ohne Nachweis'}
                        </span>
                      </td>
                      {tage.map((tag) => {
                        const amTag = person.assignments.filter((a) => a.event.date.getTime() === tag.getTime());
                        const abwesend = person.availabilities.find(
                          (v) => ['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'].includes(v.kind) && v.from <= tag && v.to >= tag,
                        );
                        return (
                          <td key={isoDate(tag)} style={{ textAlign: 'center', fontSize: 11 }}>
                            {amTag.length > 0 ? (
                              amTag.map((a) => (
                                <Link key={a.id} href={`/events/${a.event.id}/mitarbeiter`}
                                      className={`marke marke-${ASSIGNMENT_STATUS[a.status]?.farbe ?? 'grau'}`}
                                      title={`${a.event.name} · ${a.position.title}`}>
                                  {(a.plannedStart ?? a.position.startTime ?? a.event.startTime ?? '–').slice(0, 5)}
                                </Link>
                              ))
                            ) : abwesend ? (
                              <span className="marke marke-gelb">{abwesend.kind.slice(0, 1)}</span>
                            ) : (
                              <span style={{ color: 'var(--text-3)' }}>·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="zahl" style={{ textAlign: 'right' }}>
                        {h > 0 ? `${h.toFixed(1).replace('.', ',')} h` : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      {gewaehlt && (
        <div style={{ marginTop: 16 }}>
          <h2 className="abschnitt">Passende offene Positionen für {gewaehlt.firstName} {gewaehlt.lastName}</h2>
          <Karte>
            {passende.length === 0 ? (
              <Leer>
                In dieser Woche gibt es keine offene Position, deren Anforderungen durch die
                vorhandenen Nachweise gedeckt sind.
              </Leer>
            ) : (
              <>
                <div style={{ padding: '8px 12px' }}>
                  <Hinweis art="info">
                    Diese Liste zeigt nur Positionen, deren Anforderungen durch die Nachweise
                    dieser Person gedeckt sind. Überschneidungen und Abwesenheiten werden erst
                    beim Zuordnen geprüft.
                  </Hinweis>
                </div>
                <div className="tabelle-scroll">
                  <table className="tabelle">
                    <thead>
                      <tr><th>Datum</th><th>Einsatz</th><th>Position</th><th>Zeit</th>{darfPlanen && <th style={{ width: 1 }} />}</tr>
                    </thead>
                    <tbody>
                      {passende.map((p) => (
                        <tr key={p.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{weekdayDE(p.event.date).slice(0, 2)}. {formatDateDE(p.event.date)}</td>
                          <td><Link href={`/events/${p.event.id}`}>{p.event.name}</Link></td>
                          <td>{p.title}</td>
                          <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                            {p.startTime ?? p.event.startTime ?? '–'}–{p.endTime ?? p.event.endTime ?? '–'}
                          </td>
                          {darfPlanen && (
                            <td>
                              <Link href={`/events/${p.event.id}/mitarbeiter?position=${p.id}&q=${encodeURIComponent(gewaehlt.lastName)}`}
                                    className="knopf knopf-klein knopf-primaer">
                                Zuordnen
                              </Link>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Karte>
        </div>
      )}
    </>
  );
}

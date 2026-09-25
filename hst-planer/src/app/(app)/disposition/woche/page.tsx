import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { besetzungAus } from '@/lib/queries/coverage';
import { formatDateDE, isoDate, toDateOnly, weekdayDE } from '@/lib/time';
import { ASSIGNMENT_STATUS, EVENT_STATUS, PRIORITY, label } from '@/lib/status';
import { Balken, Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Zeitraumwahl } from '../zeitraumwahl';

export const metadata: Metadata = { title: "Wochenplanung" };
export const dynamic = 'force-dynamic';

/**
 * Die Disposition ist die Arbeitsflaeche des Disponenten (Spec 8/45/59).
 *
 * Aufbau: links der Zeitraum mit allen Einsätzen, je Event die Positionen
 * mit Besetzungsgrad und den bereits eingeteilten Kraeften; rechts die
 * Punkte, die heute Aufmerksamkeit brauchen. Von jeder Lücke führt genau
 * ein Klick zur Personalsuche.
 */
export default async function Wochenplanung({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('dispo.view');
  const params = await searchParams;
  const darfPlanen = can(user.role, 'dispo.edit');

  const von = params.von && /^\d{4}-\d{2}-\d{2}$/.test(params.von) ? new Date(`${params.von}T00:00:00Z`) : toDateOnly(new Date());
  const tage = Math.min(31, Math.max(1, Number(params.tage ?? 7)));
  const bis = new Date(von.getTime() + (tage - 1) * 86400000);

  const events = await db.event.findMany({
    where: {
      ...eventFilter(user),
      date: { gte: von, lte: bis },
      status: { notIn: ['ABGERECHNET'] },
      ...(params.event ? { id: params.event } : {}),
      ...(params.kunde ? { customerId: params.kunde } : {}),
      ...(params.nur === 'lücken' ? {} : {}),
    },
    include: {
      customer: { select: { id: true, name: true } },
      serviceType: { select: { name: true, color: true } },
      operationLead: { select: { firstName: true, lastName: true, mobile: true } },
      positions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          requirements: { include: { qualification: { select: { name: true } } } },
          assignments: {
            where: { deletedAt: null },
            include: { employee: { select: { id: true, firstName: true, lastName: true, mobile: true } } },
            orderBy: [{ isReserve: 'asc' }, { createdAt: 'asc' }],
          },
        },
      },
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  const gefiltert = params.nur === 'lücken'
    ? events.filter((event) => besetzungAus(event.positions).offen > 0)
    : events;

  const gesamt = gefiltert.reduce(
    (acc, event) => {
      const b = besetzungAus(event.positions);
      return { soll: acc.soll + b.soll, ist: acc.ist + b.ist, offen: acc.offen + b.offen, bestaetigt: acc.bestaetigt + b.bestaetigt };
    },
    { soll: 0, ist: 0, offen: 0, bestaetigt: 0 },
  );

  const absagen = gefiltert.flatMap((event) =>
    event.positions.flatMap((position) =>
      position.assignments
        .filter((a) => a.status === 'ABGESAGT')
        .map((a) => ({ event, position, assignment: a })),
    ),
  );

  const nachTag = new Map<string, typeof gefiltert>();
  for (const event of gefiltert) {
    const schluessel = isoDate(event.date);
    const liste = nachTag.get(schluessel);
    if (liste) liste.push(event);
    else nachTag.set(schluessel, [event]);
  }

  return (
    <>
      <Seitenkopf
        titel="Wochenplanung"
        unter={`${formatDateDE(von)} bis ${formatDateDE(bis)} · ${gefiltert.length} Einsätze`}
        aktionen={darfPlanen && (
          <>
            <Link href={`/events/neu?datum=${isoDate(von)}`} className="knopf knopf-primaer"><Icon name="plus" /> Neues Event</Link>
            <Link href="/kalender" className="knopf"><Icon name="calendar" /> Kalender</Link>
          </>
        )}
      />

      <Zeitraumwahl von={isoDate(von)} tage={tage} nurLuecken={params.nur === 'lücken'} />

      <div style={{ marginTop: 14 }}>
        <Raster min={150}>
          <Kennzahl wert={gesamt.soll} label="Benötigte Kräfte" />
          <Kennzahl wert={gesamt.ist} label="Eingeplant" farbe={gesamt.offen === 0 ? 'gruen' : 'grau'} />
          <Kennzahl wert={gesamt.bestaetigt} label="Zugesagt" farbe={gesamt.bestaetigt < gesamt.ist ? 'gelb' : 'gruen'} />
          <Kennzahl wert={gesamt.offen} label="Offen" farbe={gesamt.offen > 0 ? 'rot' : 'gruen'} />
          <Kennzahl wert={absagen.length} label="Absagen im Zeitraum" farbe={absagen.length > 0 ? 'rot' : 'grau'} />
        </Raster>
      </div>

      {absagen.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Hinweis art="warnung">
            <strong>Absagen, die Ersatz brauchen:</strong>{' '}
            {absagen.slice(0, 6).map(({ event, assignment }, index) => (
              <span key={assignment.id}>
                {index > 0 && ' · '}
                <Link href={`/events/${event.id}/mitarbeiter`}>
                  {assignment.employee.firstName} {assignment.employee.lastName} ({event.name})
                </Link>
              </span>
            ))}
            {absagen.length > 6 && ` und ${absagen.length - 6} weitere`}
          </Hinweis>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 16 }}>
        {gefiltert.length === 0 && (
          <Karte><Leer>In diesem Zeitraum gibt es keine Einsaetze{params.nur === 'lücken' ? ' mit offenen Positionen' : ''}.</Leer></Karte>
        )}

        {[...nachTag.entries()].map(([tag, tagesEvents]) => (
          <section key={tag}>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-3)', margin: '0 0 8px' }}>
              {weekdayDE(new Date(`${tag}T00:00:00Z`))}, {formatDateDE(new Date(`${tag}T00:00:00Z`))}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tagesEvents.map((event) => {
                const b = besetzungAus(event.positions);
                return (
                  <Karte key={event.id}
                         titel={
                           <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                             <Link href={`/events/${event.id}`} style={{ fontWeight: 600 }}>{event.name}</Link>
                             <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-2)' }}>
                               {event.startTime ?? '–'}–{event.endTime ?? '–'}
                               {event.venue ? ` · ${event.venue}` : ''}
                               {event.customer ? ` · ${event.customer.name}` : ''}
                             </span>
                             <StatusMarke status={label(EVENT_STATUS, event.status)} />
                             {event.priority !== 'NORMAL' && <StatusMarke status={label(PRIORITY, event.priority)} />}
                             <Balken ist={b.ist} soll={b.soll} />
                           </span>
                         }
                         aktion={darfPlanen && (
                           <Link href={`/events/${event.id}/mitarbeiter`} className="knopf knopf-klein knopf-primaer">
                             {b.offen > 0 ? `${b.offen} Lücken schließen` : 'Team bearbeiten'}
                           </Link>
                         )}>
                    {event.positions.length === 0 ? (
                      <Leer>
                        Keine Positionen angelegt.{' '}
                        {darfPlanen && <Link href={`/events/${event.id}/positionen`}>Jetzt anlegen</Link>}
                      </Leer>
                    ) : (
                      <div className="tabelle-scroll">
                        <table className="tabelle">
                          <thead>
                            <tr><th>Position</th><th>Zeit</th><th>Soll/Ist</th><th>Team</th><th>Anforderungen</th>{darfPlanen && <th style={{ width: 1 }} />}</tr>
                          </thead>
                          <tbody>
                            {event.positions.map((position) => {
                              const aktive = position.assignments.filter((a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'].includes(a.status));
                              const offen = Math.max(0, position.requiredCount - aktive.length);
                              return (
                                <tr key={position.id} className={offen > 0 ? (aktive.length === 0 ? 'zeile-rot' : 'zeile-gelb') : 'zeile-gruen'}>
                                  <td style={{ fontWeight: 500 }}>{position.title}</td>
                                  <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                                    {position.startTime ?? event.startTime ?? '–'}–{position.endTime ?? event.endTime ?? '–'}
                                  </td>
                                  <td className="zahl">
                                    {aktive.length}/{position.requiredCount}
                                    {offen > 0 && <span className="marke marke-gelb" style={{ marginLeft: 6 }}>{offen} offen</span>}
                                  </td>
                                  <td style={{ fontSize: 12 }}>
                                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                      {position.assignments.length === 0 && <span style={{ color: 'var(--text-3)' }}>–</span>}
                                      {position.assignments.map((a) => {
                                        const farbe = ASSIGNMENT_STATUS[a.status]?.farbe ?? 'grau';
                                        return (
                                          <Link key={a.id} href={`/mitarbeiter/${a.employee.id}`} className={`marke marke-${farbe}`}
                                                title={`${ASSIGNMENT_STATUS[a.status]?.label ?? a.status}${a.isReserve ? ' · Ersatz' : ''}`}>
                                            {a.employee.firstName} {a.employee.lastName.charAt(0)}.
                                            {a.isReserve ? ' (E)' : ''}
                                          </Link>
                                        );
                                      })}
                                    </span>
                                  </td>
                                  <td style={{ fontSize: 11, color: 'var(--text-2)' }}>
                                    {position.requirements.map((r) => r.qualification.name).join(', ') || '–'}
                                  </td>
                                  {darfPlanen && (
                                    <td>
                                      <Link href={`/events/${event.id}/mitarbeiter?position=${position.id}`} className="knopf knopf-klein">
                                        Personal suchen
                                      </Link>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {(event.meetingPoint || event.dressCode || event.operationLead) && (
                      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--linie)', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-2)' }}>
                        {event.operationLead && <span><Icon name="shield" size={13} /> Einsatzleitung: {event.operationLead.firstName} {event.operationLead.lastName}</span>}
                        {event.meetingPoint && <span><Icon name="pin" size={13} /> {event.meetingPoint}{event.meetingTime ? ` um ${event.meetingTime}` : ''}</span>}
                        {event.dressCode && <span>Dresscode: {event.dressCode}</span>}
                      </div>
                    )}
                  </Karte>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { besetzungAus, EVENT_MIT_BESETZUNG } from '@/lib/queries/coverage';
import { formatDateDE, isoDate, toDateOnly, weekdayDE } from '@/lib/time';
import { EVENT_STATUS, label } from '@/lib/status';
import { Karte, Leer, Seitenkopf, StatusMarke, Balken } from '@/components/ui';
import { Icon } from '@/components/icons';
import { Kalendersteuerung } from './steuerung';

export const metadata: Metadata = { title: 'Kalender' };
export const dynamic = 'force-dynamic';

type Ansicht = 'tag' | 'woche' | 'monat';

export default async function Kalender({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('calendar.view');
  const params = await searchParams;
  const ansicht: Ansicht = params.ansicht === 'tag' || params.ansicht === 'monat' ? params.ansicht : 'woche';
  const anker = params.datum && /^\d{4}-\d{2}-\d{2}$/.test(params.datum) ? new Date(`${params.datum}T00:00:00Z`) : toDateOnly(new Date());

  const { von, bis } = fenster(ansicht, anker);

  const where: Prisma.EventWhereInput = { ...eventFilter(user), date: { gte: von, lte: bis } };
  if (params.kunde) where.customerId = params.kunde;
  if (params.bereich) where.serviceTypeId = params.bereich;
  if (params.status) where.status = params.status as Prisma.EventWhereInput['status'];
  if (params.mitarbeiter) where.assignments = { some: { employeeId: params.mitarbeiter, deletedAt: null } };

  const [events, kunden, bereiche, mitarbeiter] = await Promise.all([
    db.event.findMany({
      where,
      select: {
        id: true, name: true, date: true, startTime: true, endTime: true, status: true,
        venue: true, city: true,
        customer: { select: { name: true } },
        serviceType: { select: { name: true, color: true } },
        ...EVENT_MIT_BESETZUNG,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    db.customer.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.serviceType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    can(user.role, 'employees.view')
      ? db.employee.findMany({ where: { deletedAt: null, active: true }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } })
      : Promise.resolve([]),
  ]);

  const nachTag = new Map<string, typeof events>();
  for (const event of events) {
    const schluessel = isoDate(event.date);
    const liste = nachTag.get(schluessel);
    if (liste) liste.push(event);
    else nachTag.set(schluessel, [event]);
  }

  const tage: Date[] = [];
  for (let zeit = von.getTime(); zeit <= bis.getTime(); zeit += 86400000) tage.push(new Date(zeit));

  return (
    <>
      <Seitenkopf
        titel="Kalender"
        unter={`${formatDateDE(von)} – ${formatDateDE(bis)} · ${events.length} Einsätze`}
        aktionen={can(user.role, 'events.edit') && (
          <Link href={`/events/neu?datum=${isoDate(anker)}`} className="knopf knopf-primaer"><Icon name="plus" /> Neues Event</Link>
        )}
      />

      <Kalendersteuerung
        ansicht={ansicht}
        datum={isoDate(anker)}
        kunden={kunden}
        bereiche={bereiche}
        mitarbeiter={mitarbeiter.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }))}
      />

      <div style={{ marginTop: 14 }}>
        {ansicht === 'monat' ? (
          <Monatsraster tage={tage} nachTag={nachTag} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tage.map((tag) => {
              const schluessel = isoDate(tag);
              const tagesEvents = nachTag.get(schluessel) ?? [];
              const istHeute = schluessel === isoDate(new Date());
              return (
                <Karte key={schluessel}
                       titel={
                         <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                           <span>{weekdayDE(tag)}, {formatDateDE(tag)}</span>
                           {istHeute && <span className="marke marke-blau">heute</span>}
                           <span style={{ fontWeight: 400, color: 'var(--text-gedaempft)', fontSize: 12 }}>
                             {tagesEvents.length === 0 ? 'keine Einsätze' : `${tagesEvents.length} Einsätze`}
                           </span>
                         </span>
                       }>
                  {tagesEvents.length === 0 ? <Leer>Frei.</Leer> : (
                    <table className="tabelle">
                      <tbody>
                        {tagesEvents.map((event) => {
                          const b = besetzungAus(event.positions);
                          return (
                            <tr key={event.id} className={b.offen > 0 ? 'zeile-gelb' : 'zeile-gruen'}>
                              <td className="zahl" style={{ whiteSpace: 'nowrap', width: 110 }}>{event.startTime ?? '–'}–{event.endTime ?? '–'}</td>
                              <td><Link href={`/events/${event.id}`} style={{ fontWeight: 500 }}>{event.name}</Link></td>
                              <td style={{ color: 'var(--text-sekundaer)' }}>{event.customer?.name ?? '–'}</td>
                              <td style={{ color: 'var(--text-sekundaer)' }}>{event.venue ?? event.city ?? '–'}</td>
                              <td><Balken ist={b.ist} soll={b.soll} /></td>
                              <td><StatusMarke status={label(EVENT_STATUS, event.status)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Karte>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Monatsraster({ tage, nachTag }: { tage: Date[]; nachTag: Map<string, Array<{ id: string; name: string; startTime: string | null; status: string; positions: Array<{ requiredCount: number; assignments: Array<{ status: string; isReserve: boolean }> }> }>> }) {
  const heute = isoDate(new Date());
  return (
    <div className="karte" style={{ padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((tag) => (
          <div key={tag} style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-gedaempft)', padding: '2px 4px' }}>{tag}</div>
        ))}
        {tage.map((tag) => {
          const schluessel = isoDate(tag);
          const tagesEvents = nachTag.get(schluessel) ?? [];
          const istHeute = schluessel === heute;
          return (
            <div key={schluessel}
                 style={{
                   minHeight: 92, padding: 6, borderRadius: 'var(--radius-s)',
                   border: `1px solid ${istHeute ? 'var(--akzent)' : 'var(--linie)'}`,
                   background: 'var(--flaeche-karte)',
                 }}>
              <div className="zahl" style={{ fontSize: 11, fontWeight: 600, color: istHeute ? 'var(--akzent)' : 'var(--text-gedaempft)', marginBottom: 4 }}>
                {tag.getUTCDate()}.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {tagesEvents.slice(0, 4).map((event) => {
                  const b = besetzungAus(event.positions);
                  const farbe = EVENT_STATUS[event.status]?.farbe ?? 'grau';
                  return (
                    <Link key={event.id} href={`/events/${event.id}`}
                          className={`marke marke-${b.offen > 0 ? 'gelb' : farbe}`}
                          style={{ display: 'block', height: 'auto', padding: '2px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'none' }}
                          title={event.name}>
                      {event.startTime ? `${event.startTime} ` : ''}{event.name}
                    </Link>
                  );
                })}
                {tagesEvents.length > 4 && (
                  <span style={{ fontSize: 10, color: 'var(--text-gedaempft)' }}>+{tagesEvents.length - 4} weitere</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Zeitfenster je Ansicht – die Woche beginnt am Montag. */
function fenster(ansicht: Ansicht, anker: Date): { von: Date; bis: Date } {
  if (ansicht === 'tag') return { von: anker, bis: anker };
  if (ansicht === 'woche') {
    const wochentag = (anker.getUTCDay() + 6) % 7;
    const von = new Date(anker.getTime() - wochentag * 86400000);
    return { von, bis: new Date(von.getTime() + 6 * 86400000) };
  }
  const ersterDesMonats = new Date(Date.UTC(anker.getUTCFullYear(), anker.getUTCMonth(), 1));
  const letzterDesMonats = new Date(Date.UTC(anker.getUTCFullYear(), anker.getUTCMonth() + 1, 0));
  const vorlauf = (ersterDesMonats.getUTCDay() + 6) % 7;
  const nachlauf = 6 - ((letzterDesMonats.getUTCDay() + 6) % 7);
  return {
    von: new Date(ersterDesMonats.getTime() - vorlauf * 86400000),
    bis: new Date(letzterDesMonats.getTime() + nachlauf * 86400000),
  };
}

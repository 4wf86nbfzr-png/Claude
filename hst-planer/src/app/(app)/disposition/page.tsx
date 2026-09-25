import type { Metadata } from 'next';
import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter, employeeFilter } from '@/lib/queries/scope';
import { formatDateDE, isoDate, toDateOnly, weekdayDE, shiftDuration } from '@/lib/time';
import { Icon } from '@/components/icons';
import { Leitstelle, type PlanGruppe, type PlanKraft } from './leitstelle';
import { zuordnenAktion } from './actions';

export const metadata: Metadata = { title: 'Tagesplanung' };
export const dynamic = 'force-dynamic';

/**
 * Tagesplanung (SecPlan 4 und 27).
 *
 * Diese Seite ist die Arbeitsfläche eines Disponenten und sieht deshalb
 * anders aus als der Rest: keine Karten, kein Seitenrand, sondern eine
 * Fläche, die vom Kopf bis zum unteren Rand reicht. Die Wochenübersicht
 * liegt unter /disposition/woche, der Monatsblick im Kalender.
 */
export default async function Tagesplanung({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('dispo.view');
  const params = await searchParams;
  const darfPlanen = can(user.role, 'dispo.assign');

  const tag = params.tag && /^\d{4}-\d{2}-\d{2}$/.test(params.tag)
    ? new Date(`${params.tag}T00:00:00Z`)
    : toDateOnly(new Date());
  const vortag = new Date(tag.getTime() - 86400000);
  const naechster = new Date(tag.getTime() + 86400000);

  const [events, kraefte] = await Promise.all([
    db.event.findMany({
      where: { ...eventFilter(user), date: tag, status: { notIn: ['ABGERECHNET', 'STORNIERT'] } },
      select: {
        id: true, name: true, venue: true, startTime: true, endTime: true,
        customer: { select: { name: true } },
        positions: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true, title: true, startTime: true, endTime: true, requiredCount: true,
            requirements: { select: { qualification: { select: { name: true } } } },
            assignments: {
              where: { deletedAt: null },
              orderBy: [{ isReserve: 'asc' }, { createdAt: 'asc' }],
              select: {
                id: true, status: true, isReserve: true, plannedStart: true, plannedEnd: true,
                employee: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { name: 'asc' }],
    }),
    db.employee.findMany({
      where: { ...employeeFilter(user), active: true },
      select: {
        id: true, firstName: true, lastName: true, blocked: true, blockReason: true,
        qualifications: { select: { expiresAt: true, qualification: { select: { code: true } } } },
        availabilities: {
          where: { from: { lte: tag }, to: { gte: tag } },
          select: { kind: true, note: true },
        },
        assignments: {
          where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] }, event: { date: tag } },
          select: { plannedStart: true, plannedEnd: true, position: { select: { startTime: true, endTime: true } }, event: { select: { startTime: true, endTime: true } } },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 400,
    }),
  ]);

  const gruppen: PlanGruppe[] = events.map((event) => ({
    eventId: event.id,
    name: event.name,
    ort: event.venue,
    kunde: event.customer?.name ?? null,
    zeilen: event.positions.map((position) => {
      const aktive = position.assignments.filter(
        (a) => !a.isReserve && ['EINGETEILT', 'ZUGESAGT', 'ANGEFRAGT', 'ERSCHIENEN'].includes(a.status),
      );
      return {
        positionId: position.id,
        titel: position.title,
        start: position.startTime ?? event.startTime,
        ende: position.endTime ?? event.endTime,
        soll: position.requiredCount,
        ist: aktive.length,
        anforderungen: position.requirements.map((r) => r.qualification.name),
        balken: position.assignments.map((a) => ({
          id: a.id,
          name: `${a.employee.firstName} ${a.employee.lastName}`,
          start: a.plannedStart ?? position.startTime ?? event.startTime,
          ende: a.plannedEnd ?? position.endTime ?? event.endTime,
          status: a.status,
          ersatz: a.isReserve,
          mitarbeiterId: a.employee.id,
        })),
      };
    }),
  }));

  const heute = new Date();
  const planKraefte: PlanKraft[] = kraefte.map((person) => {
    const abwesend = person.availabilities.find((a) => ['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'].includes(a.kind));
    const verplant = person.assignments.reduce((summe, a) => {
      const start = a.plannedStart ?? a.position.startTime ?? a.event.startTime;
      const ende = a.plannedEnd ?? a.position.endTime ?? a.event.endTime;
      return summe + (start && ende ? (shiftDuration(start, ende)?.grossMinutes ?? 0) : 0);
    }, 0);

    const zustand: PlanKraft['zustand'] = person.blocked
      ? 'gesperrt'
      : abwesend ? 'abwesend'
      : person.assignments.length > 0 ? 'eingeplant'
      : 'frei';

    return {
      id: person.id,
      name: `${person.lastName}, ${person.firstName}`,
      kuerzel: `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase(),
      qualifikationen: person.qualifications
        .filter((q) => !q.expiresAt || q.expiresAt >= heute)
        .map((q) => q.qualification.code)
        .slice(0, 5),
      zustand,
      hinweis: person.blocked
        ? `Sperrvermerk: ${person.blockReason ?? 'ohne Angabe'}`
        : abwesend ? `${abwesend.kind.toLowerCase()}${abwesend.note ? `: ${abwesend.note}` : ''}` : null,
      verplant,
    };
  });

  const offen = gruppen.reduce((s, g) => s + g.zeilen.reduce((t, z) => t + Math.max(0, z.soll - z.ist), 0), 0);
  const geplant = gruppen.reduce((s, g) => s + g.zeilen.reduce((t, z) => t + z.ist, 0), 0);

  return (
    <div className="leitstelle">
      <div className="leitstelle-kopf nicht-drucken">
        <Link href={`/disposition?tag=${isoDate(vortag)}`} className="knopf knopf-klein" aria-label="Vortag">
          <Icon name="chevron-left" size={13} />
        </Link>
        <strong style={{ fontSize: 13, minWidth: 190 }}>
          {weekdayDE(tag)}, {formatDateDE(tag)}
        </strong>
        <Link href={`/disposition?tag=${isoDate(naechster)}`} className="knopf knopf-klein" aria-label="Folgetag">
          <Icon name="chevron-right" size={13} />
        </Link>
        <Link href="/disposition" className="knopf knopf-klein">Heute</Link>

        <span className="werkzeuge-trenner" aria-hidden />

        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
          {gruppen.length} {gruppen.length === 1 ? 'Einsatz' : 'Einsätze'} · {geplant} eingeplant
          {offen > 0 && <> · <strong style={{ color: 'var(--rot)' }}>{offen} offen</strong></>}
        </span>

        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Link href="/disposition/woche" className="knopf knopf-klein">Woche</Link>
          <Link href="/kalender" className="knopf knopf-klein">Kalender</Link>
          {can(user.role, 'dispo.edit') && (
            <Link href={`/events/neu?datum=${isoDate(tag)}`} className="knopf knopf-klein knopf-primaer">
              <Icon name="plus" size={13} /> Einsatz
            </Link>
          )}
        </span>
      </div>

      <Leitstelle
        gruppen={gruppen}
        kraefte={planKraefte}
        darfPlanen={darfPlanen}
        zuordnen={zuordnenAktion}
        tagIso={isoDate(tag)}
      />
    </div>
  );
}

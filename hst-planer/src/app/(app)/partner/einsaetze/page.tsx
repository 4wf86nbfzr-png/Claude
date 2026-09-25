import Link from 'next/link';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { pagination } from '@/lib/api';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, formatHours, toDateOnly, weekdayDE } from '@/lib/time';
import { ASSIGNMENT_STATUS, label } from '@/lib/status';
import { Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';
import { Filterleiste } from '@/components/filter';
import { Blaettern } from '@/components/blaettern';

export const metadata: Metadata = { title: 'Partner-Einsätze' };
export const dynamic = 'force-dynamic';

/**
 * Partner-Einsätze (SecPlan 2, Bereich PARTNER).
 *
 * Welche Schicht wurde von wem zugekauft? Grundlage für die Abrechnung
 * mit dem Partner und für die Frage, wie abhängig ein Einsatz von einem
 * einzelnen Unternehmen ist.
 */
export default async function PartnerEinsaetze({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('partners.view');
  const params = await searchParams;
  const { page, perPage, skip } = pagination(params, 40);
  const heute = toDateOnly(new Date());

  const where: Prisma.AssignmentWhereInput = {
    deletedAt: null,
    partnerId: { not: null },
    event: eventFilter(user),
  };
  if (user.scope === 'PARTNER') where.partnerId = user.partnerId ?? '__kein_partner__';
  else if (params.partner) where.partnerId = params.partner;
  if (params.status) where.status = params.status as Prisma.AssignmentWhereInput['status'];
  if (params.zeitraum === 'kommend') where.event = { ...eventFilter(user), date: { gte: heute } };
  else if (params.zeitraum === 'vergangen') where.event = { ...eventFilter(user), date: { lt: heute } };

  const [zuordnungen, gesamt, partner, minuten] = await Promise.all([
    db.assignment.findMany({
      where,
      select: {
        id: true, status: true, isReserve: true, plannedStart: true, plannedEnd: true,
        employee: { select: { id: true, firstName: true, lastName: true } },
        partner: { select: { id: true, name: true } },
        position: { select: { title: true } },
        event: { select: { id: true, name: true, date: true, venue: true, customer: { select: { name: true } } } },
      },
      orderBy: { event: { date: 'desc' } },
      skip, take: perPage,
    }),
    db.assignment.count({ where }),
    db.partner.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.timeEntry.aggregate({
      where: { deletedAt: null, employee: { partnerId: { not: null } } },
      _sum: { minutes: true },
    }),
  ]);

  const kommend = zuordnungen.filter((z) => z.event.date >= heute).length;

  return (
    <>
      <Seitenkopf titel="Partner-Einsätze" unter={`${gesamt.toLocaleString('de-DE')} Zuordnungen von Partnerkräften`} />

      <Raster min={160}>
        <Kennzahl wert={gesamt} label="Zuordnungen im Filter" />
        <Kennzahl wert={kommend} label="Kommend (auf dieser Seite)" />
        <Kennzahl wert={new Set(zuordnungen.map((z) => z.partner?.id)).size} label="Beteiligte Unternehmen" />
        <Kennzahl wert={formatHours(minuten._sum.minutes ?? 0)} label="Stunden von Partnerkräften" />
      </Raster>

      <div style={{ marginTop: 12 }}>
        <Karte>
          <Filterleiste
            platzhalter="Suche …"
            felder={[
              ...(user.scope === 'PARTNER' ? [] : [{ name: 'partner', label: 'Unternehmen', optionen: partner.map((p) => ({ wert: p.id, label: p.name })) }]),
              { name: 'zeitraum', label: 'Zeitraum', optionen: [{ wert: 'kommend', label: 'kommend' }, { wert: 'vergangen', label: 'vergangen' }] },
              { name: 'status', label: 'Status', optionen: Object.entries(ASSIGNMENT_STATUS).map(([wert, s]) => ({ wert, label: s.label })) },
            ]}
          />

          {zuordnungen.length === 0 ? (
            <Leer>Es ist keine Partnerkraft zugeordnet.</Leer>
          ) : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr><th>Datum</th><th>Einsatz</th><th>Kunde</th><th>Position</th><th>Kraft</th><th>Unternehmen</th><th>Zeit</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {zuordnungen.map((z) => (
                    <tr key={z.id} className={z.event.date >= heute ? 'zeile-blau' : undefined}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {weekdayDE(z.event.date).slice(0, 2)}. {formatDateDE(z.event.date)}
                      </td>
                      <td><Link href={`/events/${z.event.id}`}>{z.event.name}</Link></td>
                      <td style={{ color: 'var(--text-2)' }}>{z.event.customer?.name ?? '–'}</td>
                      <td style={{ color: 'var(--text-2)' }}>{z.position.title}</td>
                      <td>
                        <Link href={`/mitarbeiter/${z.employee.id}`}>{z.employee.lastName}, {z.employee.firstName}</Link>
                        {z.isReserve && <span className="marke marke-grau" style={{ marginLeft: 4 }}>Ersatz</span>}
                      </td>
                      <td>{z.partner && <Link href={`/partner/${z.partner.id}`}>{z.partner.name}</Link>}</td>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{z.plannedStart ?? '–'}–{z.plannedEnd ?? '–'}</td>
                      <td><StatusMarke status={label(ASSIGNMENT_STATUS, z.status)} /></td>
                    </tr>
                  ))}
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

import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE, isoDate, toDateOnly, weekdayDE } from '@/lib/time';
import { AVAILABILITY_KIND, label } from '@/lib/status';
import { Karte, Leer, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Verfügbarkeiten' };
export const dynamic = 'force-dynamic';

const ABWESEND = ['NICHT_VERFUEGBAR', 'URLAUB', 'KRANK'] as const;

/**
 * Verfügbarkeiten (SecPlan 2, Bereich PERSONAL).
 *
 * Ein Raster über vier Wochen: eine Zeile je Kraft, eine Spalte je Tag.
 * Gelb ist eine Abmeldung, grün eine ausdrückliche Zusage. Was leer ist,
 * ist nicht zugesagt, sondern nur nicht abgesagt – der Unterschied ist
 * beim Planen wichtig.
 */
export default async function Verfuegbarkeiten({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await seite('availability.view');
  const params = await searchParams;

  const von = params.von && /^\d{4}-\d{2}-\d{2}$/.test(params.von)
    ? new Date(`${params.von}T00:00:00Z`)
    : toDateOnly(new Date());
  const tage = Array.from({ length: 28 }, (_, i) => new Date(von.getTime() + i * 86400000));
  const bis = tage[27]!;

  const mitarbeiter = await db.employee.findMany({
    where: { ...employeeFilter(user), active: true },
    select: {
      id: true, firstName: true, lastName: true,
      availabilities: {
        where: { from: { lte: bis }, to: { gte: von } },
        select: { id: true, kind: true, from: true, to: true, note: true },
        orderBy: { from: 'asc' },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 120,
  });

  const mitEintrag = mitarbeiter.filter((p) => p.availabilities.length > 0);
  const vorher = new Date(von.getTime() - 28 * 86400000);
  const nachher = new Date(von.getTime() + 28 * 86400000);

  return (
    <>
      <Seitenkopf
        titel="Verfügbarkeiten"
        unter={`${formatDateDE(von)} bis ${formatDateDE(bis)} · ${mitEintrag.length} von ${mitarbeiter.length} Kräften haben etwas eingetragen`}
        aktionen={
          <>
            <Link href={`/verfuegbarkeiten?von=${isoDate(vorher)}`} className="knopf knopf-klein">← Früher</Link>
            <Link href="/verfuegbarkeiten" className="knopf knopf-klein">Heute</Link>
            <Link href={`/verfuegbarkeiten?von=${isoDate(nachher)}`} className="knopf knopf-klein">Später →</Link>
          </>
        }
      />

      <Karte>
        {mitarbeiter.length === 0 ? (
          <Leer>Keine Kräfte sichtbar.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th style={{ minWidth: 170 }}>Mitarbeiter</th>
                  {tage.map((tag) => (
                    <th key={isoDate(tag)} style={{ textAlign: 'center', padding: '0 2px', fontSize: 9, minWidth: 22 }}
                        title={`${weekdayDE(tag)}, ${formatDateDE(tag)}`}>
                      {tag.getUTCDate()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map((person) => (
                  <tr key={person.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <Link href={`/mitarbeiter/${person.id}`}>{person.lastName}, {person.firstName}</Link>
                    </td>
                    {tage.map((tag) => {
                      const eintrag = person.availabilities.find((v) => v.from <= tag && v.to >= tag);
                      const farbe = !eintrag ? null
                        : ABWESEND.includes(eintrag.kind as typeof ABWESEND[number]) ? 'gelb'
                        : 'gruen';
                      return (
                        <td key={isoDate(tag)} style={{ padding: 0, textAlign: 'center' }}
                            title={eintrag ? `${AVAILABILITY_KIND[eintrag.kind]?.label ?? eintrag.kind}${eintrag.note ? `: ${eintrag.note}` : ''}` : undefined}>
                          <span style={{
                            display: 'block', width: '100%', height: 16,
                            background: farbe ? `var(--${farbe})` : 'transparent',
                            opacity: farbe ? .85 : 1,
                          }} aria-hidden />
                          <span className="nur-lesen">{eintrag ? AVAILABILITY_KIND[eintrag.kind]?.label : ''}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <h2 className="abschnitt">Eingetragene Zeiträume</h2>
      <Karte>
        {mitEintrag.length === 0 ? (
          <Leer>In diesem Zeitraum hat niemand etwas eingetragen.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Mitarbeiter</th><th>Art</th><th>Von</th><th>Bis</th><th>Notiz</th></tr></thead>
              <tbody>
                {mitEintrag.flatMap((person) =>
                  person.availabilities.map((v) => (
                    <tr key={v.id}>
                      <td><Link href={`/mitarbeiter/${person.id}`}>{person.lastName}, {person.firstName}</Link></td>
                      <td><StatusMarke status={label(AVAILABILITY_KIND, v.kind)} /></td>
                      <td className="zahl">{formatDateDE(v.from)}</td>
                      <td className="zahl">{formatDateDE(v.to)}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{v.note ?? '–'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </>
  );
}

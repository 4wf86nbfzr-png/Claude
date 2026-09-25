import Link from 'next/link';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { employeeFilter } from '@/lib/queries/scope';
import { formatDateDE, formatHours } from '@/lib/time';
import { TIME_ENTRY_STATUS, label } from '@/lib/status';
import { Karte, Kennzahl, Leer, Raster, StatusMarke } from '@/components/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Arbeitszeiten' };

/** Reiter „Arbeitszeiten" der Mitarbeiterakte (SecPlan 5). */
export default async function AkteArbeitszeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('timesheets.view');
  const { id } = await params;

  const sichtbar = await db.employee.count({ where: { id, ...employeeFilter(user) } });
  if (sichtbar === 0) return <Karte><Leer>Dieser Datensatz ist für Ihre Rolle nicht sichtbar.</Leer></Karte>;

  const jahr = new Date().getFullYear();
  const jahresbeginn = new Date(Date.UTC(jahr, 0, 1));

  const [zeiten, summeJahr, offen] = await Promise.all([
    db.timeEntry.findMany({
      where: { employeeId: id, deletedAt: null },
      select: {
        id: true, date: true, start: true, end: true, breakMinutes: true,
        minutes: true, status: true, source: true, note: true,
        event: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
      take: 120,
    }),
    db.timeEntry.aggregate({
      where: { employeeId: id, deletedAt: null, date: { gte: jahresbeginn } },
      _sum: { minutes: true }, _count: true,
    }),
    db.timeEntry.count({ where: { employeeId: id, deletedAt: null, status: 'OFFEN' } }),
  ]);

  const monat = new Map<string, number>();
  for (const eintrag of zeiten) {
    const schluessel = `${eintrag.date.getUTCFullYear()}-${String(eintrag.date.getUTCMonth() + 1).padStart(2, '0')}`;
    monat.set(schluessel, (monat.get(schluessel) ?? 0) + eintrag.minutes);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Raster min={160}>
        <Kennzahl wert={formatHours(summeJahr._sum.minutes ?? 0)} label={`Stunden ${jahr}`} />
        <Kennzahl wert={summeJahr._count} label={`Einträge ${jahr}`} />
        <Kennzahl wert={offen} label="Noch nicht freigegeben" farbe={offen > 0 ? 'gelb' : 'gruen'}
                  href="/zeiterfassung/freigaben" />
        <Kennzahl wert={zeiten.length} label="Zuletzt erfasst" />
      </Raster>

      {monat.size > 0 && (
        <Karte titel="Stunden je Monat">
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Monat</th><th style={{ textAlign: 'right' }}>Stunden</th></tr></thead>
              <tbody>
                {[...monat.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([schluessel, minuten]) => (
                  <tr key={schluessel}>
                    <td className="zahl">{schluessel.split('-').reverse().join('/')}</td>
                    <td className="zahl" style={{ textAlign: 'right' }}>{formatHours(minuten)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Karte>
      )}

      <Karte titel="Erfasste Zeiten">
        {zeiten.length === 0 ? <Leer>Für diese Person ist noch keine Zeit erfasst.</Leer> : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr><th>Datum</th><th>Einsatz</th><th>Von</th><th>Bis</th><th>Pause</th><th>Netto</th><th>Quelle</th><th>Status</th><th>Notiz</th></tr>
              </thead>
              <tbody>
                {zeiten.map((eintrag) => (
                  <tr key={eintrag.id} className={eintrag.status === 'OFFEN' ? 'zeile-gelb' : undefined}>
                    <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(eintrag.date)}</td>
                    <td>{eintrag.event ? <Link href={`/events/${eintrag.event.id}`}>{eintrag.event.name}</Link> : '–'}</td>
                    <td className="zahl">{eintrag.start ?? '–'}</td>
                    <td className="zahl">{eintrag.end ?? '–'}</td>
                    <td className="zahl">{eintrag.breakMinutes} min</td>
                    <td className="zahl" style={{ fontWeight: 600 }}>{formatHours(eintrag.minutes)}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{eintrag.source.toLowerCase()}</td>
                    <td><StatusMarke status={label(TIME_ENTRY_STATUS, eintrag.status)} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{eintrag.note ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Karte>
    </div>
  );
}

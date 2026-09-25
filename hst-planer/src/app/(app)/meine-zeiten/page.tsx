import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, formatHours } from '@/lib/time';
import { TIME_ENTRY_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Meine Stunden' };
export const dynamic = 'force-dynamic';

/**
 * Meine Stunden (eigener Bereich).
 *
 * Die eigene Zeiterfassung, ohne Umweg über die Dispositionsansicht.
 * Bewusst nur lesend: geändert wird eine erfasste Zeit von der
 * Disposition, damit die Korrektur eine Spur hinterlässt.
 */
export default async function MeineZeiten() {
  const user = await seite('self.timesheets');
  if (!user.employeeId) {
    return (
      <>
        <Seitenkopf titel="Meine Stunden" />
        <Karte><Leer>Zu Ihrem Zugang gehört kein Mitarbeiterprofil.</Leer></Karte>
      </>
    );
  }

  const jahr = new Date().getFullYear();
  const jahresbeginn = new Date(Date.UTC(jahr, 0, 1));

  const [zeiten, summe, offen] = await Promise.all([
    db.timeEntry.findMany({
      where: { employeeId: user.employeeId, deletedAt: null },
      select: {
        id: true, date: true, start: true, end: true, breakMinutes: true,
        minutes: true, status: true, note: true,
        event: { select: { id: true, name: true } },
        position: { select: { title: true } },
      },
      orderBy: { date: 'desc' },
      take: 150,
    }),
    db.timeEntry.aggregate({
      where: { employeeId: user.employeeId, deletedAt: null, date: { gte: jahresbeginn } },
      _sum: { minutes: true }, _count: true,
    }),
    db.timeEntry.count({ where: { employeeId: user.employeeId, deletedAt: null, status: 'OFFEN' } }),
  ]);

  const monate = new Map<string, number>();
  for (const eintrag of zeiten) {
    const schluessel = `${eintrag.date.getUTCFullYear()}-${String(eintrag.date.getUTCMonth() + 1).padStart(2, '0')}`;
    monate.set(schluessel, (monate.get(schluessel) ?? 0) + eintrag.minutes);
  }

  return (
    <>
      <Seitenkopf titel="Meine Stunden" unter={`Erfasste Arbeitszeiten – ${jahr}`} />

      <Raster min={160}>
        <Kennzahl wert={formatHours(summe._sum.minutes ?? 0)} label={`Stunden ${jahr}`} />
        <Kennzahl wert={summe._count} label={`Einträge ${jahr}`} />
        <Kennzahl wert={offen} label="Noch in Prüfung" farbe={offen > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          Stimmt eine Zeit nicht? Bitte bei der Disposition melden. Korrekturen werden dort
          eingetragen und bleiben nachvollziehbar – deshalb lässt sich hier nichts ändern.
        </Hinweis>
      </div>

      {monate.size > 0 && (
        <Karte titel="Stunden je Monat">
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead><tr><th>Monat</th><th style={{ textAlign: 'right' }}>Stunden</th></tr></thead>
              <tbody>
                {[...monate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([schluessel, minuten]) => (
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

      <div style={{ marginTop: 14 }}>
        <Karte titel="Einzelne Einträge">
          {zeiten.length === 0 ? (
            <Leer>Für Sie ist noch keine Zeit erfasst.</Leer>
          ) : (
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead>
                  <tr><th>Datum</th><th>Einsatz</th><th>Position</th><th>Von</th><th>Bis</th><th>Pause</th><th>Netto</th><th>Status</th><th>Notiz</th></tr>
                </thead>
                <tbody>
                  {zeiten.map((eintrag) => (
                    <tr key={eintrag.id} className={eintrag.status === 'OFFEN' ? 'zeile-gelb' : undefined}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>{formatDateDE(eintrag.date)}</td>
                      <td>{eintrag.event ? <Link href={`/meine-einsaetze`}>{eintrag.event.name}</Link> : '–'}</td>
                      <td style={{ color: 'var(--text-2)' }}>{eintrag.position?.title ?? '–'}</td>
                      <td className="zahl">{eintrag.start ?? '–'}</td>
                      <td className="zahl">{eintrag.end ?? '–'}</td>
                      <td className="zahl">{eintrag.breakMinutes} min</td>
                      <td className="zahl" style={{ fontWeight: 600 }}>{formatHours(eintrag.minutes)}</td>
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
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { formatDateDE, formatHours } from '@/lib/time';
import { TIME_ENTRY_STATUS, label } from '@/lib/status';
import { Hinweis, Karte, Kennzahl, Leer, Raster, Seitenkopf, StatusMarke } from '@/components/ui';

export const metadata: Metadata = { title: 'Korrekturen' };
export const dynamic = 'force-dynamic';

/** Zahlenwerte aus dem Protokoll lesbar machen, ohne sie zu erfinden. */
function feldwert(wert: unknown): string {
  if (wert === null || wert === undefined || wert === '') return '–';
  if (typeof wert === 'number') return String(wert);
  if (typeof wert === 'boolean') return wert ? 'ja' : 'nein';
  return String(wert);
}

/**
 * Korrekturen (SecPlan 2, Bereich ZEITERFASSUNG).
 *
 * Jede nachträgliche Änderung an einer Zeit, mit altem und neuem Wert.
 * Die Quelle ist das Audit-Log – deshalb steht hier auch, was jemand
 * gelöscht hat. Das ist der Punkt, an dem Zeiterfassung prüfbar wird:
 * eine korrigierte Stunde ohne Spur wäre wertlos.
 */
export default async function Korrekturen({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await seite('timesheets.edit');
  const params = await searchParams;

  const tage = Math.min(365, Math.max(7, Number(params.tage ?? 90)));
  const seitdem = new Date(Date.now() - tage * 86400000);

  const eintraege = await db.auditLog.findMany({
    where: {
      entity: 'TimeEntry',
      action: { in: ['timeentry.update', 'timeentry.delete', 'timeentry.approve'] },
      createdAt: { gte: seitdem },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const zeitIds = [...new Set(eintraege.map((e) => e.entityId).filter((x): x is string => Boolean(x)))];
  const zeiten = await db.timeEntry.findMany({
    where: { id: { in: zeitIds } },
    select: {
      id: true, date: true, minutes: true, status: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
      event: { select: { id: true, name: true } },
    },
  });
  const zeitVon = new Map(zeiten.map((z) => [z.id, z]));

  const geaendert = eintraege.filter((e) => e.action === 'timeentry.update');
  const geloescht = eintraege.filter((e) => e.action === 'timeentry.delete');

  return (
    <>
      <Seitenkopf
        titel="Korrekturen"
        unter={`Nachträgliche Änderungen an erfassten Zeiten, letzte ${tage} Tage`}
        aktionen={
          <span className="knopfgruppe">
            {[30, 90, 365].map((n) => (
              <Link key={n} href={`/zeiterfassung/korrekturen?tage=${n}`} className="knopf knopf-klein" aria-pressed={tage === n}>
                {n} Tage
              </Link>
            ))}
          </span>
        }
      />

      <Raster min={160}>
        <Kennzahl wert={eintraege.length} label="Vorgänge im Zeitraum" />
        <Kennzahl wert={geaendert.length} label="Geändert" farbe={geaendert.length > 0 ? 'gelb' : 'grau'} />
        <Kennzahl wert={geloescht.length} label="Entfernt" farbe={geloescht.length > 0 ? 'rot' : 'grau'} />
        <Kennzahl wert={new Set(eintraege.map((e) => e.actorLabel)).size} label="Beteiligte Personen" />
      </Raster>

      <div style={{ margin: '12px 0' }}>
        <Hinweis art="info">
          Diese Liste kommt aus dem Audit-Log und lässt sich nicht bearbeiten. Ein Eintrag bleibt
          auch dann stehen, wenn die zugehörige Zeit entfernt wurde.
        </Hinweis>
      </div>

      <Karte>
        {eintraege.length === 0 ? (
          <Leer>In diesem Zeitraum wurde keine Zeit nachträglich geändert.</Leer>
        ) : (
          <div className="tabelle-scroll">
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Zeitpunkt</th><th>Wer</th><th>Vorgang</th><th>Mitarbeiter</th>
                  <th>Einsatz</th><th>Vorher</th><th>Nachher</th><th>Status heute</th>
                </tr>
              </thead>
              <tbody>
                {eintraege.map((eintrag) => {
                  const zeit = eintrag.entityId ? zeitVon.get(eintrag.entityId) : null;
                  const vorher = eintrag.before as Record<string, unknown> | null;
                  const nachher = eintrag.after as Record<string, unknown> | null;
                  const entfernt = eintrag.action === 'timeentry.delete';
                  return (
                    <tr key={eintrag.id} className={entfernt ? 'zeile-rot' : 'zeile-gelb'}>
                      <td className="zahl" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateDE(eintrag.createdAt)} {eintrag.createdAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontSize: 12 }}>{eintrag.actorLabel}</td>
                      <td>
                        <span className={`marke marke-${entfernt ? 'rot' : eintrag.action === 'timeentry.approve' ? 'gruen' : 'gelb'}`}>
                          {entfernt ? 'entfernt' : eintrag.action === 'timeentry.approve' ? 'freigegeben' : 'geändert'}
                        </span>
                      </td>
                      <td>
                        {zeit
                          ? <Link href={`/mitarbeiter/${zeit.employee.id}/arbeitszeiten`}>{zeit.employee.lastName}, {zeit.employee.firstName}</Link>
                          : <span style={{ color: 'var(--text-3)' }}>nicht mehr vorhanden</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {zeit?.event ? <Link href={`/events/${zeit.event.id}`}>{zeit.event.name}</Link> : '–'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-2)' }}>
                        {vorher
                          ? `${feldwert(vorher.start)}–${feldwert(vorher.end)}, ${feldwert(vorher.minutes)} min`
                          : '–'}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {nachher
                          ? `${feldwert(nachher.start)}–${feldwert(nachher.end)}, ${feldwert(nachher.minutes)} min`
                          : entfernt ? 'entfernt' : '–'}
                      </td>
                      <td>
                        {zeit
                          ? <span title={formatHours(zeit.minutes)}><StatusMarke status={label(TIME_ENTRY_STATUS, zeit.status)} /></span>
                          : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Karte>

      <p style={{ marginTop: 10, fontSize: 11, color: 'var(--text-3)' }}>
        Die vollständige Spur steht im <Link href="/compliance/audit-log">Audit-Log</Link>.
        Geändert wird eine Zeit unter <Link href="/zeiterfassung">Stundenzettel</Link>.
      </p>
    </>
  );
}

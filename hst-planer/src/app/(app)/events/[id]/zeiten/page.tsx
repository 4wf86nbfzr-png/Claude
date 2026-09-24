import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDiff, formatHours, shiftMinutes } from '@/lib/time';
import { TIME_ENTRY_STATUS, label } from '@/lib/status';
import { Karte, Kennzahl, Leer, Raster, StatusMarke } from '@/components/ui';

export const metadata = { title: 'Zeiten' };
export const dynamic = 'force-dynamic';

export default async function EventZeiten({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('timesheets.view');
  const { id } = await params;

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: {
      timeEntries: {
        where: { deletedAt: null },
        include: { employee: { select: { id: true, firstName: true, lastName: true } }, position: { select: { title: true } } },
        orderBy: { start: 'asc' },
      },
      assignments: {
        where: { deletedAt: null, status: { notIn: ['ABGESAGT', 'STORNIERT'] } },
        include: { employee: { select: { id: true, firstName: true, lastName: true } }, position: { select: { title: true, startTime: true, endTime: true, breakMinutes: true } } },
      },
    },
  });
  if (!event) notFound();

  const istMinuten = event.timeEntries.reduce((s, z) => s + z.minutes, 0);
  const sollMinuten = event.assignments.reduce((s, a) => {
    const start = a.plannedStart ?? a.position.startTime ?? event.startTime;
    const ende = a.plannedEnd ?? a.position.endTime ?? event.endTime;
    const pause = a.plannedBreakMinutes || a.position.breakMinutes || 0;
    return s + (start && ende ? shiftMinutes(start, ende, pause) ?? 0 : 0);
  }, 0);
  const mitZeit = new Set(event.timeEntries.map((z) => z.employeeId));
  const ohneZeit = event.assignments.filter((a) => !mitZeit.has(a.employeeId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Raster min={160}>
        <Kennzahl wert={formatHours(sollMinuten)} label="Geplante Stunden" />
        <Kennzahl wert={formatHours(istMinuten)} label="Erfasste Stunden" />
        <Kennzahl wert={formatDiff(istMinuten - sollMinuten)} label="Differenz"
                  farbe={Math.abs(istMinuten - sollMinuten) > 60 ? 'gelb' : 'gruen'} />
        <Kennzahl wert={ohneZeit.length} label="Noch ohne Ist-Zeit" farbe={ohneZeit.length > 0 ? 'gelb' : 'gruen'} />
      </Raster>

      <Karte titel="Erfasste Zeiten" aktion={<Link href={`/zeiterfassung?q=${encodeURIComponent(event.name)}`} style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>In der Zeiterfassung oeffnen</Link>}>
        {event.timeEntries.length === 0 ? (
          <Leer>Noch keine Zeiten erfasst. Sie entstehen beim Abgleich eines Stundenzettels oder von Hand in der Zeiterfassung.</Leer>
        ) : (
          <table className="tabelle">
            <thead><tr><th>Mitarbeiter</th><th>Position</th><th>Zeit</th><th>Pause</th><th>Stunden</th><th>Quelle</th><th>Status</th></tr></thead>
            <tbody>
              {event.timeEntries.map((zeit) => (
                <tr key={zeit.id}>
                  <td><Link href={`/mitarbeiter/${zeit.employee.id}`}>{zeit.employee.firstName} {zeit.employee.lastName}</Link></td>
                  <td style={{ color: 'var(--text-sekundaer)' }}>{zeit.position?.title ?? '–'}</td>
                  <td className="zahl">{zeit.start}–{zeit.end}</td>
                  <td className="zahl">{zeit.breakMinutes} Min</td>
                  <td className="zahl" style={{ fontWeight: 600 }}>{formatHours(zeit.minutes)}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-sekundaer)' }}>{zeit.source}</td>
                  <td><StatusMarke status={label(TIME_ENTRY_STATUS, zeit.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Karte>

      {ohneZeit.length > 0 && (
        <Karte titel="Eingeteilt, aber ohne Ist-Zeit">
          <table className="tabelle">
            <thead><tr><th>Mitarbeiter</th><th>Position</th><th>Geplante Zeit</th></tr></thead>
            <tbody>
              {ohneZeit.map((a) => (
                <tr key={a.id} className="zeile-gelb">
                  <td><Link href={`/mitarbeiter/${a.employee.id}`}>{a.employee.firstName} {a.employee.lastName}</Link></td>
                  <td style={{ color: 'var(--text-sekundaer)' }}>{a.position.title}</td>
                  <td className="zahl">{a.plannedStart ?? '–'}–{a.plannedEnd ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Karte>
      )}
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE, formatDiff, formatHours } from '@/lib/time';
import { ISSUE_LABEL, type Issue } from '@/lib/reconcile/engine';
import { ROW_STATUS, label } from '@/lib/status';
import { Karte, Leer, StatusMarke } from '@/components/ui';

export const metadata = { title: 'Abgleich' };
export const dynamic = 'force-dynamic';

export default async function EventAbgleich({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('reconciliation.view');
  const { id } = await params;

  const event = await db.event.findFirst({ where: { id, ...eventFilter(user) }, select: { id: true } });
  if (!event) notFound();

  const zeilen = await db.reconciliationRow.findMany({
    where: { eventId: id },
    include: { reconciliation: { select: { id: true, reference: true, name: true, status: true, createdAt: true } } },
    orderBy: [{ createdAt: 'desc' }, { rowNumber: 'asc' }],
    take: 200,
  });

  if (zeilen.length === 0) {
    return (
      <Karte>
        <Leer>
          Fuer dieses Event wurde noch kein Stundenzettel abgeglichen.{' '}
          <Link href="/abgleiche/neu">Datei hochladen</Link>
        </Leer>
      </Karte>
    );
  }

  const nachAbgleich = new Map<string, typeof zeilen>();
  for (const zeile of zeilen) {
    const liste = nachAbgleich.get(zeile.reconciliationId);
    if (liste) liste.push(zeile);
    else nachAbgleich.set(zeile.reconciliationId, [zeile]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[...nachAbgleich.values()].map((gruppe) => {
        const abgleich = gruppe[0]!.reconciliation;
        return (
          <Karte key={abgleich.id}
                 titel={<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                   <Link href={`/abgleiche/${abgleich.id}`} style={{ fontWeight: 600 }}>{abgleich.name}</Link>
                   <span className="zahl" style={{ fontSize: 12, color: 'var(--text-gedaempft)' }}>{abgleich.reference}</span>
                   <span style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>{formatDateDE(abgleich.createdAt)}</span>
                 </span>}>
            <div className="tabelle-scroll">
              <table className="tabelle">
                <thead><tr><th>Mitarbeiter</th><th>Soll</th><th>Ist</th><th>Differenz</th><th>Befund</th><th>Status</th></tr></thead>
                <tbody>
                  {gruppe.map((zeile) => (
                    <tr key={zeile.id} className={`zeile-${ROW_STATUS[zeile.status]?.farbe ?? 'blau'}`}>
                      <td>{zeile.rawName ?? '–'}</td>
                      <td className="zahl">
                        {zeile.plannedStart ? `${zeile.plannedStart}–${zeile.plannedEnd ?? '?'}` : '–'}
                        {zeile.plannedMinutes != null && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatHours(zeile.plannedMinutes)}</span>}
                      </td>
                      <td className="zahl">
                        {zeile.actualStart ? `${zeile.actualStart}–${zeile.actualEnd ?? '?'}` : '–'}
                        {zeile.actualMinutes != null && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatHours(zeile.actualMinutes)}</span>}
                      </td>
                      <td className="zahl">{formatDiff(zeile.diffMinutes)}</td>
                      <td style={{ fontSize: 11 }}>
                        {zeile.issues.map((befund) => ISSUE_LABEL[befund as Issue] ?? befund).join(', ') || '–'}
                      </td>
                      <td><StatusMarke status={label(ROW_STATUS, zeile.status)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Karte>
        );
      })}
    </div>
  );
}

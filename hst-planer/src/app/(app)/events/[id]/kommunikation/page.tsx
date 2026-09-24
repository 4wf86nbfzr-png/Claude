import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { Karte, Leer } from '@/components/ui';
import { NachrichtFormular } from '@/app/(app)/kommunikation/formular';

export const metadata = { title: 'Kommunikation' };
export const dynamic = 'force-dynamic';

export default async function EventKommunikation({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('communication.view');
  const { id } = await params;

  const event = await db.event.findFirst({ where: { id, ...eventFilter(user) }, select: { id: true, name: true } });
  if (!event) notFound();

  const nachrichten = await db.message.findMany({ where: { eventId: id }, orderBy: { createdAt: 'desc' }, take: 50 });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 1fr)', gap: 16, alignItems: 'start' }} className="dashboard-raster">
      {can(user.role, 'communication.send') && (
        <Karte titel="Nachricht an das Team">
          <div style={{ padding: 16 }}>
            <NachrichtFormular events={[{ id: event.id, name: event.name }]} mitarbeiter={[]} />
          </div>
        </Karte>
      )}

      <Karte titel="Verlauf">
        {nachrichten.length === 0 ? <Leer>Noch keine Nachrichten zu diesem Event.</Leer> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {nachrichten.map((nachricht) => (
              <li key={nachricht.id} style={{ padding: '11px 14px', borderBottom: '1px solid var(--linie)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={`marke marke-${nachricht.error ? 'rot' : nachricht.sentAt ? 'gruen' : 'gelb'}`}>
                    {nachricht.error ? 'Fehler' : nachricht.sentAt ? 'zugestellt' : 'offen'}
                  </span>
                  <strong style={{ fontSize: 13 }}>{nachricht.subject ?? '(ohne Betreff)'}</strong>
                  <span className="zahl" style={{ fontSize: 11, color: 'var(--text-gedaempft)' }}>{formatDateDE(nachricht.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>an {nachricht.toAddress ?? 'intern'}</div>
                <p style={{ fontSize: 12, margin: '4px 0 0', whiteSpace: 'pre-wrap', color: 'var(--text-gedaempft)' }}>{nachricht.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Karte>
    </div>
  );
}

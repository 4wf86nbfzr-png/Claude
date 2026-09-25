import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { Karte, Leer } from '@/components/ui';

export const metadata = { title: 'Protokoll' };
export const dynamic = 'force-dynamic';

export default async function EventProtokoll({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('audit.view');
  const { id } = await params;

  const event = await db.event.findFirst({ where: { id, ...eventFilter(user) }, select: { id: true } });
  if (!event) notFound();

  // Alles, was zu diesem Event gehört: Positionen, Zuweisungen, Vorfälle, Dokumente.
  const [positionen, zuweisungen, vorfaelle, dokumente] = await Promise.all([
    db.position.findMany({ where: { eventId: id }, select: { id: true } }),
    db.assignment.findMany({ where: { eventId: id }, select: { id: true } }),
    db.incident.findMany({ where: { eventId: id }, select: { id: true } }),
    db.document.findMany({ where: { eventId: id }, select: { id: true } }),
  ]);

  const ids = [id, ...positionen.map((p) => p.id), ...zuweisungen.map((a) => a.id), ...vorfaelle.map((v) => v.id), ...dokumente.map((d) => d.id)];

  const eintraege = await db.auditLog.findMany({
    where: { entityId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <Karte titel="Aenderungsprotokoll">
      {eintraege.length === 0 ? <Leer>Keine Einträge.</Leer> : (
        <table className="tabelle">
          <thead><tr><th>Zeitpunkt</th><th>Benutzer</th><th>Vorgang</th></tr></thead>
          <tbody>
            {eintraege.map((eintrag) => (
              <tr key={eintrag.id}>
                <td className="zahl" style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                  {eintrag.createdAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}
                </td>
                <td style={{ fontSize: 12 }}>{eintrag.actorLabel}</td>
                <td style={{ fontSize: 13 }}>{eintrag.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Karte>
  );
}

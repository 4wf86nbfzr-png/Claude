import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { formatDateDE } from '@/lib/time';
import { DOCUMENT_TYPE } from '@/lib/status';
import { Karte, Leer } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { dokumentEntfernenAktion } from '@/app/(app)/dokumente/actions';
import { UploadFormular } from '@/app/(app)/dokumente/upload';

export const metadata = { title: 'Dokumente' };
export const dynamic = 'force-dynamic';

export default async function EventDokumente({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('documents.view');
  const { id } = await params;

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: { documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } } },
  });
  if (!event) notFound();
  const darfBearbeiten = can(user.role, 'documents.edit');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Karte titel="Dokumente zu diesem Event">
        {event.documents.length === 0 ? <Leer>Noch keine Dokumente hinterlegt.</Leer> : (
          <table className="tabelle">
            <thead><tr><th>Titel</th><th>Typ</th><th>Größe</th><th>Hochgeladen</th>{darfBearbeiten && <th style={{ width: 1 }} />}</tr></thead>
            <tbody>
              {event.documents.map((dokument) => (
                <tr key={dokument.id}>
                  <td><a href={`/api/dokumente/${dokument.id}`} style={{ fontWeight: 500 }}>{dokument.title}</a></td>
                  <td style={{ fontSize: 12 }}>{DOCUMENT_TYPE[dokument.type] ?? dokument.type}</td>
                  <td className="zahl" style={{ fontSize: 12 }}>{Math.max(1, Math.round(dokument.sizeBytes / 1024))} KB</td>
                  <td className="zahl" style={{ fontSize: 12, color: 'var(--text-2)' }}>{formatDateDE(dokument.createdAt)}</td>
                  {darfBearbeiten && (
                    <td>
                      <AktionsFormular aktion={dokumentEntfernenAktion} meldungOben={false}>
                        <input type="hidden" name="id" value={dokument.id} />
                        <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                      </AktionsFormular>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Karte>

      {darfBearbeiten && (
        <Karte titel="Dokument hinzufügen">
          <div style={{ padding: 16 }}>
            <UploadFormular
              mitarbeiter={[]} kunden={[]} partner={[]}
              events={[{ id: event.id, name: event.name }]}
              vorauswahl={{ eventId: event.id }}
            />
          </div>
        </Karte>
      )}
    </div>
  );
}

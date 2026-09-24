import { notFound } from 'next/navigation';
import { seite } from '@/lib/auth/guard';
import { can } from '@/lib/auth/rbac';
import { db } from '@/lib/db';
import { eventFilter } from '@/lib/queries/scope';
import { Karte, Leer, Raster } from '@/components/ui';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { positionEntfernenAktion, positionSpeichern } from '../../actions';

export const metadata = { title: 'Positionen' };
export const dynamic = 'force-dynamic';

export default async function Positionen({ params }: { params: Promise<{ id: string }> }) {
  const user = await seite('events.view');
  const { id } = await params;
  const darfPlanen = can(user.role, 'dispo.edit');

  const event = await db.event.findFirst({
    where: { id, ...eventFilter(user) },
    include: {
      positions: {
        orderBy: { sortOrder: 'asc' },
        include: {
          requirements: { include: { qualification: true } },
          assignments: { where: { deletedAt: null }, select: { id: true, isReserve: true, status: true } },
        },
      },
    },
  });
  if (!event) notFound();

  const [bereiche, qualifikationen] = await Promise.all([
    db.serviceType.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    db.qualification.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {event.positions.length === 0 && (
        <Karte><Leer>Noch keine Positionen. Legen Sie unten die erste Position an – zum Beispiel „Ordnungsdienst Südtribüne, 8 Kräfte, 17:00–23:00“.</Leer></Karte>
      )}

      {event.positions.map((position) => {
        const aktive = position.assignments.filter((a) => !a.isReserve && !['ABGESAGT', 'STORNIERT'].includes(a.status)).length;
        const offen = Math.max(0, position.requiredCount - aktive);
        return (
          <Karte key={position.id}
                 titel={
                   <span style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                     <span>{position.title}</span>
                     <span className={`marke marke-${offen > 0 ? 'gelb' : 'gruen'}`}>{aktive}/{position.requiredCount} besetzt</span>
                     {offen > 0 && <span className="marke marke-rot">{offen} offen</span>}
                   </span>
                 }
                 aktion={darfPlanen && (
                   <AktionsFormular aktion={positionEntfernenAktion} stil={{ display: 'inline' }} meldungOben={false}>
                     <input type="hidden" name="eventId" value={id} />
                     <input type="hidden" name="positionId" value={position.id} />
                     <AktionsKnopf klasse="knopf knopf-klein knopf-gefahr" laufend="…">Entfernen</AktionsKnopf>
                   </AktionsFormular>
                 )}>
            <div style={{ padding: 14 }}>
              {darfPlanen ? (
                <PositionFormular eventId={id} position={position} bereiche={bereiche} qualifikationen={qualifikationen} />
              ) : (
                <Raster min={160}>
                  <span>Zeit: {position.startTime ?? '–'}–{position.endTime ?? '–'}</span>
                  <span>Pause: {position.breakMinutes} Min</span>
                  <span>Anforderungen: {position.requirements.map((r) => r.qualification.name).join(', ') || '–'}</span>
                </Raster>
              )}
            </div>
          </Karte>
        );
      })}

      {darfPlanen && (
        <Karte titel="Neue Position">
          <div style={{ padding: 14 }}>
            <PositionFormular eventId={id} bereiche={bereiche} qualifikationen={qualifikationen} neu />
          </div>
        </Karte>
      )}
    </div>
  );
}

interface PositionDaten {
  id: string; title: string; serviceTypeId: string | null; requiredCount: number;
  startTime: string | null; endTime: string | null; breakMinutes: number;
  dressCode: string | null; note: string | null; hourlyRate: unknown;
  requirements: Array<{ qualificationId: string }>;
}

function PositionFormular({
  eventId, position, bereiche, qualifikationen, neu,
}: {
  eventId: string;
  position?: PositionDaten;
  bereiche: Array<{ id: string; name: string }>;
  qualifikationen: Array<{ id: string; name: string }>;
  neu?: boolean;
}) {
  const gewaehlt = new Set(position?.requirements.map((r) => r.qualificationId) ?? []);
  const inhalt = (
    <>
      <input type="hidden" name="eventId" value={eventId} />
      {position && <input type="hidden" name="positionId" value={position.id} />}
      <Raster min={170}>
        <label className="feld-gruppe">
          <span className="feld-label">Bezeichnung</span>
          <input name="title" className="feld" required maxLength={150} defaultValue={position?.title ?? ''} placeholder="z. B. Einlasskontrolle Nord" />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Bereich</span>
          <select name="serviceTypeId" className="feld" defaultValue={position?.serviceTypeId ?? ''}>
            <option value="">–</option>
            {bereiche.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Anzahl (Soll)</span>
          <input name="requiredCount" type="number" min={1} max={999} className="feld zahl" required defaultValue={position?.requiredCount ?? 1} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Beginn</span>
          <input name="startTime" type="time" className="feld" defaultValue={position?.startTime ?? ''} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Ende</span>
          <input name="endTime" type="time" className="feld" defaultValue={position?.endTime ?? ''} />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Pause (Min)</span>
          <input name="breakMinutes" type="number" min={0} max={600} className="feld zahl" defaultValue={position?.breakMinutes ?? 0} />
        </label>
      </Raster>

      <fieldset style={{ border: '1px solid var(--linie)', borderRadius: 'var(--radius-s)', padding: '10px 12px' }}>
        <legend className="feld-label" style={{ padding: '0 5px' }}>Anforderungen</legend>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {qualifikationen.map((q) => (
            <label key={q.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" name="qualifikationen" value={q.id} defaultChecked={gewaehlt.has(q.id)} />
              {q.name}
            </label>
          ))}
        </div>
      </fieldset>

      <Raster min={220}>
        <label className="feld-gruppe">
          <span className="feld-label">Abweichender Dresscode</span>
          <input name="dressCode" className="feld" defaultValue={position?.dressCode ?? ''} placeholder="nur falls abweichend vom Event" />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Hinweis</span>
          <input name="note" className="feld" defaultValue={position?.note ?? ''} />
        </label>
      </Raster>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <AktionsKnopf klasse="knopf knopf-primaer knopf-klein">{neu ? 'Position anlegen' : 'Speichern'}</AktionsKnopf>
      </div>
    </>
  );

  return (
    <AktionsFormular aktion={positionSpeichern} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {inhalt}
    </AktionsFormular>
  );
}

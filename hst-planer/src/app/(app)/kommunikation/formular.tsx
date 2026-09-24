'use client';

import { useState } from 'react';
import { nachrichtSendenAktion } from './actions';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';

export function NachrichtFormular({
  events, mitarbeiter,
}: { events: Array<{ id: string; name: string }>; mitarbeiter: Array<{ id: string; name: string }> }) {
  const [anTeam, setAnTeam] = useState(true);

  return (
    <AktionsFormular aktion={nachrichtSendenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="radio" name="ziel" checked={anTeam} onChange={() => setAnTeam(true)} /> an das Team eines Events
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="radio" name="ziel" checked={!anTeam} onChange={() => setAnTeam(false)} /> an einzelne Mitarbeiter
        </label>
      </div>

      {anTeam ? (
        <label className="feld-gruppe">
          <span className="feld-label">Event</span>
          <select name="eventId" className="feld" required>
            <option value="">– waehlen –</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="feld-hinweis">Die Nachricht geht an alle eingeteilten Kraefte, die nicht abgesagt haben.</span>
        </label>
      ) : (
        <label className="feld-gruppe">
          <span className="feld-label">Mitarbeiter (Mehrfachauswahl)</span>
          <select name="employeeIds" className="feld" multiple size={8} required style={{ height: 'auto' }}>
            {mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
      )}

      <label className="feld-gruppe">
        <span className="feld-label">Betreff</span>
        <input name="betreff" className="feld" required maxLength={150} placeholder="z. B. Treffpunkt geaendert" />
      </label>

      <label className="feld-gruppe">
        <span className="feld-label">Nachricht</span>
        <textarea name="text" className="feld" rows={6} required placeholder="Moin, …" />
      </label>

      <div><AktionsKnopf klasse="knopf knopf-primaer" laufend="Wird versendet …">Nachricht senden</AktionsKnopf></div>
    </AktionsFormular>
  );
}

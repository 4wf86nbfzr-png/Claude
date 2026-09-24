'use client';

import { useState } from 'react';
import { dokumentHochladenAktion } from './actions';
import { AktionsFormular, AktionsKnopf } from '@/components/aktion';
import { Raster } from '@/components/ui';
import { DOCUMENT_TYPE } from '@/lib/status';

type Zuordnung = 'employeeId' | 'eventId' | 'customerId' | 'partnerId';

export function UploadFormular({
  mitarbeiter, kunden, events, partner, vorauswahl,
}: {
  mitarbeiter: Array<{ id: string; name: string }>;
  kunden: Array<{ id: string; name: string }>;
  events: Array<{ id: string; name: string }>;
  partner: Array<{ id: string; name: string }>;
  vorauswahl?: Partial<Record<Zuordnung, string | undefined>>;
}) {
  const erste: Zuordnung = vorauswahl?.eventId ? 'eventId'
    : vorauswahl?.customerId ? 'customerId'
    : vorauswahl?.partnerId ? 'partnerId' : 'employeeId';
  const [ziel, setZiel] = useState<Zuordnung>(erste);

  const listen: Record<Zuordnung, Array<{ id: string; name: string }>> = {
    employeeId: mitarbeiter, eventId: events, customerId: kunden, partnerId: partner,
  };
  const bezeichnung: Record<Zuordnung, string> = {
    employeeId: 'Mitarbeiter', eventId: 'Event', customerId: 'Kunde', partnerId: 'Partner',
  };

  return (
    <AktionsFormular aktion={dokumentHochladenAktion} stil={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Raster min={180}>
        <label className="feld-gruppe">
          <span className="feld-label">Dokumenttyp</span>
          <select name="typ" className="feld" defaultValue="SONSTIGES">
            {Object.entries(DOCUMENT_TYPE).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
          </select>
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Titel</span>
          <input name="titel" className="feld" placeholder="leer lassen = Dateiname" />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Gueltig bis</span>
          <input name="gueltigBis" type="date" className="feld" />
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">Zuordnung zu</span>
          <select className="feld" value={ziel} onChange={(e) => setZiel(e.target.value as Zuordnung)}>
            {(Object.keys(listen) as Zuordnung[]).map((schluessel) => (
              <option key={schluessel} value={schluessel}>{bezeichnung[schluessel]}</option>
            ))}
          </select>
        </label>
        <label className="feld-gruppe">
          <span className="feld-label">{bezeichnung[ziel]}</span>
          <select name={ziel} className="feld" required defaultValue={vorauswahl?.[ziel] ?? ''}>
            <option value="">– waehlen –</option>
            {listen[ziel].map((eintrag) => <option key={eintrag.id} value={eintrag.id}>{eintrag.name}</option>)}
          </select>
        </label>
      </Raster>

      <label className="feld-gruppe">
        <span className="feld-label">Datei</span>
        <input name="datei" type="file" className="feld" required style={{ height: 'auto', padding: 8 }}
               accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xlsm,.csv,.docx" />
        <span className="feld-hinweis">PDF, Bilder, Excel, Word und CSV bis 20 MB.</span>
      </label>

      <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" name="sichtbar" /> fuer den Mitarbeiter in der App sichtbar
      </label>

      <div><AktionsKnopf klasse="knopf knopf-primaer" laufend="Wird hochgeladen …">Hochladen</AktionsKnopf></div>
    </AktionsFormular>
  );
}

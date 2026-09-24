'use client';

import { useActionState } from 'react';
import { anfrageErfassenAktion, type Ergebnis } from '../actions';
import { Feld, Hinweis, Raster } from '@/components/ui';
import { AktionsKnopf } from '@/components/aktion';

export function AnfrageFormular() {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(anfrageErfassenAktion, {});

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Raster min={200}>
        <Feld label="Firma" name="company"><input id="company" name="company" className="feld" /></Feld>
        <Feld label="Ansprechpartner" name="contactPerson"><input id="contactPerson" name="contactPerson" className="feld" /></Feld>
        <Feld label="E-Mail" name="email"><input id="email" name="email" type="email" className="feld" required /></Feld>
        <Feld label="Telefon" name="phone"><input id="phone" name="phone" type="tel" className="feld" /></Feld>
      </Raster>

      <Raster min={180}>
        <Feld label="Anlass" name="eventName"><input id="eventName" name="eventName" className="feld" /></Feld>
        <Feld label="Datum" name="eventDate"><input id="eventDate" name="eventDate" type="date" className="feld" /></Feld>
        <Feld label="Beginn" name="startTime"><input id="startTime" name="startTime" type="time" className="feld" /></Feld>
        <Feld label="Ende" name="endTime"><input id="endTime" name="endTime" type="time" className="feld" /></Feld>
        <Feld label="Ort" name="location"><input id="location" name="location" className="feld" /></Feld>
        <Feld label="Anzahl Mitarbeiter" name="employeesNeeded">
          <input id="employeesNeeded" name="employeesNeeded" type="number" min={1} max={999} className="feld zahl" />
        </Feld>
        <Feld label="Leistungsart" name="serviceType">
          <select id="serviceType" name="serviceType" className="feld" defaultValue="">
            <option value="">– bitte wählen –</option>
            <option value="SICHERHEIT">Sicherheit &amp; Ordnungsdienst</option>
            <option value="GASTRO">Gastro- &amp; Servicepersonal</option>
            <option value="PROMOTION">Promotion &amp; Hostessen</option>
            <option value="LOGISTIK">Logistik &amp; Auf-/Abbau</option>
            <option value="FAHRSERVICE">Fahrservice</option>
            <option value="REINIGUNG">Reinigung</option>
          </select>
        </Feld>
      </Raster>

      <Feld label="Nachricht / Notiz zum Gespraech" name="message">
        <textarea id="message" name="message" className="feld" rows={4} />
      </Feld>

      <div><AktionsKnopf klasse="knopf knopf-primaer">Anfrage anlegen</AktionsKnopf></div>
    </form>
  );
}

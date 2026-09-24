'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { eventSpeichern, type Ergebnis } from './actions';
import { Feld, Hinweis, Karte, Raster } from '@/components/ui';
import { EVENT_STATUS, PRIORITY } from '@/lib/status';

export interface EventWerte {
  id?: string;
  name?: string; customerId?: string | null; serviceTypeId?: string | null;
  contactName?: string | null; contactPhone?: string | null; contactEmail?: string | null;
  venue?: string | null; street?: string | null; zip?: string | null; city?: string | null;
  date?: string; startTime?: string | null; endTime?: string | null;
  buildUpTime?: string | null; teardownTime?: string | null;
  meetingPoint?: string | null; meetingTime?: string | null;
  eventKind?: string | null; priority?: string; status?: string;
  dressCode?: string | null; tasks?: string | null; hints?: string | null; notesInternal?: string | null;
  operationLeadId?: string | null; revenue?: string | null;
}

interface Auswahl { id: string; name: string }

function Speichern({ neu }: { neu: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="knopf knopf-primaer" disabled={pending}>
      {pending ? 'Wird gespeichert …' : neu ? 'Event anlegen' : 'Aenderungen speichern'}
    </button>
  );
}

export function EventFormular({
  werte = {}, kunden, bereiche, leitungen, darfFinanzen,
}: {
  werte?: EventWerte;
  kunden: Auswahl[];
  bereiche: Auswahl[];
  leitungen: Auswahl[];
  darfFinanzen: boolean;
}) {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(eventSpeichern, {});
  const neu = !werte.id;

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {werte.id && <input type="hidden" name="id" value={werte.id} />}
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Karte titel="Eckdaten">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Feld label="Eventname" name="name">
            <input id="name" name="name" className="feld" required maxLength={200} defaultValue={werte.name ?? ''}
                   placeholder="z. B. Nordstadion – Heimspiel 12. Spieltag" />
          </Feld>

          <Raster min={200}>
            <Feld label="Kunde" name="customerId">
              <select id="customerId" name="customerId" className="feld" defaultValue={werte.customerId ?? ''}>
                <option value="">– kein Kunde hinterlegt –</option>
                {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            </Feld>
            <Feld label="Leistungsbereich" name="serviceTypeId">
              <select id="serviceTypeId" name="serviceTypeId" className="feld" defaultValue={werte.serviceTypeId ?? ''}>
                <option value="">– bitte waehlen –</option>
                {bereiche.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Feld>
            <Feld label="Veranstaltungsart" name="eventKind">
              <input id="eventKind" name="eventKind" className="feld" defaultValue={werte.eventKind ?? ''} placeholder="z. B. Sportveranstaltung" />
            </Feld>
          </Raster>

          <Raster min={180}>
            <Feld label="Datum" name="date">
              <input id="date" name="date" type="date" className="feld" required defaultValue={werte.date ?? ''} />
            </Feld>
            <Feld label="Startzeit" name="startTime">
              <input id="startTime" name="startTime" type="time" className="feld" defaultValue={werte.startTime ?? ''} />
            </Feld>
            <Feld label="Endzeit" name="endTime" hinweis="Darf ueber Mitternacht gehen.">
              <input id="endTime" name="endTime" type="time" className="feld" defaultValue={werte.endTime ?? ''} />
            </Feld>
            <Feld label="Aufbau ab" name="buildUpTime">
              <input id="buildUpTime" name="buildUpTime" type="time" className="feld" defaultValue={werte.buildUpTime ?? ''} />
            </Feld>
            <Feld label="Abbau ab" name="teardownTime">
              <input id="teardownTime" name="teardownTime" type="time" className="feld" defaultValue={werte.teardownTime ?? ''} />
            </Feld>
          </Raster>

          <Raster min={180}>
            <Feld label="Status" name="status">
              <select id="status" name="status" className="feld" defaultValue={werte.status ?? 'PLANUNG'}>
                {Object.entries(EVENT_STATUS).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
              </select>
            </Feld>
            <Feld label="Prioritaet" name="priority">
              <select id="priority" name="priority" className="feld" defaultValue={werte.priority ?? 'NORMAL'}>
                {Object.entries(PRIORITY).map(([wert, s]) => <option key={wert} value={wert}>{s.label}</option>)}
              </select>
            </Feld>
            <Feld label="Einsatzleitung" name="operationLeadId">
              <select id="operationLeadId" name="operationLeadId" className="feld" defaultValue={werte.operationLeadId ?? ''}>
                <option value="">– noch offen –</option>
                {leitungen.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Feld>
            {darfFinanzen && (
              <Feld label="Erwarteter Umsatz (EUR)" name="revenue">
                <input id="revenue" name="revenue" className="feld zahl" inputMode="decimal" defaultValue={werte.revenue ?? ''} placeholder="0,00" />
              </Feld>
            )}
          </Raster>
        </div>
      </Karte>

      <Karte titel="Ort & Treffpunkt">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={200}>
            <Feld label="Veranstaltungsort" name="venue">
              <input id="venue" name="venue" className="feld" defaultValue={werte.venue ?? ''} placeholder="z. B. Fischauktionshalle" />
            </Feld>
            <Feld label="Strasse und Hausnummer" name="street">
              <input id="street" name="street" className="feld" defaultValue={werte.street ?? ''} />
            </Feld>
            <Feld label="PLZ" name="zip">
              <input id="zip" name="zip" className="feld" maxLength={10} defaultValue={werte.zip ?? ''} />
            </Feld>
            <Feld label="Ort" name="city">
              <input id="city" name="city" className="feld" defaultValue={werte.city ?? ''} />
            </Feld>
          </Raster>
          <Raster min={200}>
            <Feld label="Treffpunkt" name="meetingPoint" hinweis="Steht so in der Mitarbeiter-App.">
              <input id="meetingPoint" name="meetingPoint" className="feld" defaultValue={werte.meetingPoint ?? ''} placeholder="z. B. Eingang Sued, Container 3" />
            </Feld>
            <Feld label="Treffzeit" name="meetingTime">
              <input id="meetingTime" name="meetingTime" type="time" className="feld" defaultValue={werte.meetingTime ?? ''} />
            </Feld>
          </Raster>
        </div>
      </Karte>

      <Karte titel="Vorgaben & Hinweise">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Feld label="Dresscode" name="dressCode">
            <input id="dressCode" name="dressCode" className="feld" defaultValue={werte.dressCode ?? ''}
                   placeholder="z. B. Schwarze Hose, HST-Softshelljacke, feste Schuhe" />
          </Feld>
          <Feld label="Aufgaben" name="tasks">
            <textarea id="tasks" name="tasks" className="feld" rows={3} defaultValue={werte.tasks ?? ''} />
          </Feld>
          <Feld label="Hinweise fuer Mitarbeiter" name="hints" hinweis="Diese Angaben sind in der Mitarbeiter-App sichtbar.">
            <textarea id="hints" name="hints" className="feld" rows={3} defaultValue={werte.hints ?? ''} />
          </Feld>
          <Feld label="Interne Notizen" name="notesInternal" hinweis="Nur fuer Disposition und Leitung sichtbar – nie fuer Mitarbeiter, Partner oder Kunden.">
            <textarea id="notesInternal" name="notesInternal" className="feld" rows={3} defaultValue={werte.notesInternal ?? ''} />
          </Feld>
        </div>
      </Karte>

      <Karte titel="Ansprechpartner beim Kunden">
        <div style={{ padding: 16 }}>
          <Raster min={200}>
            <Feld label="Name" name="contactName">
              <input id="contactName" name="contactName" className="feld" defaultValue={werte.contactName ?? ''} />
            </Feld>
            <Feld label="Telefon" name="contactPhone">
              <input id="contactPhone" name="contactPhone" type="tel" className="feld" defaultValue={werte.contactPhone ?? ''} />
            </Feld>
            <Feld label="E-Mail" name="contactEmail">
              <input id="contactEmail" name="contactEmail" type="email" className="feld" defaultValue={werte.contactEmail ?? ''} />
            </Feld>
          </Raster>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Link href={werte.id ? `/events/${werte.id}` : '/events'} className="knopf">Abbrechen</Link>
        <Speichern neu={neu} />
      </div>
    </form>
  );
}

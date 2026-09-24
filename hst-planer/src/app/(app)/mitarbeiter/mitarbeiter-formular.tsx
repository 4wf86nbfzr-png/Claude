'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { mitarbeiterSpeichern, type Ergebnis } from './actions';
import { Feld, Hinweis, Karte, Raster } from '@/components/ui';
import { EMPLOYMENT_TYPE } from '@/lib/status';

export interface MitarbeiterWerte {
  id?: string;
  firstName?: string; lastName?: string; personnelNo?: string | null;
  phone?: string | null; mobile?: string | null; email?: string | null;
  street?: string | null; zip?: string | null; city?: string | null;
  birthDate?: string | null; employmentType?: string; hourlyRate?: string | null;
  drivingLicence?: string | null; partnerId?: string | null;
  active?: boolean; blocked?: boolean; blockReason?: string | null;
  notesInternal?: string | null; infoForEmployee?: string | null;
  preferredAreas?: string[];
  qualifikationen?: Array<{ qualificationId: string; acquiredAt: string | null; expiresAt: string | null }>;
}

function Speichern({ neu }: { neu: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" className="knopf knopf-primaer" disabled={pending}>{pending ? 'Wird gespeichert …' : neu ? 'Mitarbeiter anlegen' : 'Speichern'}</button>;
}

export function MitarbeiterFormular({
  werte = {}, partner, qualifikationen, bereiche, darfFinanzen,
}: {
  werte?: MitarbeiterWerte;
  partner: Array<{ id: string; name: string }>;
  qualifikationen: Array<{ id: string; name: string; expires: boolean }>;
  bereiche: Array<{ id: string; code: string; name: string }>;
  darfFinanzen: boolean;
}) {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(mitarbeiterSpeichern, {});
  const neu = !werte.id;
  const vorhandene = new Map((werte.qualifikationen ?? []).map((q) => [q.qualificationId, q]));
  const gewaehlteBereiche = new Set(werte.preferredAreas ?? []);

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {werte.id && <input type="hidden" name="id" value={werte.id} />}
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Karte titel="Person">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={180}>
            <Feld label="Vorname" name="firstName">
              <input id="firstName" name="firstName" className="feld" required defaultValue={werte.firstName ?? ''} />
            </Feld>
            <Feld label="Nachname" name="lastName">
              <input id="lastName" name="lastName" className="feld" required defaultValue={werte.lastName ?? ''} />
            </Feld>
            <Feld label="Personalnummer" name="personnelNo" hinweis={neu ? 'Leer lassen – wird automatisch vergeben.' : undefined}>
              <input id="personnelNo" name="personnelNo" className="feld zahl" defaultValue={werte.personnelNo ?? ''} />
            </Feld>
            <Feld label="Geburtsdatum" name="birthDate">
              <input id="birthDate" name="birthDate" type="date" className="feld" defaultValue={werte.birthDate ?? ''} />
            </Feld>
          </Raster>

          <Raster min={180}>
            <Feld label="Mobil" name="mobile">
              <input id="mobile" name="mobile" type="tel" className="feld" defaultValue={werte.mobile ?? ''} />
            </Feld>
            <Feld label="Telefon" name="phone">
              <input id="phone" name="phone" type="tel" className="feld" defaultValue={werte.phone ?? ''} />
            </Feld>
            <Feld label="E-Mail" name="email">
              <input id="email" name="email" type="email" className="feld" defaultValue={werte.email ?? ''} />
            </Feld>
          </Raster>

          <Raster min={180}>
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
        </div>
      </Karte>

      <Karte titel="Beschaeftigung">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={180}>
            <Feld label="Beschaeftigungsart" name="employmentType">
              <select id="employmentType" name="employmentType" className="feld" defaultValue={werte.employmentType ?? 'AUSHILFE'}>
                {Object.entries(EMPLOYMENT_TYPE).map(([wert, text]) => <option key={wert} value={wert}>{text}</option>)}
              </select>
            </Feld>
            {darfFinanzen && (
              <Feld label="Stundensatz (EUR)" name="hourlyRate">
                <input id="hourlyRate" name="hourlyRate" className="feld zahl" inputMode="decimal" defaultValue={werte.hourlyRate ?? ''} placeholder="0,00" />
              </Feld>
            )}
            <Feld label="Fuehrerschein" name="drivingLicence">
              <input id="drivingLicence" name="drivingLicence" className="feld" defaultValue={werte.drivingLicence ?? ''} placeholder="z. B. B, BE" />
            </Feld>
            <Feld label="Partner / Nachunternehmer" name="partnerId">
              <select id="partnerId" name="partnerId" className="feld" defaultValue={werte.partnerId ?? ''}>
                <option value="">– eigener Mitarbeiter –</option>
                {partner.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Feld>
          </Raster>

          <fieldset style={{ border: '1px solid var(--linie)', borderRadius: 'var(--radius-s)', padding: '10px 12px' }}>
            <legend className="feld-label" style={{ padding: '0 5px' }}>Bevorzugte Einsatzbereiche</legend>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {bereiche.map((b) => (
                <label key={b.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" name="bereiche" value={b.code} defaultChecked={gewaehlteBereiche.has(b.code)} /> {b.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" name="active" defaultChecked={werte.active ?? true} /> aktiv
            </label>
            <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" name="blocked" defaultChecked={werte.blocked ?? false} /> Sperrvermerk
            </label>
          </div>
          <Feld label="Grund des Sperrvermerks" name="blockReason" hinweis="Pflicht, sobald der Sperrvermerk gesetzt ist.">
            <input id="blockReason" name="blockReason" className="feld" defaultValue={werte.blockReason ?? ''} />
          </Feld>
        </div>
      </Karte>

      <Karte titel="Qualifikationen & Nachweise">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="feld-hinweis" style={{ margin: 0 }}>
            Nachweise mit Ablaufdatum werden automatisch ueberwacht und 30 Tage vorher im Dashboard gemeldet.
          </p>
          {qualifikationen.map((q) => {
            const vorhanden = vorhandene.get(q.id);
            return (
              <div key={q.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid var(--linie)' }}>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, minWidth: 230 }}>
                  <input type="checkbox" name="qualifikationen" value={q.id} defaultChecked={Boolean(vorhanden)} />
                  {q.name}
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-sekundaer)' }}>
                  erworben
                  <input type="date" name={`erworben_${q.id}`} className="feld" style={{ width: 'auto' }} defaultValue={vorhanden?.acquiredAt ?? ''} />
                </label>
                {q.expires && (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-sekundaer)' }}>
                    gueltig bis
                    <input type="date" name={`ablauf_${q.id}`} className="feld" style={{ width: 'auto' }} defaultValue={vorhanden?.expiresAt ?? ''} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </Karte>

      <Karte titel="Notizen">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Feld label="Information fuer den Mitarbeiter" name="infoForEmployee" hinweis="In der Mitarbeiter-App sichtbar.">
            <textarea id="infoForEmployee" name="infoForEmployee" className="feld" rows={2} defaultValue={werte.infoForEmployee ?? ''} />
          </Feld>
          <Feld label="Interne Notizen" name="notesInternal" hinweis="Nur fuer Disposition und Leitung – nie fuer den Mitarbeiter sichtbar.">
            <textarea id="notesInternal" name="notesInternal" className="feld" rows={3} defaultValue={werte.notesInternal ?? ''} />
          </Feld>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Link href={werte.id ? `/mitarbeiter/${werte.id}` : '/mitarbeiter'} className="knopf">Abbrechen</Link>
        <Speichern neu={neu} />
      </div>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { kundeSpeichernAktion, type Ergebnis } from './actions';
import { Feld, Hinweis, Karte, Raster } from '@/components/ui';
import { AktionsKnopf } from '@/components/aktion';

export interface KundeWerte {
  id?: string; name?: string; shortName?: string | null; email?: string | null; phone?: string | null;
  street?: string | null; zip?: string | null; city?: string | null; billingAddress?: string | null;
  vatId?: string | null; hourlyRate?: string | null; contractNote?: string | null;
  notesInternal?: string | null; active?: boolean;
}

export function KundenFormular({ werte = {}, darfFinanzen }: { werte?: KundeWerte; darfFinanzen: boolean }) {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(kundeSpeichernAktion, {});

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {werte.id && <input type="hidden" name="id" value={werte.id} />}
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Karte titel="Firma">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={200}>
            <Feld label="Firmenname" name="name"><input id="name" name="name" className="feld" required defaultValue={werte.name ?? ''} /></Feld>
            <Feld label="Kurzname" name="shortName"><input id="shortName" name="shortName" className="feld" defaultValue={werte.shortName ?? ''} /></Feld>
            <Feld label="E-Mail" name="email"><input id="email" name="email" type="email" className="feld" defaultValue={werte.email ?? ''} /></Feld>
            <Feld label="Telefon" name="phone"><input id="phone" name="phone" type="tel" className="feld" defaultValue={werte.phone ?? ''} /></Feld>
          </Raster>
          <Raster min={180}>
            <Feld label="Straße" name="street"><input id="street" name="street" className="feld" defaultValue={werte.street ?? ''} /></Feld>
            <Feld label="PLZ" name="zip"><input id="zip" name="zip" className="feld" maxLength={10} defaultValue={werte.zip ?? ''} /></Feld>
            <Feld label="Ort" name="city"><input id="city" name="city" className="feld" defaultValue={werte.city ?? ''} /></Feld>
            <Feld label="USt-IdNr." name="vatId"><input id="vatId" name="vatId" className="feld" defaultValue={werte.vatId ?? ''} /></Feld>
          </Raster>
          <Feld label="Abweichende Rechnungsanschrift" name="billingAddress">
            <textarea id="billingAddress" name="billingAddress" className="feld" rows={2} defaultValue={werte.billingAddress ?? ''} />
          </Feld>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="active" defaultChecked={werte.active ?? true} /> aktiv
          </label>
        </div>
      </Karte>

      <Karte titel="Vertrag & Konditionen">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {darfFinanzen && (
            <Feld label="Vereinbarter Stundensatz (EUR)" name="hourlyRate">
              <input id="hourlyRate" name="hourlyRate" className="feld zahl" inputMode="decimal" defaultValue={werte.hourlyRate ?? ''} placeholder="0,00" />
            </Feld>
          )}
          <Feld label="Vertragsdaten / Konditionen" name="contractNote">
            <textarea id="contractNote" name="contractNote" className="feld" rows={3} defaultValue={werte.contractNote ?? ''} />
          </Feld>
          <Feld label="Interne Notizen" name="notesInternal" hinweis="Nicht für Mitarbeiter und nicht für den Kunden sichtbar.">
            <textarea id="notesInternal" name="notesInternal" className="feld" rows={3} defaultValue={werte.notesInternal ?? ''} />
          </Feld>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Link href={werte.id ? `/kunden/${werte.id}` : '/kunden'} className="knopf">Abbrechen</Link>
        <AktionsKnopf klasse="knopf knopf-primaer">{werte.id ? 'Speichern' : 'Kunde anlegen'}</AktionsKnopf>
      </div>
    </form>
  );
}

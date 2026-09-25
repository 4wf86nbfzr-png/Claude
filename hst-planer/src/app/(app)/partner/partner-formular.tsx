'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { partnerSpeichernAktion, type Ergebnis } from '../kunden/actions';
import { Feld, Hinweis, Karte, Raster } from '@/components/ui';
import { AktionsKnopf } from '@/components/aktion';

export interface PartnerWerte {
  id?: string; name?: string; contactName?: string | null; email?: string | null; phone?: string | null;
  street?: string | null; zip?: string | null; city?: string | null;
  hourlyRate?: string | null; notesInternal?: string | null; active?: boolean;
}

export function PartnerFormular({ werte = {}, darfFinanzen }: { werte?: PartnerWerte; darfFinanzen: boolean }) {
  const [zustand, aktion] = useActionState<Ergebnis, FormData>(partnerSpeichernAktion, {});

  return (
    <form action={aktion} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {werte.id && <input type="hidden" name="id" value={werte.id} />}
      {zustand.fehler && <Hinweis art="fehler">{zustand.fehler}</Hinweis>}

      <Karte titel="Partnerdaten">
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Raster min={200}>
            <Feld label="Firmenname" name="name"><input id="name" name="name" className="feld" required defaultValue={werte.name ?? ''} /></Feld>
            <Feld label="Ansprechpartner" name="contactName"><input id="contactName" name="contactName" className="feld" defaultValue={werte.contactName ?? ''} /></Feld>
            <Feld label="E-Mail" name="email"><input id="email" name="email" type="email" className="feld" defaultValue={werte.email ?? ''} /></Feld>
            <Feld label="Telefon" name="phone"><input id="phone" name="phone" type="tel" className="feld" defaultValue={werte.phone ?? ''} /></Feld>
          </Raster>
          <Raster min={180}>
            <Feld label="Straße" name="street"><input id="street" name="street" className="feld" defaultValue={werte.street ?? ''} /></Feld>
            <Feld label="PLZ" name="zip"><input id="zip" name="zip" className="feld" maxLength={10} defaultValue={werte.zip ?? ''} /></Feld>
            <Feld label="Ort" name="city"><input id="city" name="city" className="feld" defaultValue={werte.city ?? ''} /></Feld>
            {darfFinanzen && (
              <Feld label="Verrechnungssatz (EUR)" name="hourlyRate">
                <input id="hourlyRate" name="hourlyRate" className="feld zahl" inputMode="decimal" defaultValue={werte.hourlyRate ?? ''} placeholder="0,00" />
              </Feld>
            )}
          </Raster>
          <Feld label="Interne Notizen" name="notesInternal">
            <textarea id="notesInternal" name="notesInternal" className="feld" rows={3} defaultValue={werte.notesInternal ?? ''} />
          </Feld>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="active" defaultChecked={werte.active ?? true} /> aktiv
          </label>
        </div>
      </Karte>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Link href={werte.id ? `/partner/${werte.id}` : '/partner'} className="knopf">Abbrechen</Link>
        <AktionsKnopf klasse="knopf knopf-primaer">{werte.id ? 'Speichern' : 'Partner anlegen'}</AktionsKnopf>
      </div>
    </form>
  );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export interface FilterFeld {
  name: string;
  label: string;
  optionen: Array<{ wert: string; label: string }>;
}

/**
 * Such- und Filterleiste für Tabellen (Spec 78).
 * Die Auswahl steht in der URL – dadurch ist jede Ansicht teilbar,
 * als Lesezeichen speicherbar und der Zurück-Knopf funktioniert.
 */
export function Filterleiste({
  felder = [],
  platzhalter = 'Suchen …',
  kinder,
}: { felder?: FilterFeld[]; platzhalter?: string; kinder?: React.ReactNode }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const [begriff, setBegriff] = useState(params.get('q') ?? '');
  const ersterLauf = useRef(true);

  function setzen(aenderungen: Record<string, string | null>) {
    const neu = new URLSearchParams(params.toString());
    for (const [schluessel, wert] of Object.entries(aenderungen)) {
      if (wert) neu.set(schluessel, wert);
      else neu.delete(schluessel);
    }
    neu.delete('seite'); // Nach jeder Filteraenderung wieder auf Seite 1
    router.replace(`${pfad}?${neu.toString()}`, { scroll: false });
  }

  // Die Suche läuft entprellt, damit nicht jeder Tastendruck eine Abfrage ausloest.
  useEffect(() => {
    if (ersterLauf.current) { ersterLauf.current = false; return; }
    const timer = setTimeout(() => setzen({ q: begriff.trim() || null }), 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begriff]);

  const aktiv = felder.some((f) => params.get(f.name)) || params.get('q');

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--linie)' }}>
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-gedaempft)', pointerEvents: 'none' }}>
          <Icon name="search" size={14} />
        </span>
        <input className="feld" type="search" value={begriff} onChange={(e) => setBegriff(e.target.value)}
               placeholder={platzhalter} aria-label={platzhalter} style={{ paddingLeft: 30 }} />
      </div>

      {felder.map((feld) => (
        <select key={feld.name} className="feld" aria-label={feld.label} style={{ width: 'auto', minWidth: 140 }}
                value={params.get(feld.name) ?? ''} onChange={(e) => setzen({ [feld.name]: e.target.value || null })}>
          <option value="">{feld.label}: alle</option>
          {feld.optionen.map((o) => <option key={o.wert} value={o.wert}>{o.label}</option>)}
        </select>
      ))}

      {kinder}

      {aktiv && (
        <button type="button" className="knopf knopf-klein" onClick={() => { setBegriff(''); router.replace(pfad, { scroll: false }); }}>
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Zeitraum und Schnellfilter der Dispositionsansicht. */
export function Zeitraumwahl({ von, tage, nurLuecken }: { von: string; tage: number; nurLuecken: boolean }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();

  function setzen(aenderungen: Record<string, string | null>) {
    const neu = new URLSearchParams(params.toString());
    for (const [schluessel, wert] of Object.entries(aenderungen)) {
      if (wert) neu.set(schluessel, wert);
      else neu.delete(schluessel);
    }
    router.replace(`${pfad}?${neu.toString()}`, { scroll: false });
  }

  function verschieben(tageOffset: number) {
    const datum = new Date(`${von}T00:00:00Z`);
    datum.setUTCDate(datum.getUTCDate() + tageOffset);
    setzen({ von: datum.toISOString().slice(0, 10) });
  }

  const heute = new Date().toISOString().slice(0, 10);

  return (
    <div className="karte nicht-drucken" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px' }}>
      <button type="button" className="knopf knopf-klein" onClick={() => verschieben(-tage)}>← Frueher</button>
      <input type="date" className="feld" value={von} onChange={(e) => setzen({ von: e.target.value })}
             style={{ width: 'auto' }} aria-label="Zeitraum ab" />
      <button type="button" className="knopf knopf-klein" onClick={() => verschieben(tage)}>Spaeter →</button>
      <button type="button" className="knopf knopf-klein" onClick={() => setzen({ von: heute })}>Heute</button>

      <span style={{ width: 1, height: 22, background: 'var(--linie)' }} aria-hidden />

      {[1, 3, 7, 14].map((anzahl) => (
        <button key={anzahl} type="button"
                className={`knopf knopf-klein${tage === anzahl ? ' knopf-primaer' : ''}`}
                onClick={() => setzen({ tage: String(anzahl) })}>
          {anzahl === 1 ? 'Tag' : `${anzahl} Tage`}
        </button>
      ))}

      <span style={{ width: 1, height: 22, background: 'var(--linie)' }} aria-hidden />

      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
        <input type="checkbox" checked={nurLuecken} onChange={(e) => setzen({ nur: e.target.checked ? 'luecken' : null })} />
        nur Events mit offenen Positionen
      </label>
    </div>
  );
}

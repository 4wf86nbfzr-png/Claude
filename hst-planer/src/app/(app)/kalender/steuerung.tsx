'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Ansicht, Datum und Filter des Kalenders (Spec 26). */
export function Kalendersteuerung({
  ansicht, datum, kunden, bereiche, mitarbeiter,
}: {
  ansicht: 'tag' | 'woche' | 'monat';
  datum: string;
  kunden: Array<{ id: string; name: string }>;
  bereiche: Array<{ id: string; name: string }>;
  mitarbeiter: Array<{ id: string; name: string }>;
}) {
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

  function springen(richtung: -1 | 1) {
    const d = new Date(`${datum}T00:00:00Z`);
    if (ansicht === 'tag') d.setUTCDate(d.getUTCDate() + richtung);
    else if (ansicht === 'woche') d.setUTCDate(d.getUTCDate() + 7 * richtung);
    else d.setUTCMonth(d.getUTCMonth() + richtung);
    setzen({ datum: d.toISOString().slice(0, 10) });
  }

  return (
    <div className="karte nicht-drucken" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '10px 14px' }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['tag', 'woche', 'monat'] as const).map((wert) => (
          <button key={wert} type="button"
                  className={`knopf knopf-klein${ansicht === wert ? ' knopf-primaer' : ''}`}
                  onClick={() => setzen({ ansicht: wert })}>
            {wert === 'tag' ? 'Tag' : wert === 'woche' ? 'Woche' : 'Monat'}
          </button>
        ))}
      </div>

      <button type="button" className="knopf knopf-klein" onClick={() => springen(-1)} aria-label="Zurück">←</button>
      <input type="date" className="feld" value={datum} onChange={(e) => setzen({ datum: e.target.value })} style={{ width: 'auto' }} aria-label="Datum" />
      <button type="button" className="knopf knopf-klein" onClick={() => springen(1)} aria-label="Weiter">→</button>
      <button type="button" className="knopf knopf-klein" onClick={() => setzen({ datum: new Date().toISOString().slice(0, 10) })}>Heute</button>

      <span style={{ flex: 1 }} />

      <select className="feld" style={{ width: 'auto' }} aria-label="Kunde" value={params.get('kunde') ?? ''} onChange={(e) => setzen({ kunde: e.target.value || null })}>
        <option value="">Kunde: alle</option>
        {kunden.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
      </select>
      <select className="feld" style={{ width: 'auto' }} aria-label="Bereich" value={params.get('bereich') ?? ''} onChange={(e) => setzen({ bereich: e.target.value || null })}>
        <option value="">Bereich: alle</option>
        {bereiche.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
      {mitarbeiter.length > 0 && (
        <select className="feld" style={{ width: 'auto' }} aria-label="Mitarbeiter" value={params.get('mitarbeiter') ?? ''} onChange={(e) => setzen({ mitarbeiter: e.target.value || null })}>
          <option value="">Mitarbeiter: alle</option>
          {mitarbeiter.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      )}
    </div>
  );
}

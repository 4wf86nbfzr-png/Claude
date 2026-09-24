'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const MONATE = ['Januar', 'Februar', 'Maerz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function Zeitraumfilter({ jahr, monat }: { jahr: number; monat: number }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const jetzt = new Date().getUTCFullYear();

  function setzen(aenderungen: Record<string, string>) {
    const neu = new URLSearchParams(params.toString());
    for (const [schluessel, wert] of Object.entries(aenderungen)) neu.set(schluessel, wert);
    router.replace(`${pfad}?${neu.toString()}`, { scroll: false });
  }

  function verschieben(richtung: -1 | 1) {
    const d = new Date(Date.UTC(jahr, monat - 1 + richtung, 1));
    setzen({ jahr: String(d.getUTCFullYear()), monat: String(d.getUTCMonth() + 1) });
  }

  return (
    <div className="karte nicht-drucken" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap' }}>
      <button type="button" className="knopf knopf-klein" onClick={() => verschieben(-1)}>← Vormonat</button>
      <select className="feld" style={{ width: 'auto' }} value={monat} onChange={(e) => setzen({ monat: e.target.value })} aria-label="Monat">
        {MONATE.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
      </select>
      <select className="feld" style={{ width: 'auto' }} value={jahr} onChange={(e) => setzen({ jahr: e.target.value })} aria-label="Jahr">
        {Array.from({ length: 6 }, (_, i) => jetzt - 4 + i).map((wert) => <option key={wert} value={wert}>{wert}</option>)}
      </select>
      <button type="button" className="knopf knopf-klein" onClick={() => verschieben(1)}>Folgemonat →</button>
      <button type="button" className="knopf knopf-klein" onClick={() => window.print()}>Drucken</button>
    </div>
  );
}

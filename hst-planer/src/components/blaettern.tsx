'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Seitenweises Blaettern (Spec 47/78). */
export function Blaettern({ seite, proSeite, gesamt }: { seite: number; proSeite: number; gesamt: number }) {
  const router = useRouter();
  const pfad = usePathname();
  const params = useSearchParams();
  const seiten = Math.max(1, Math.ceil(gesamt / proSeite));
  if (gesamt === 0) return null;

  function gehe(ziel: number) {
    const neu = new URLSearchParams(params.toString());
    if (ziel <= 1) neu.delete('seite'); else neu.set('seite', String(ziel));
    router.replace(`${pfad}?${neu.toString()}`, { scroll: false });
  }

  const von = (seite - 1) * proSeite + 1;
  const bis = Math.min(gesamt, seite * proSeite);

  return (
    <div className="nicht-drucken" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 14px', borderTop: '1px solid var(--linie)', flexWrap: 'wrap' }}>
      <span className="zahl" style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>
        {von.toLocaleString('de-DE')}–{bis.toLocaleString('de-DE')} von {gesamt.toLocaleString('de-DE')}
      </span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button className="knopf knopf-klein" disabled={seite <= 1} onClick={() => gehe(seite - 1)}>Zurueck</button>
        <span className="zahl" style={{ fontSize: 12, color: 'var(--text-sekundaer)' }}>Seite {seite} / {seiten}</span>
        <button className="knopf knopf-klein" disabled={seite >= seiten} onClick={() => gehe(seite + 1)}>Weiter</button>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { Zustand } from '../lib/store.js';

/**
 * Der Voice-Orb.
 *
 * Er bewegt sich nur, wenn es etwas zu zeigen gibt: beim Zuhören folgt er dem
 * Mikrofonpegel, beim Denken atmet er langsam, sonst steht er still. Kein
 * dauerhaft laufendes Leuchten.
 */
export function VoiceOrb({
  zustand,
  pegel,
  onKlick,
  aktiv,
}: {
  zustand: Zustand;
  /** 0..1, nur während der Aufnahme relevant. */
  pegel: number;
  onKlick: () => void;
  aktiv: boolean;
}): JSX.Element {
  const kernRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const kern = kernRef.current;
    const ring = ringRef.current;
    if (!kern || !ring) return;
    if (zustand !== 'LISTENING') {
      kern.style.transform = '';
      ring.style.transform = '';
      return;
    }
    const skalierung = 1 + pegel * 0.65;
    kern.style.transform = `scale(${skalierung.toFixed(3)})`;
    ring.style.transform = `scale(${(1 + pegel * 0.12).toFixed(3)})`;
  }, [pegel, zustand]);

  const beschriftung = aktiv ? 'Aufnahme beenden' : 'Sprechen';

  return (
    <button
      type="button"
      className="orb"
      data-zustand={zustand}
      onClick={onKlick}
      aria-label={beschriftung}
      title={`${beschriftung} (Leertaste halten)`}
    >
      <span className="orb__ring" ref={ringRef} aria-hidden="true" />
      <span className="orb__ring orb__ring--zwei" aria-hidden="true" />
      <span className="orb__kern" ref={kernRef} aria-hidden="true" />
    </button>
  );
}

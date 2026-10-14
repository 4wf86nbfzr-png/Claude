"use client";

import { useCallback, useRef, useState } from "react";

const Arrow = ({ dir }: { dir: -1 | 1 }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{dir < 0 ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}</svg>;

/** Karten-Karussell: die aktive Karte ist größer und dunkles Glas, die Nachbarn sind helle Karten.
 *  Pfeile, Punkte, Tastatur und Wischen wechseln. Inaktive Karten sind inert (nicht fokussierbar). */
export function TradesCarousel({ items }: { items: [string, string][] }) {
  const n = items.length;
  const [i, setI] = useState(0);
  const go = useCallback((d: 1 | -1) => setI((v) => (v + d + n) % n), [n]);
  const start = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => { start.current = e.clientX; };
  const onUp = (e: React.PointerEvent) => { if (start.current == null) return; const dx = e.clientX - start.current; start.current = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "ArrowRight") { e.preventDefault(); go(1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } };
  return (
    <div className="trades" role="region" aria-roledescription="Karussell" aria-label="Branchen" tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
      <div className="trades-track">
        {items.map(([t, d], j) => {
          const off = ((j - i + n + 1) % n) - 1; // -1 = links, 0 = aktiv, 1 = rechts, sonst verborgen
          const pos = off === -1 ? "is-prev" : off === 0 ? "is-active glass" : off === 1 ? "is-next" : "is-hidden";
          return (
            <article key={t} className={`trade-card ${pos}`} inert={off !== 0} aria-hidden={off !== 0}>
              <span className="mono text-xs opacity-70">0{j + 1}</span>
              <h3 className="mt-3 text-xl font-medium">{t}</h3>
              <p className="mt-3 text-sm leading-relaxed">{d}</p>
            </article>
          );
        })}
      </div>
      <div className="product-nav">
        <button type="button" className="btn-round" onClick={() => go(-1)} aria-label="Vorherige Branche"><Arrow dir={-1} /></button>
        <div className="flex items-center gap-2" role="tablist" aria-label="Branche wählen">
          {items.map(([t], j) => <button key={t} type="button" role="tab" aria-selected={j === i} aria-label={t} onClick={() => setI(j)} className={`dot ${j === i ? "is-on" : ""}`} />)}
        </div>
        <button type="button" className="btn-round" onClick={() => go(1)} aria-label="Nächste Branche"><Arrow dir={1} /></button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PLANS, PLAN_TERMS } from "@/lib/plans";
import { useNear, useReducedMotion } from "./fx/useNear";

const SphereRing = dynamic(() => import("./fx/SphereRing").then((m) => m.SphereRing), { ssr: false, loading: () => null });

const Cart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2" /><circle cx="9.5" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /></svg>;
const Arrow = ({ dir }: { dir: -1 | 1 }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{dir < 0 ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}</svg>;

/** Tarifauswahl im Stil einer Produktbühne: riesige gedimmte Typografie hinten, 3D-Kugelring als Produktbild,
 *  Glaskarte mit Preis und Knopf davor. Wischen, Pfeile, Punkte und Tastatur wechseln den Tarif. */
export function Products({ trialDays }: { trialDays: number }) {
  const root = useRef<HTMLDivElement>(null);
  const near = useNear(root, "40%");
  const reduced = useReducedMotion();
  const progress = useRef(0);
  const [i, setI] = useState(1);
  const [dir, setDir] = useState<1 | -1>(1);
  const go = useCallback((d: 1 | -1) => { setDir(d); setI((v) => (v + d + PLANS.length) % PLANS.length); }, []);
  const pick = (j: number) => { setDir(j > i ? 1 : -1); setI(j); };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      // Scroll dreht den Ring (Fortschritt 0..1 über die Sektion); die Glaskarte kommt sanft von unten.
      ScrollTrigger.create({ trigger: root.current, start: "top bottom", end: "bottom top", scrub: true, onUpdate: (self) => { progress.current = self.progress; } });
      gsap.fromTo(".product-card", { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: root.current, start: "top 70%", once: true } });
    }, root);
    return () => ctx.revert();
  }, []);

  // Wischen mit Finger oder Maus
  const start = useRef<number | null>(null);
  const onDown = (e: React.PointerEvent) => { start.current = e.clientX; };
  const onUp = (e: React.PointerEvent) => { if (start.current == null) return; const dx = e.clientX - start.current; start.current = null; if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "ArrowRight") { e.preventDefault(); go(1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } };

  const p = PLANS[i];
  return (
    <div ref={root} className="product" role="region" aria-roledescription="Karussell" aria-label="Tarife" tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
      <div className="product-type" aria-hidden><span key={p.code} className="product-word" data-dir={dir}>{p.name}</span></div>
      <div className="product-stage">
        {near && !reduced ? <SphereRing variant={i} progress={progress} className="h-full w-full" /> : <div className="product-still" />}
      </div>
      <div key={p.code} className="glass product-card" data-dir={dir} aria-live="polite">
        <div className="flex items-center justify-between gap-3">
          <span className="eyebrow">Tarif {i + 1} von {PLANS.length}</span>
          {p.hot && <span className="pill-tag !py-1 !text-xs">Empfehlung für Betriebe mit Büro</span>}
        </div>
        <h3 className="display mt-3 text-4xl">{p.name}</h3>
        <p className="mt-1 text-sm text-ink-2">{p.for}</p>
        <ul className="mt-5 divide-y divide-[rgba(255,255,255,0.12)] border-t border-[rgba(255,255,255,0.12)] text-sm text-ink-2">
          {p.highlights.map((h) => <li key={h} className="py-2">{h}</li>)}
        </ul>
        <div className="mt-6 flex items-baseline justify-between">
          <span className="text-lg text-ink">Preis</span>
          <span className="text-4xl font-medium text-ink">{p.priceEur} €<span className="ml-2 text-sm font-light text-ink-2">im Monat</span></span>
        </div>
        <Link href={`/registrieren?tarif=${p.code}`} className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium"><Cart /> Tarif wählen, Testphase starten</Link>
        <p className="mt-3 text-center text-xs text-ink-2">{trialDays} Tage kostenlos ohne Zahlungsdaten. {PLAN_TERMS.vat} Monatlich kündbar.</p>
      </div>
      <div className="product-nav">
        <button type="button" className="btn-round" onClick={() => go(-1)} aria-label="Vorheriger Tarif"><Arrow dir={-1} /></button>
        <div className="flex items-center gap-2" role="tablist" aria-label="Tarif wählen">
          {PLANS.map((q, j) => <button key={q.code} type="button" role="tab" aria-selected={j === i} aria-label={q.name} onClick={() => pick(j)} className={`dot ${j === i ? "is-on" : ""}`} />)}
        </div>
        <button type="button" className="btn-round" onClick={() => go(1)} aria-label="Nächster Tarif"><Arrow dir={1} /></button>
      </div>
    </div>
  );
}

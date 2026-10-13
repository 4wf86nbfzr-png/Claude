"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SCREENS, Screens } from "./Screens";

const TILE_W = 560, TILE_H = 350, GAP_X = 120, GAP_Y = 110, COLS = 3;
const pos = (i: number) => ({ x: (i % COLS) * (TILE_W + GAP_X), y: Math.floor(i / COLS) * (TILE_H + GAP_Y) });

/** Digitale Reise in isometrischer Perspektive: die echten Bildschirme liegen als Kacheln auf einer
 *  Fläche, die Kamera fährt beim Scrollen von Station zu Station. Die Reiter springen direkt dorthin.
 *  Auf kleinen Bildschirmen und bei reduzierter Bewegung: die Reiteransicht. */
export function IsoJourney() {
  const [mode, setMode] = useState<"tabs" | "iso">("tabs");
  const root = useRef<HTMLElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const captions = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const st = useRef<ScrollTrigger | null>(null);
  const activeRef = useRef(0);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    const ok = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && window.matchMedia("(min-width: 1024px)").matches;
    queueMicrotask(() => setMode(ok ? "iso" : "tabs"));
  }, []);

  useEffect(() => {
    if (mode !== "iso" || !root.current || !board.current) return;
    gsap.registerPlugin(ScrollTrigger);
    const n = SCREENS.length;
    const setActive = (i: number) => {
      if (i === activeRef.current) return;
      activeRef.current = i;
      Array.from(board.current!.children).forEach((c, j) => c.classList.toggle("is-on", j === i));
      Array.from(captions.current!.children).forEach((c, j) => { if (!c.classList.contains("iso-caption")) return; c.classList.toggle("is-on", j === i); c.toggleAttribute("inert", j !== i); });
      Array.from(tabs.current!.children).forEach((c, j) => { c.classList.toggle("is-active", j === i); c.setAttribute("aria-selected", String(j === i)); });
    };
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power1.inOut" } });
      const p0 = pos(0);
      gsap.set(board.current, { x: -(p0.x + TILE_W / 2), y: -(p0.y + TILE_H / 2) });
      for (let i = 1; i < n; i++) { const p = pos(i); tl.to(board.current, { x: -(p.x + TILE_W / 2), y: -(p.y + TILE_H / 2), duration: 1 }); }
      st.current = ScrollTrigger.create({
        trigger: root.current, start: "top top", end: "+=" + (n - 1) * 90 + "%", pin: ".iso-pin", scrub: 0.4, anticipatePin: 1, animation: tl,
        onUpdate: (self) => setActive(Math.min(n - 1, Math.round(self.progress * (n - 1)))),
      });
      Array.from(board.current!.children)[0]?.classList.add("is-on");
      Array.from(captions.current!.children)[0]?.classList.add("is-on");
    }, root);
    // Dieser Pin entsteht nach den anderen (erst nach dem Moduswechsel): sortieren, dann neu messen, sonst rechnet z. B. der Story-Pin mit veralteten Positionen.
    ScrollTrigger.sort();
    ScrollTrigger.refresh();
    return () => { ctx.revert(); st.current = null; };
  }, [mode]);

  const jump = (i: number) => {
    const s = st.current; if (!s) return;
    window.scrollTo({ top: s.start + (i / (SCREENS.length - 1)) * (s.end - s.start), behavior: "smooth" });
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") jump(Math.min(SCREENS.length - 1, activeRef.current + 1));
    if (e.key === "ArrowLeft") jump(Math.max(0, activeRef.current - 1));
  };
  useEffect(() => {
    if (zoom === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [zoom]);

  if (mode === "tabs") return <Screens />;
  const z = zoom === null ? null : SCREENS[zoom];
  return (
    <section ref={root} id="einblick" className="iso relative" aria-label="Einblick ins System">
      <div className="iso-pin relative min-h-[100svh] overflow-hidden">
        <div className="relative z-10 mx-auto max-w-7xl px-5 pt-24">
          <p className="eyebrow mb-3">Einblick ins System</p>
          <h2 className="display max-w-3xl text-4xl md:text-5xl">Eine Reise durch Clairify.</h2>
          <div ref={tabs} className="tabs mt-6" role="tablist" aria-label="Stationen" onKeyDown={onTabKey}>
            {SCREENS.map((s, i) => <button key={s.key} role="tab" aria-selected={i === 0} className={`tab ${i === 0 ? "is-active" : ""}`} onClick={() => jump(i)}>{s.label}</button>)}
          </div>
        </div>
        <div className="iso-stage" aria-hidden>
          <div className="iso-rot">
            <div ref={board} className="iso-board">
              {SCREENS.map((s, i) => { const p = pos(i); return (
                <button key={s.key} type="button" className="iso-tile" style={{ left: p.x, top: p.y, width: TILE_W, height: TILE_H }} onClick={() => setZoom(i)} tabIndex={-1}>
                  <picture><source type="image/webp" srcSet={`/screens/${s.file}-1080.webp 1080w, /screens/${s.file}-2160.webp 2160w`} sizes="(min-width: 1024px) 560px, 100vw" /><img src={`/screens/${s.file}.png`} alt="" width={2160} height={1350} loading="lazy" decoding="async" /></picture>
                  <span className="iso-label">{s.label}</span>
                </button>
              ); })}
            </div>
          </div>
        </div>
        <div ref={captions} className="iso-captions">
          {SCREENS.map((s, i) => (
            <div key={s.key} className="iso-caption" inert={i !== 0}>
              <h3 className="text-2xl font-semibold md:text-[1.7rem]">{s.title}</h3>
              <p className="mt-3 text-ink-2 md:text-[15px]">{s.text}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" className="btn-secondary rounded-full px-5 py-2.5 text-sm font-medium" onClick={() => setZoom(i)}>Bildschirm vergrößern</button>
                <a href="/registrieren" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">Testkonto anlegen</a>
              </div>
            </div>
          ))}
          <p className="iso-note">Echte Bildschirme aus dem Testbetrieb mit Beispieldaten, ohne angebundenen KI Anbieter. Unten können Sie eine Anfrage selbst eingeben.</p>
        </div>
      </div>
      {z && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${z.label}, vergrößert`} onClick={() => setZoom(null)}>
          <button type="button" className="lightbox-close" onClick={() => setZoom(null)} aria-label="Schließen" autoFocus>×</button>
          <picture onClick={(e) => e.stopPropagation()}><source type="image/webp" srcSet={`/screens/${z.file}-2160.webp`} /><img src={`/screens/${z.file}.png`} alt={`Dashboard, Bereich ${z.label}: ${z.title}`} /></picture>
        </div>
      )}
    </section>
  );
}

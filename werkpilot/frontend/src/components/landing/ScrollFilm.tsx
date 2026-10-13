"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Szenen des Films (Sekunden im geschnittenen Master, inkl. Überblendungen) mit je einem Satz dazu.
   Keine Versprechen, nur das, was das Produkt heute tut. */
export const FILM_SCENES = [
  { from: 0, to: 2.9, k: "Morgens", t: "Die Anfragen der Nacht sind sortiert. Dringendes steht oben." },
  { from: 2.9, to: 5.6, k: "Haustür", t: "Der Laptop bleibt zu Hause. Der Posteingang passt aufs Handy." },
  { from: 5.6, to: 8.5, k: "Kurz überlegt", t: "Kein Abend im Büro. Die Entwürfe warten, bis Sie Zeit haben." },
  { from: 8.5, to: 11.6, k: "Baustelle", t: "Terminvorschläge gehen raus, der Kunde bestätigt per Link." },
  { from: 11.6, to: 15.8, k: "Mittagspause", t: "Ein Blick in die Mails, freigeben, fertig." },
];
const DURATION = 15.8;

/** Immersives Scroll-Video: der Film wird mit dem Scrollen abgespielt, Satz für Satz.
 *  Bei reduzierter Bewegung oder auf kleinen Bildschirmen: Standbild und die Sätze als Liste. */
export function ScrollFilm() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const el = root.current!;
    if (reduced || !desktop) { el.classList.add("is-static"); return; }
    const v = video.current!;
    v.load();
    gsap.registerPlugin(ScrollTrigger);
    let last = -1;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el, start: "top top", end: "+=320%", pin: ".film-pin", scrub: true, anticipatePin: 1,
        onUpdate: (self) => {
          const t = self.progress * DURATION;
          if (v.readyState >= 1 && Math.abs(t - last) > 1 / 30) { v.currentTime = Math.min(t, DURATION - 0.05); last = t; }
          const items = lines.current?.children;
          if (items) FILM_SCENES.forEach((s, i) => items[i]?.classList.toggle("is-on", t >= s.from && t < s.to));
        },
      });
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <section ref={root} id="tag" className="film relative" aria-label="Ein Arbeitstag mit Clairify">
      <div className="film-pin relative min-h-[100svh] overflow-hidden">
        <video ref={video} className="film-video" muted playsInline preload="none" poster="/video/poster-1080.jpg" aria-hidden>
          <source src="/video/clairify-scrub-720.webm" type="video/webm" />
          <source src="/video/clairify-scrub-720.mp4" type="video/mp4" />
        </video>
        <div className="film-shade" aria-hidden />
        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-5 pb-20 pt-32">
          <p className="eyebrow mb-4">Ein Arbeitstag, Schritt für Schritt</p>
          <h2 className="display max-w-3xl text-4xl md:text-5xl">Scrollen Sie durch den Tag.</h2>
          <div ref={lines} className="film-lines mt-8" aria-live="polite">
            {FILM_SCENES.map((s, i) => (
              <p key={s.k} className={`film-line ${i === 0 ? "is-on" : ""}`}><span className="film-k">{s.k}</span><span className="film-t">{s.t}</span></p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

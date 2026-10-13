"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const HEADLINE = "Ein Arbeitstag auf der Baustelle. Die Anfragen beantwortet Clairify.";

/** Wählt die Videogröße nach Bildschirm und Verbindung: 4K nur für große Bildschirme ohne Datensparmodus. */
function pickVariant(): 2160 | 1080 | 720 {
  const w = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && /2g|3g/.test(conn.effectiveType))) return 720;
  if (w >= 2200) return 2160;
  if (w >= 1000) return 1080;
  return 720;
}

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [variant, setVariant] = useState<2160 | 1080 | 720 | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { queueMicrotask(() => setPlaying(false)); return; }
    queueMicrotask(() => setVariant(pickVariant()));
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(".word", { y: 40, opacity: 0, rotateX: -35 }, { y: 0, opacity: 1, rotateX: 0, duration: 1.1, stagger: 0.05, ease: "power3.out", delay: 0.2 });
      gsap.fromTo(".hero-sub", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power2.out", delay: 0.9 });
      gsap.fromTo(".hero-cta", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out", delay: 1.15 });
      gsap.fromTo(".hero-media", { yPercent: 0 }, { yPercent: 18, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      gsap.fromTo(".hero-copy", { yPercent: 0, opacity: 1 }, { yPercent: -12, opacity: 0.25, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
    }, root);
    return () => ctx.revert();
  }, []);
  useEffect(() => { if (variant && video.current) { video.current.load(); video.current.play().catch(() => undefined); } }, [variant]);
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  const posterSize = variant === 720 ? 720 : variant === 2160 ? 2160 : 1080;
  return (
    <section ref={root} className="relative flex min-h-[100svh] items-end overflow-hidden" aria-label="Einstieg">
      <div className="hero-media absolute inset-0" aria-hidden>
        {/* Das Video läuft stumm in Endlosschleife. Bei reduzierter Bewegung bleibt nur das Standbild. */}
        <video ref={video} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster={`/video/poster-${posterSize}.jpg`}>
          {variant && <source src={`/video/clairify-${variant}.webm`} type="video/webm" />}
          {variant && <source src={`/video/clairify-${variant}.mp4`} type="video/mp4" />}
        </video>
        <div className="hero-shade" />
      </div>
      <div className="hero-copy relative mx-auto w-full max-w-7xl px-5 pb-20 pt-40 md:pb-28">
        <p className="eyebrow mb-5">Für Elektro, Sanitär und Heizung, Maler, Dach, Reinigung und Gartenbau</p>
        <h1 className="display max-w-4xl text-[2.5rem] sm:text-6xl md:text-7xl lg:text-[5rem]" style={{ perspective: "800px" }}>
          {HEADLINE.split(" ").map((w, i) => <span key={i} className="word mr-[0.26em]">{w}</span>)}
        </h1>
        <p className="hero-sub mt-7 max-w-2xl text-lg text-ink-2 md:text-xl">Clairify sammelt die Anfragen aus Mail und Website, sortiert sie nach Dringlichkeit und legt fertige Antwortentwürfe mit Terminvorschlägen vor. Sie prüfen und geben frei. Offene Angebote werden nachgefasst, während Sie draußen sind.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/registrieren" className="hero-cta btn-primary rounded-full px-6 py-3 text-sm font-semibold">14 Tage kostenlos testen</Link>
          <a href="#demo" className="hero-cta btn-secondary rounded-full px-6 py-3 text-sm font-medium">Demo ausprobieren</a>
          <span className="hero-cta text-sm text-ink-2">Ohne Kreditkarte, Daten in der EU, monatlich kündbar</span>
        </div>
      </div>
      <button onClick={toggle} aria-pressed={!playing} className="absolute bottom-6 right-5 rounded-full bg-black/35 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/60">{playing ? "Video anhalten" : "Video abspielen"}</button>
      <a href="#ablauf" className="scroll-cue absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-xs text-ink-2 md:block" aria-label="Weiter scrollen">↓ scrollen</a>
    </section>
  );
}

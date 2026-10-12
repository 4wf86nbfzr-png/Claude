"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const HEADLINE = "Kundenanfragen beantworten, während Sie auf der Baustelle stehen.";

export function Hero() {
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { video.current?.pause(); queueMicrotask(() => setPlaying(false)); return; }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(".word", { y: 40, opacity: 0, rotateX: -35 }, { y: 0, opacity: 1, rotateX: 0, duration: 1.1, stagger: 0.05, ease: "power3.out", delay: 0.2 });
      gsap.fromTo(".hero-sub", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power2.out", delay: 0.9 });
      gsap.fromTo(".hero-cta", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out", delay: 1.15 });
      // Parallaxe: Video und Text bewegen sich beim Scrollen leicht gegeneinander
      gsap.fromTo(".hero-media", { yPercent: 0 }, { yPercent: 18, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      gsap.fromTo(".hero-copy", { yPercent: 0, opacity: 1 }, { yPercent: -12, opacity: 0.25, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
    }, root);
    return () => ctx.revert();
  }, []);
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  return (
    <section ref={root} className="relative flex min-h-[100svh] items-end overflow-hidden grain" aria-label="Einstieg">
      <div className="hero-media absolute inset-0" aria-hidden>
        <video ref={video} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster="/video/poster.jpg">
          <source src="/video/werkpilot-loop.webm" type="video/webm" />
        </video>
        <div className="hero-shade" />
      </div>
      <div className="hero-copy relative mx-auto w-full max-w-7xl px-5 pb-20 pt-40 md:pb-28">
        <p className="eyebrow mb-5">KI-Posteingang für Elektro · SHK · Maler · Dach · Reinigung · GaLaBau</p>
        <h1 className="display max-w-5xl text-[2.6rem] text-white sm:text-6xl md:text-7xl lg:text-[5.4rem]" style={{ perspective: "800px" }}>
          {HEADLINE.split(" ").map((w, i) => <span key={i} className="word mr-[0.26em]">{w}</span>)}
        </h1>
        <p className="hero-sub mt-7 max-w-2xl text-lg text-ink-2 md:text-xl">WerkPilot sammelt Anfragen aus E-Mail und Website, sortiert sie nach Dringlichkeit und legt fertige Antwortentwürfe mit Terminvorschlägen vor. Sie prüfen, geben frei, fertig. Offene Angebote werden automatisch nachgefasst.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/registrieren" className="hero-cta rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-accent-2 hover:text-white">14 Tage kostenlos testen</Link>
          <a href="#demo" className="hero-cta rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white backdrop-blur hover:border-white/60">Demo live ausprobieren</a>
          <span className="hero-cta text-sm text-muted">Ohne Kreditkarte · Daten in der EU · monatlich kündbar</span>
        </div>
      </div>
      <button onClick={toggle} aria-pressed={!playing} className="absolute bottom-6 right-5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-xs text-white backdrop-blur hover:border-white/50">{playing ? "Video anhalten" : "Video abspielen"}</button>
      <a href="#ablauf" className="scroll-cue absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-xs text-muted md:block" aria-label="Weiter scrollen">↓ scrollen</a>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePublicConfig } from "@/lib/public-config";

const HEADLINE_LINES = ["Draußen arbeiten.", "Im Büro nichts", "mehr verpassen."];
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

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
  const [time, setTime] = useState<{ t: number; d: number }>({ t: 0, d: 0 });
  const [variant, setVariant] = useState<2160 | 1080 | 720 | null>(null);
  const cfg = usePublicConfig();
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
  /** Fehlt eine Fassung (z. B. 4K im Testpaket), eine Stufe kleiner laden; am Ende bleibt das Poster. */
  const onVideoError = () => setVariant((v) => (v === 2160 ? 1080 : v === 1080 ? 720 : v));
  const onTime = () => { const v = video.current; if (v && v.duration) setTime({ t: v.currentTime, d: v.duration }); };
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  return (
    <section ref={root} className="relative flex min-h-[100svh] items-end overflow-hidden" aria-label="Einstieg">
      <div className="hero-media absolute inset-0" aria-hidden>
        {/* Das Video läuft stumm in Endlosschleife. Bei reduzierter Bewegung bleibt nur das Standbild. */}
        <video ref={video} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster="/video/poster-1080.webp" onError={onVideoError} onTimeUpdate={onTime} onLoadedMetadata={onTime}>
          {variant && <source src={`/video/clairify-${variant}.webm`} type="video/webm" />}
          {variant && <source src={`/video/clairify-${variant}.mp4`} type="video/mp4" onError={onVideoError} />}
        </video>
        <div className="hero-shade" />
      </div>
      <div className="hero-copy relative z-[2] mx-auto w-full max-w-7xl px-5 pb-32 pt-36 md:pb-32 md:pt-40">
        <p className="mb-7"><span className="pill-tag">Für Elektro, Sanitär und Heizung, Maler, Dach, Reinigung und Gartenbau</span></p>
        <h1 className="display display-xl max-w-5xl text-[2.9rem] sm:text-6xl md:text-7xl lg:text-[6.6rem]" style={{ perspective: "800px" }}>
          {HEADLINE_LINES.map((line, li) => (
            <span key={li} className="block">
              {line.split(" ").map((w, i) => <span key={i} className="word mr-[0.22em]">{w}</span>)}
            </span>
          ))}
        </h1>
        <p className="hero-sub mt-8 max-w-2xl text-lg text-ink-2 md:text-xl">Clairify bündelt Kundenanfragen aus Mail und Website an einem Ort, erkennt Dringendes und legt fertige Antwortentwürfe vor. Sie prüfen auf dem Handy und geben frei. Nichts geht ohne Ihre Freigabe raus.</p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/registrieren" className="hero-cta btn-primary rounded-full px-6 py-3 text-sm font-semibold">Kostenlos testen</Link>
          <a href="#demo" className="hero-cta btn-secondary rounded-full px-6 py-3 text-sm font-medium">Produktdemo ansehen</a>
          {/* Nur belegbare Zusagen: Testphase ohne Zahlungsdaten ist immer so; „monatlich kündbar" erst, wenn die Abrechnung aktiv ist. */}
          <span className="hero-cta text-sm text-ink-2">{cfg ? `${cfg.trial_days} Tage kostenlos` : "Kostenlos testen"}, keine Zahlungsdaten nötig{cfg?.stripe_ready ? ", monatlich kündbar" : ""}</span>
        </div>
      </div>
      {/* Zeitleiste des Films: Laufzeit und Position, nur auf größeren Bildschirmen */}
      {time.d > 0 && (
        <div className="hero-timeline hidden md:block" aria-hidden>
          <span className="tl-t tl-top">{fmt(time.t)}</span>
          <span className="tl-dot" style={{ top: `${(time.t / time.d) * 100}%` }} />
          <span className="tl-t tl-bottom">{fmt(time.d)}</span>
        </div>
      )}
      <button onClick={toggle} aria-pressed={!playing} aria-label={playing ? "Video anhalten" : "Video abspielen"} className="vid-btn absolute bottom-6 right-5 z-[2]">
        {playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>}
      </button>
      <a href="#ablauf" className="scroll-cue mono absolute bottom-7 left-1/2 z-[2] hidden -translate-x-1/2 text-xs text-ink-2 md:block" aria-label="Weiter scrollen">↓ scrollen</a>
    </section>
  );
}

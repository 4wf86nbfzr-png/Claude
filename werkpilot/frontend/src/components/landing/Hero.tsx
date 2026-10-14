"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const disp = useRef<SVGFEDisplacementMapElement>(null);
  const blur = useRef<SVGFEGaussianBlurElement>(null);
  const banner = useRef<HTMLDivElement>(null);
  const lastBurst = useRef(0);
  /** Kurzer Liquify-/Bewegungsunschärfe-Impuls auf dem Banner (Referenz: High-Contrast Motion). Filter nur während des Impulses aktiv. */
  const burst = useCallback((strength = 1) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const now = performance.now(); if (now - lastBurst.current < 900) return; lastBurst.current = now;
    const d = disp.current, b = blur.current, el = banner.current; if (!d || !b || !el) return;
    el.classList.add("is-glitch");
    const o = { s: 0, x: 0 };
    gsap.timeline({ onUpdate: () => { d.setAttribute("scale", String(o.s)); b.setAttribute("stdDeviation", `${o.x} 0`); }, onComplete: () => { el.classList.remove("is-glitch"); d.setAttribute("scale", "0"); b.setAttribute("stdDeviation", "0 0"); } })
      .to(o, { s: 34 * strength, x: 16 * strength, duration: 0.16, ease: "power2.out" })
      .to(o, { s: 0, x: 0, duration: 0.55, ease: "power3.out" });
  }, []);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { queueMicrotask(() => setPlaying(false)); return; }
    queueMicrotask(() => setVariant(pickVariant()));
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(".word", { y: 40, opacity: 0, rotateX: -35 }, { y: 0, opacity: 1, rotateX: 0, duration: 1.1, stagger: 0.05, ease: "power3.out", delay: 0.2 });
      gsap.fromTo(".hero-sub", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: "power2.out", delay: 0.9 });
      gsap.fromTo(".hero-cta", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out", delay: 1.15 });
      gsap.fromTo(".hero-media", { yPercent: 0 }, { yPercent: 8, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      ScrollTrigger.create({ trigger: root.current, start: "top top", end: "bottom top", onUpdate: (self) => { if (Math.abs(self.getVelocity()) > 2200) burst(0.7); } });
      gsap.fromTo(".hero-copy", { yPercent: 0, opacity: 1 }, { yPercent: 14, opacity: 0.6, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
    }, root);
    return () => ctx.revert();
  }, [burst]);
  useEffect(() => { if (variant && video.current) { video.current.load(); video.current.play().catch(() => undefined); } }, [variant]);
  /** Fehlt eine Fassung (z. B. 4K im Testpaket), eine Stufe kleiner laden; am Ende bleibt das Poster. */
  const onVideoError = () => setVariant((v) => (v === 2160 ? 1080 : v === 1080 ? 720 : v));
  const onTime = () => { const v = video.current; if (v && v.duration) setTime({ t: v.currentTime, d: v.duration }); };
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  return (
    <section ref={root} className="relative overflow-hidden pt-24 md:pt-28" aria-label="Einstieg">
      {/* Headline liegt über dem Banner und überlappt seinen oberen Rand (Layout der Referenz); .word bleibt für die GSAP-Animation */}
      <div className="hero-copy relative z-[3] mx-auto w-full max-w-[96rem]">
        <h1 className="hero-title display display-xl text-[2.9rem] sm:text-6xl md:text-[6.4rem] lg:text-[8.4rem] xl:text-[9.6rem]" style={{ perspective: "800px" }}>
          {HEADLINE_LINES.map((line, li) => (
            <span key={li} className={`block ${li === 0 ? "" : "text-[0.62em]"}`}>
              {line.split(" ").map((w, i) => <span key={i} className="word mr-[0.22em]">{w}</span>)}
            </span>
          ))}
        </h1>
      </div>
      <div className="relative mx-auto w-full max-w-[96rem] px-5">
        <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
          <filter id="hero-glitch" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.35" numOctaves="2" seed="3" result="n" />
            <feDisplacementMap ref={disp} in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur ref={blur} in="d" stdDeviation="0 0" />
          </filter>
        </svg>
        <div ref={banner} className="hero-media hero-banner" onPointerEnter={() => burst(1)}>
          {/* Das Video läuft stumm in Endlosschleife. Bei reduzierter Bewegung bleibt nur das Standbild. */}
          <video ref={video} className="hero-video" autoPlay muted loop playsInline preload="metadata" poster="/video/poster-1080.webp" onError={onVideoError} onTimeUpdate={onTime} onLoadedMetadata={onTime}>
            {variant && <source src={`/video/clairify-${variant}.webm`} type="video/webm" />}
            {variant && <source src={`/video/clairify-${variant}.mp4`} type="video/mp4" onError={onVideoError} />}
          </video>
          <div className="hero-shade" aria-hidden />
          {/* Runder Outline-Knopf links, Subtext rechts, wie im Referenzbanner */}
          <div className="absolute inset-x-0 bottom-0 top-0 z-[2] flex flex-col justify-end gap-6 p-5 md:flex-row md:items-center md:justify-between md:p-10">
            <a href="#demo" className="hero-cta btn-circle">Produktdemo<br />ansehen</a>
            <p className="hero-sub max-w-xs text-right text-[13px] leading-relaxed text-ink md:max-w-sm md:pr-14 md:text-sm" style={{ textShadow: "0 1px 18px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.8)" }}>Clairify bündelt Kundenanfragen aus Mail und Website an einem Ort, erkennt Dringendes und legt fertige Antwortentwürfe vor. Sie prüfen auf dem Handy und geben frei. Nichts geht ohne Ihre Freigabe raus.</p>
          </div>
          {/* Zeitleiste des Films: Laufzeit und Position, nur auf größeren Bildschirmen */}
          {time.d > 0 && (
            <div className="hero-timeline hidden md:block" aria-hidden>
              <span className="tl-t tl-top">{fmt(time.t)}</span>
              <span className="tl-dot" style={{ top: `${(time.t / time.d) * 100}%` }} />
              <span className="tl-t tl-bottom">{fmt(time.d)}</span>
            </div>
          )}
          <button onClick={toggle} aria-pressed={!playing} aria-label={playing ? "Video anhalten" : "Video abspielen"} className="vid-btn absolute right-4 top-4 z-[3] md:right-5 md:top-5">
            {playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>}
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pb-6 md:mt-8">
          <p><span className="pill-tag">Für Elektro, Sanitär und Heizung, Maler, Dach, Reinigung und Gartenbau</span></p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/registrieren" className="hero-cta btn-primary rounded-full px-6 py-3 text-sm font-medium">Kostenlos testen</Link>
            {/* Nur belegbare Zusagen: Testphase ohne Zahlungsdaten ist immer so; „monatlich kündbar" erst, wenn die Abrechnung aktiv ist. */}
            <span className="hero-cta text-sm text-ink-2">{cfg ? `${cfg.trial_days} Tage kostenlos` : "Kostenlos testen"}, keine Zahlungsdaten nötig{cfg?.stripe_ready ? ", monatlich kündbar" : ""}</span>
          </div>
        </div>
      </div>
      <a href="#ablauf" className="scroll-cue mono mx-auto mb-2 hidden w-max text-xs text-ink md:block" aria-label="Weiter scrollen">↓ scrollen</a>
    </section>
  );
}

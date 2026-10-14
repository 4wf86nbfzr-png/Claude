"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { preload } from "react-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePublicConfig } from "@/lib/public-config";

/* Vier Zeilen wie im Referenzbild; „Draußen" bleibt für Vorleser so geschrieben, die Versalform (DRAUSSEN) kommt aus CSS. */
export const HEADLINE_LINES = ["Draußen", "arbeiten.", "Im Büro nichts mehr", "verpassen."];
export const HERO_TEXT = "Clairify bündelt Kundenanfragen aus Mail und Website an einem Ort, erkennt Dringendes und legt fertige Antwortentwürfe vor. Sie prüfen auf dem Handy und geben frei. Nichts geht ohne Ihre Freigabe raus.";

/** Wählt die Videogröße nach Bildschirm und Verbindung: 4K nur für große Bildschirme ohne Datensparmodus. */
function pickVariant(): 2160 | 1080 | 720 {
  const w = window.innerWidth * Math.min(window.devicePixelRatio || 1, 2);
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || (conn?.effectiveType && /2g|3g/.test(conn.effectiveType))) return 720;
  if (w >= 2200) return 2160;
  if (w >= 1000) return 1080;
  return 720;
}

/** Schwache Geräte bekommen nur das Standbild: Datensparmodus, sehr wenige Kerne oder reduzierte Bewegung. */
function wantsStill(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  return false;
}

export function Hero() {
  // Die Person ist das größte Bild im ersten Viewport: früh anfordern, bevor das Skript sie einblendet
  preload("/img/hero-person.webp", { as: "image", fetchPriority: "high" });
  const root = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [variant, setVariant] = useState<2160 | 1080 | 720 | null>(null);
  const cfg = usePublicConfig();
  useEffect(() => {
    if (wantsStill()) { queueMicrotask(() => setPlaying(false)); return; }
    queueMicrotask(() => setVariant(pickVariant()));
    gsap.registerPlugin(ScrollTrigger);
    const introRunning = document.documentElement.classList.contains("intro-run");
    const ctx = gsap.context(() => {
      // Ohne Intro (zweiter Aufruf in der Sitzung): kurzer, ruhiger Einstieg. Mit Intro übernimmt Intro.tsx die Einblendung.
      if (!introRunning) {
        gsap.fromTo(".hero-title .line-in", { yPercent: 110 }, { yPercent: 0, duration: 0.9, stagger: 0.09, ease: "power4.out", delay: 0.1, clearProps: "transform" });
        gsap.fromTo(".hero-fade", { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.07, ease: "power2.out", delay: 0.45, clearProps: "all" });
      }
      // Dezente Parallaxe: Film und Person laufen beim Scrollen minimal langsamer als der Text
      gsap.fromTo(".hero-film", { yPercent: 0 }, { yPercent: 10, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      gsap.fromTo(".hero-person", { yPercent: 0 }, { yPercent: 6, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
      gsap.fromTo(".hero-copy", { yPercent: 0, opacity: 1 }, { yPercent: 12, opacity: 0.5, ease: "none", immediateRender: false, scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true, invalidateOnRefresh: true } });
    }, root);
    return () => ctx.revert();
  }, []);
  useEffect(() => { if (variant && video.current) { video.current.load(); video.current.play().catch(() => undefined); } }, [variant]);
  /** Fehlt eine Fassung (z. B. 4K im Testpaket), eine Stufe kleiner laden; am Ende bleibt das Poster. */
  const onVideoError = () => setVariant((v) => (v === 2160 ? 1080 : v === 1080 ? 720 : v));
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); } };
  return (
    <section ref={root} id="top" className="hero dark" aria-label="Einstieg">
      <div className="hero-bg" aria-hidden>
        {/* Der vorhandene Imagefilm läuft stumm in Endlosschleife hinter der ganzen Komposition; bei reduzierter Bewegung bleibt das Standbild. */}
        <video ref={video} className="hero-film" autoPlay muted loop playsInline preload="metadata" poster="/video/poster-1080.webp" onError={onVideoError}>
          {variant && <source src={`/video/clairify-${variant}.webm`} type="video/webm" />}
          {variant && <source src={`/video/clairify-${variant}.mp4`} type="video/mp4" onError={onVideoError} />}
        </video>
        <div className="hero-overlay" />
        <div className="hero-vignette" />
      </div>
      {/* Person aus dem Referenzbild, freigestellt; der linke Rand läuft über eine Maske weich in den Film aus */}
      <picture className="hero-person">
        <source srcSet="/img/hero-person-640.webp 365w, /img/hero-person.webp 730w" sizes="(max-width: 767px) 60vw, 730px" type="image/webp" />
        <img src="/img/hero-person.png" alt="" width={730} height={1295} fetchPriority="high" decoding="async" />
      </picture>
      <div className="hero-content">
        <div className="hero-copy">
          <p className="hero-eyebrow eyebrow hero-fade"><span className="hero-rule" aria-hidden />Mehr Zeit für das Wesentliche</p>
          <h1 className="hero-title display">
            {HEADLINE_LINES.map((line) => <span key={line} className="line"><span className="line-in">{line}</span></span>)}
          </h1>
          <p className="hero-sub hero-fade">{HERO_TEXT}</p>
          <div className="hero-ctas">
            <Link href="/registrieren" className="hero-fade btn-primary btn-arrow">Kostenlos testen <span className="arr" aria-hidden>→</span></Link>
            <a href="#demo" className="hero-fade btn-play"><span className="play-circle" aria-hidden><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7.5-4.5z" fill="currentColor" /></svg></span>Produktdemo ansehen</a>
          </div>
          {/* Nur belegbare Zusagen: Testphase ohne Zahlungsdaten ist immer so; „monatlich kündbar" erst, wenn die Abrechnung aktiv ist. */}
          <p className="hero-trust hero-fade">{cfg ? `${cfg.trial_days} Tage kostenlos` : "Kostenlos testen"}, keine Zahlungsdaten nötig{cfg?.stripe_ready ? ", monatlich kündbar" : ""}.</p>
          <p className="hero-tags hero-fade"><span className="pill-tag">Für Elektro, Sanitär und Heizung, Maler, Dach, Reinigung und Gartenbau</span></p>
        </div>
      </div>
      <button onClick={toggle} aria-pressed={!playing} aria-label={playing ? "Video anhalten" : "Video abspielen"} className="vid-btn">
        {playing ? <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="2" y="1" width="3.5" height="12" fill="currentColor" /><rect x="8.5" y="1" width="3.5" height="12" fill="currentColor" /></svg> : <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>}
      </button>
      <a href="#produkt" className="scroll-cue mono hidden text-xs text-ink md:block" aria-label="Weiter scrollen">↓ scrollen</a>
    </section>
  );
}

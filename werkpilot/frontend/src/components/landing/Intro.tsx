"use client";

import { useEffect, useState } from "react";
import gsap from "gsap";

export const INTRO_KEY = "clairify-intro-gesehen";

/** Entscheidet vor dem Hydrieren, ob das Intro läuft: einmal je Sitzung, nicht bei reduzierter Bewegung.
 *  Läuft als Inline-Skript im HTML, damit der Hero nicht erst sichtbar wird und dann vom Vorhang verdeckt wird.
 *  Ohne JavaScript bekommt <html> keine Klasse: dann ist alles sofort sichtbar. `#intro` in der Adresse erzwingt das Intro. */
export const INTRO_BOOT = `(function(){try{var h=document.documentElement,r=matchMedia("(prefers-reduced-motion: reduce)").matches,f=location.hash==="#intro";if(!r&&(f||!sessionStorage.getItem("${INTRO_KEY}")))h.classList.add("intro-run");else h.classList.add("intro-skip")}catch(e){document.documentElement.classList.add("intro-skip")}})();`;

/** Cinematic Intro: schwarzer Vorhang, Wortmarke erscheint, fliegt an ihren Platz in der Kopfzeile, dann bauen sich
 *  Person, Film und Headline auf. Gesamtlaufzeit rund 3,5 s. Kein Ladebildschirm: die Seite ist dahinter schon fertig. */
export function Intro() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("intro-run")) { queueMicrotask(() => setDone(true)); return; }
    const mark = document.querySelector<HTMLElement>(".intro-mark");
    const logo = document.querySelector<HTMLElement>(".hdr-logo");
    const veil = document.querySelector<HTMLElement>(".intro");
    if (!mark || !logo || !veil) { finish(); return; }
    let finished = false;
    function finish() {
      if (finished) return; finished = true;
      try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* privater Modus: dann läuft es beim nächsten Aufruf noch einmal */ }
      html.classList.remove("intro-run"); html.classList.add("intro-done");
      gsap.set([".hdr", ".hero-film", ".hero-person", ".hero-fade", ".hero-title .line-in"], { clearProps: "all" });
      setDone(true);
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(7, Math.max(3.2, (vw * 0.5) / Math.max(1, mark.offsetWidth)));
    const lr = logo.getBoundingClientRect();
    const w = mark.offsetWidth, h = mark.offsetHeight;
    gsap.set(mark, { x: (vw - w * scale) / 2, y: (vh - h * scale) / 2, scale, opacity: 1 });
    // Auf schmalen Bildschirmen und schwachen Geräten läuft die Sequenz gestrafft (rund 2,5 s statt 3,5 s)
    const quick = vw < 768 || (navigator.hardwareConcurrency || 8) <= 4;
    const tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: finish });
    if (quick) tl.timeScale(1.4);
    tl.fromTo(".intro-mark .l", { yPercent: 115 }, { yPercent: 0, duration: 0.75, stagger: 0.045 }, 0)
      .to(".intro-rule", { scaleX: 1, duration: 0.6, ease: "power2.inOut" }, 0.45)
      .to(".intro-rule", { opacity: 0, duration: 0.25 }, 1.2)
      // Wortmarke fliegt an die Stelle des Logos in der Kopfzeile (FLIP), der Vorhang öffnet sich
      .to(mark, { x: lr.left, y: lr.top, scale: 1, duration: 0.85, ease: "power3.inOut" }, 1.25)
      .to(veil, { backgroundColor: "rgba(5,5,5,0)", duration: 0.9, ease: "power2.inOut" }, 1.35)
      // Person: von unten aufgedeckt, aus der Unschärfe ins Licht
      .fromTo(".hero-person", { opacity: 0, clipPath: "inset(100% 0 0 0)", y: 60, scale: 1.08, filter: "blur(10px) brightness(0.35)" },
        { opacity: 1, clipPath: "inset(0% 0 0 0)", y: 0, scale: 1, filter: "blur(0px) brightness(1)", duration: 1.15, ease: "power3.out" }, 1.45)
      // Film blendet hinter der Person ein
      .fromTo(".hero-film", { opacity: 0 }, { opacity: 1, duration: 1.3, ease: "power2.inOut" }, 1.7)
      .to(".hdr", { opacity: 1, duration: 0.6 }, 2.0)
      .set(mark, { opacity: 0 }, 2.1)
      // Headline Zeile für Zeile aus der Maske
      .fromTo(".hero-title .line-in", { yPercent: 110 }, { yPercent: 0, duration: 0.85, stagger: 0.1, ease: "power4.out" }, 2.0)
      .fromTo(".hero-fade", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.08, ease: "power2.out" }, 2.5);
    const safety = window.setTimeout(() => { tl.kill(); finish(); }, 6000);
    return () => { window.clearTimeout(safety); tl.kill(); };
  }, []);
  if (done) return null;
  return (
    <div className="intro" aria-hidden>
      <span className="intro-mark" style={{ opacity: 0 }}>
        {"Clairify".split("").map((c, i) => <span key={i} className="lw"><span className="l">{c}</span></span>)}
        <span className="intro-rule" />
      </span>
    </div>
  );
}

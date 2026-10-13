"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const Scene3D = dynamic(() => import("./Scene3D").then((m) => m.Scene3D), { ssr: false, loading: () => <div className="h-full w-full" /> });

const STEPS = [
  { t: "Die Anfrage kommt rein", d: "Weiterleitung aus dem Postfach, Formular der Website oder eine Notiz nach dem Anruf. Alles landet an einem Ort, nichts rutscht im Posteingang nach unten." },
  { t: "Die KI sortiert", d: "Notfall, Reparatur, Angebot, Wartung, Spam. Mit Dringlichkeit, Zusammenfassung in zwei Sätzen und dem, was noch fehlt: Adresse, Telefon, Foto." },
  { t: "Dringendes steht oben", d: "Stromausfall, Rohrbruch, Sturmschaden: Diese Anfragen warten nicht hinter einer Wartungsanfrage. Beschwerden gehen immer an einen Menschen." },
  { t: "Der Entwurf liegt bereit", d: "In Ihrem Ton, höflich per Sie, mit Ihrer Signatur. Mit Rückfragen nach fehlenden Angaben und zwei Terminvorschlägen aus Ihren Geschäftszeiten." },
  { t: "Sie geben frei", d: "Ein Blick, ein Klick. Preise, Diagnosen und Zusagen bleiben bei Ihnen, die KI macht keine. Ab Tarif Business geht die Eingangsbestätigung bei sauberen Fällen automatisch raus." },
  { t: "Nichts bleibt liegen", d: "Der Kunde bestätigt den Termin per Link, offene Angebote werden nach fünf Tagen nachgefasst, freitags kommt der Wochenbericht." },
];

export function Story() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
  // Die 3D-Szene (three.js, groß) wird erst geladen, wenn der Abschnitt in die Nähe des Viewports kommt.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || !("IntersectionObserver" in window)) { queueMicrotask(() => setNear(true)); return; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "120% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const r = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    queueMicrotask(() => setReduced(r));
    if (r) { progress.current = 0.5; return; }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: root.current, start: "top top", end: "+=380%", pin: ".story-pin", scrub: true, anticipatePin: 1,
        onUpdate: (self) => { progress.current = self.progress; setActive(Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length))); },
      });
    }, root);
    return () => ctx.revert();
  }, []);
  return (
    <section ref={root} id="ablauf" className="relative" aria-label="So funktioniert Clairify">
      <div className="story-pin flex min-h-[100svh] flex-col justify-center">
        <div className="mx-auto w-full max-w-7xl px-5 pt-20 md:pt-20">
          <p className="eyebrow mb-5 text-center">Eine Anfrage, einmal durch Clairify</p>
          {/* Übergroße zentrierte Typografie; die 3D-Szene darunter schiebt sich in die zweite Zeile (Referenz: Objekt überschneidet den Text) */}
          <h2 className="story-title display display-giant mx-auto max-w-7xl">Vom vollen Posteingang<br />zum bestätigten Termin.</h2>
          <div className="grid gap-8 md:grid-cols-[1.15fr_1fr] md:items-start md:gap-10">
            <ol className="mt-8 grid gap-x-8 gap-y-4 sm:grid-cols-2 md:mt-12 md:gap-y-5" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.t} className={`step ${reduced || active === i ? "is-active" : ""}`}>
                  <div className="flex items-baseline gap-3"><span className="num text-xs">0{i + 1}</span><h3 className="text-base font-medium md:text-[1.05rem]">{s.t}</h3></div>
                  <p className="mt-1 pl-8 text-[12.5px] leading-relaxed text-ink-2">{s.d}</p>
                </li>
              ))}
            </ol>
            <div className="story-scene relative h-[40vh] md:h-[52vh]">
              <div className="stage-frame">
                {near ? <Scene3D progress={progress} /> : <div className="h-full w-full" />}
              </div>
              <p className="absolute -bottom-6 right-1 text-xs text-muted">Bewegen Sie die Maus oder neigen Sie das Gerät, die Szene folgt. Mit einem Gerät für VR oder AR erscheint ein Knopf zum Eintauchen.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

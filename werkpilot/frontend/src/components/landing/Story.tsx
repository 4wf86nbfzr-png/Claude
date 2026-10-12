"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const Scene3D = dynamic(() => import("./Scene3D").then((m) => m.Scene3D), { ssr: false, loading: () => <div className="h-full w-full" /> });

const STEPS = [
  { t: "Die Anfrage kommt rein", d: "E-Mail-Weiterleitung, Website-Formular oder eine Notiz nach dem Anruf. Alles landet an einem Ort, nichts rutscht im Posteingang nach unten." },
  { t: "Die KI sortiert", d: "Notfall, Reparatur, Angebot, Wartung, Spam. Mit Dringlichkeit, Zusammenfassung in zwei Sätzen und dem, was noch fehlt: Adresse, Telefon, Foto." },
  { t: "Dringendes steht oben", d: "Stromausfall, Rohrbruch, Sturmschaden: Diese Anfragen warten nicht hinter einer Wartungsanfrage. Beschwerden gehen immer an einen Menschen." },
  { t: "Der Entwurf liegt bereit", d: "In Ihrem Ton, Sie-Form, mit Ihrer Signatur. Mit Rückfragen nach fehlenden Angaben und zwei Terminvorschlägen aus Ihren Geschäftszeiten." },
  { t: "Sie geben frei", d: "Ein Blick, ein Klick. Preise, Diagnosen und Zusagen bleiben bei Ihnen, die KI macht keine. Ab Tarif Business geht die Eingangsbestätigung bei sauberen Fällen automatisch raus." },
  { t: "Nichts bleibt liegen", d: "Der Kunde bestätigt den Termin per Link, offene Angebote werden nach fünf Tagen nachgefasst, freitags kommt der Wochenbericht." },
];

export function Story() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [active, setActive] = useState(0);
  const [reduced, setReduced] = useState(false);
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
    <section ref={root} id="ablauf" className="relative" aria-label="So funktioniert WerkPilot">
      <div className="story-pin flex min-h-[100svh] items-center">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow mb-4">Eine Anfrage, einmal durch WerkPilot</p>
            <h2 className="display text-4xl text-white md:text-5xl">Vom vollen Posteingang zum bestätigten Termin.</h2>
            <ol className="mt-10 space-y-5" aria-live="polite">
              {STEPS.map((s, i) => (
                <li key={s.t} className={`step ${reduced || active === i ? "is-active" : ""}`}>
                  <div className="flex items-baseline gap-3"><span className="font-mono text-xs text-muted">0{i + 1}</span><h3 className="text-lg font-semibold text-white">{s.t}</h3></div>
                  <p className="mt-1 pl-8 text-sm text-ink-2 md:text-[15px]">{s.d}</p>
                  <div className="bar ml-8 mt-3"><i /></div>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative h-[46vh] md:h-[78vh]">
            <div className="absolute inset-0 rounded-[28px] card3 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(91,140,255,0.18),transparent_60%)]" />
              <Scene3D progress={progress} />
            </div>
            <p className="absolute -bottom-7 right-1 text-xs text-muted">Bewegen Sie die Maus oder neigen Sie das Gerät – die Szene folgt. Mit VR- oder AR-fähigem Gerät erscheint ein Knopf zum Eintauchen.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const FEATURES = [
  { k: "Posteingang", t: "Alle Kanäle, ein Ort", d: "E-Mail-Weiterleitung, Website-Formular per Webhook, Telefonnotiz. Dubletten werden erkannt, Spam verschwindet." },
  { k: "Einordnung", t: "Kategorie, Dringlichkeit, Zusammenfassung", d: "Zehn Kategorien von Notfall bis Beschwerde. Sicherheitswert sichtbar. Unsicheres geht zur menschlichen Prüfung." },
  { k: "Entwürfe", t: "Antwort in Ihrem Ton", d: "Sie-Form, Ihre Signatur, konkrete Rückfragen. Bearbeiten, freigeben oder verwerfen. Jede Warnung wird angezeigt." },
  { k: "Termine", t: "Vorschläge aus Ihrem Kalender", d: "Geschäftszeiten minus belegte Zeiten, Google Kalender optional. Der Kunde bestätigt mit einem Klick, der Termin landet im Kalender." },
  { k: "Angebote", t: "Nachfassen ohne Erinnerungszettel", d: "Angebot eintragen, nach fünf Tagen erinnert WerkPilot und legt einen Nachfass-Entwurf an. Preise bleiben Ihre Sache." },
  { k: "Berichte", t: "Freitags wissen, wo Sie stehen", d: "Neue Anfragen, Reaktionszeit, offene Angebote, Termine. Echte Zahlen aus Ihrem Betrieb, keine Hochrechnung." },
  { k: "Sicherheit", t: "Gebaut für deutsche Betriebe", d: "Daten in der EU, Rollen und Rechte serverseitig, Export und Löschung per Klick, Audit-Protokoll jeder automatischen Aktion." },
];

export function HorizontalFeatures() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mq = window.matchMedia("(min-width: 768px)");
    if (!mq.matches) return; // auf Mobil: normales horizontales Wischen
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      const el = track.current!;
      const dist = () => el.scrollWidth - window.innerWidth + 80;
      gsap.to(el, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1 } });
    }, root);
    return () => ctx.revert();
  }, []);
  return (
    <section ref={root} id="funktionen" className="relative overflow-hidden" aria-label="Funktionen">
      <div className="flex min-h-[100svh] flex-col justify-center py-16">
        <div className="mx-auto w-full max-w-7xl px-5">
          <p className="eyebrow mb-4">Funktionen</p>
          <h2 className="display max-w-3xl text-4xl text-white md:text-5xl">Alles, was hier steht, ist eingebaut.</h2>
          <p className="mt-4 max-w-2xl text-ink-2">Was noch nicht geht, sagen wir auch: WhatsApp, Telefonannahme und Microsoft-Kalender sind in Arbeit, nicht versprochen.</p>
        </div>
        <div className="mt-12 overflow-x-auto px-5 md:overflow-visible md:pl-[max(20px,calc((100vw-80rem)/2+20px))]">
          <div ref={track} className="track pb-4">
            {FEATURES.map((f, i) => (
              <article key={f.k} className="card3 w-[78vw] shrink-0 p-7 sm:w-[420px] md:w-[460px]">
                <div className="flex items-center justify-between"><span className="eyebrow">{f.k}</span><span className="font-mono text-xs text-muted">0{i + 1} / 0{FEATURES.length}</span></div>
                <h3 className="mt-6 text-2xl font-semibold text-white">{f.t}</h3>
                <p className="mt-3 text-ink-2">{f.d}</p>
              </article>
            ))}
            <article className="card3 flex w-[78vw] shrink-0 flex-col justify-between p-7 sm:w-[420px] md:w-[460px]">
              <span className="eyebrow">Und Sie?</span>
              <div><h3 className="text-2xl font-semibold text-white">14 Tage testen, ohne Zahlungsdaten.</h3><a href="/registrieren" className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-accent-2 hover:text-white">Jetzt starten</a></div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

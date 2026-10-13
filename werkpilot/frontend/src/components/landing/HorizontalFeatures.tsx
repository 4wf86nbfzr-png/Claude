"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Bildschirm je Funktion (echte Aufnahmen aus public/screens) */
const SHOT: Record<string, { file: string; label: string }> = { Posteingang: { file: "anfragen", label: "Anfragen" }, Einordnung: { file: "anfrage-detail", label: "Anfrage" }, Entwürfe: { file: "mobil-anfrage", label: "Anfrage auf dem Handy" }, Termine: { file: "termine", label: "Termine" }, Angebote: { file: "angebote", label: "Angebote" }, Berichte: { file: "berichte", label: "Berichte" }, Sicherheit: { file: "uebersicht", label: "Übersicht" } };

const FEATURES = [
  { k: "Posteingang", t: "Alle Kanäle, ein Ort", d: "Weiterleitung aus dem Postfach, Formular der Website per Webhook, Telefonnotiz. Dubletten werden erkannt, Spam verschwindet." },
  { k: "Einordnung", t: "Kategorie, Dringlichkeit, Zusammenfassung", d: "Zehn Kategorien von Notfall bis Beschwerde. Sicherheitswert sichtbar. Unsicheres geht zur menschlichen Prüfung." },
  { k: "Entwürfe", t: "Antwort in Ihrem Ton", d: "Höflich per Sie, Ihre Signatur, konkrete Rückfragen. Bearbeiten, freigeben oder verwerfen. Jede Warnung wird angezeigt." },
  { k: "Termine", t: "Vorschläge aus Ihrem Kalender", d: "Geschäftszeiten minus belegte Zeiten, Google Kalender optional. Der Kunde bestätigt mit einem Klick, der Termin landet im Kalender." },
  { k: "Angebote", t: "Nachfassen ohne Erinnerungszettel", d: "Angebot eintragen, nach fünf Tagen erinnert Clairify und legt einen Entwurf zum Nachfassen an. Preise bleiben Ihre Sache." },
  { k: "Berichte", t: "Freitags wissen, wo Sie stehen", d: "Neue Anfragen, Reaktionszeit, offene Angebote, Termine. Echte Zahlen aus Ihrem Betrieb, keine Hochrechnung." },
  { k: "Sicherheit", t: "Gebaut für deutsche Betriebe", d: "Rollen und Rechte serverseitig, Mandanten strikt getrennt, Export und Löschung per Klick, Protokoll jeder automatischen Aktion." },
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
      <div className="flex min-h-[100svh] flex-col justify-center py-10">
        {/* Zweizeilige, linksbündige Headline, runder Outline-Knopf daneben, Beschreibung rechts (Aufbau der Referenz) */}
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 md:grid-cols-[2fr_auto_1fr] md:items-center md:gap-10">
          <div>
            <p className="kicker">Funktionen</p>
            <h2 className="display display-xl mt-1 text-5xl md:whitespace-nowrap md:text-[3.8rem] lg:text-[4.6rem]">Alles, was hier steht,<br />ist eingebaut.</h2>
          </div>
          <a href="/funktionen" className="btn-circle justify-self-start md:justify-self-center">Alle<br />Funktionen</a>
          <p className="max-w-sm text-[13px] leading-relaxed text-ink-2 md:justify-self-end md:text-right md:text-sm">Was noch nicht geht, sagen wir auch: WhatsApp, Telefonannahme und der Microsoft Kalender sind in Arbeit, nicht versprochen.</p>
        </div>
        <div className="mt-8 overflow-x-auto px-5 md:overflow-visible md:pl-[max(20px,calc((100vw-80rem)/2+20px))]">
          <div ref={track} className="track pb-4">
            {FEATURES.map((f, i) => (
              <article key={f.k} className="feature card-dark">
                <div className="shot">
                  <picture><source type="image/webp" srcSet={`/screens/${SHOT[f.k].file}-1080.webp`} /><img src={`/screens/${SHOT[f.k].file}.png`} alt={`Dashboard, Bereich ${SHOT[f.k].label}`} width={2160} height={1350} loading="lazy" decoding="async" /></picture>
                </div>
                <div className="p-5 md:p-6">
                  <div className="flex items-center justify-between"><span className="eyebrow">{f.k}</span><span className="idx mono" aria-hidden>0{i + 1}</span></div>
                  <h3 className="mt-3 text-xl font-medium md:text-[1.35rem]">{f.t}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{f.d}</p>
                </div>
              </article>
            ))}
            <article className="feature card-dark flex flex-col justify-end p-6">
              <span className="eyebrow">Und Sie?</span>
              <h3 className="mt-3 text-xl font-medium md:text-[1.35rem]">14 Tage testen, ohne Zahlungsdaten.</h3>
              <a href="/registrieren" className="btn-primary mt-6 inline-block self-start rounded-full px-5 py-2.5 text-sm font-medium">Jetzt starten</a>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

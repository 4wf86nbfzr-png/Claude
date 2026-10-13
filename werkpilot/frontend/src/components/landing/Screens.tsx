"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "./Reveal";

/* Echte Bildschirme aus dem Dashboard (frontend/tools/screens/capture.mjs), kein Mockup. */
export const SCREENS = [
  { key: "anfragen", file: "anfragen", label: "Anfragen", title: "Alle Anfragen an einem Ort, Dringendes oben", text: "Jede Anfrage bekommt Kategorie, Priorität und Status. Ein Stromausfall steht über einer Wartungsanfrage, eine Beschwerde geht zur Prüfung an einen Menschen." },
  { key: "detail", file: "anfrage-detail", label: "Entwurf prüfen", title: "Der Entwurf liegt bereit, Sie geben frei", text: "Einordnung mit Sicherheitswert, fehlende Angaben, der Antwortentwurf im Ton des Betriebs. Freigeben, bearbeiten oder verwerfen, mit einem Klick." },
  { key: "termine", file: "termine", label: "Termine", title: "Vorschläge aus den Geschäftszeiten", text: "Bestätigte und vorgeschlagene Termine, dazu die nächsten freien Zeiten. Der Kunde bestätigt per Link, der Termin landet im Kalender." },
  { key: "angebote", file: "angebote", label: "Angebote", title: "Nachfassen ohne Erinnerungszettel", text: "Angebot eintragen, nach fünf Tagen erinnert Clairify und legt den Entwurf zum Nachfassen an. Preise bleiben Ihre Sache." },
  { key: "berichte", file: "berichte", label: "Wochenbericht", title: "Freitags wissen, wo Sie stehen", text: "Neue Anfragen, Reaktionszeit, offene Angebote, Termine. Echte Zahlen aus dem Betrieb, keine Hochrechnung." },
  { key: "uebersicht", file: "uebersicht", label: "Übersicht", title: "Der Stand des Betriebs auf einen Blick", text: "Offene Vorgänge, Entwürfe zur Prüfung, Termine, Angebote und was die Automatik gerade tut. Was nicht eingerichtet ist, sagt die Übersicht ehrlich." },
];

/** Einblick ins System: echte Bildschirme, als Reiter umschaltbar, mit Vergrößerung. */
export function Screens() {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const s = SCREENS[active];
  useEffect(() => {
    if (!zoom) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [zoom]);
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => (a + 1) % SCREENS.length);
    if (e.key === "ArrowLeft") setActive((a) => (a - 1 + SCREENS.length) % SCREENS.length);
  };
  return (
    <section id="einblick" className="mx-auto max-w-7xl px-5 py-28" aria-label="Einblick ins System">
      <Reveal>
        <p className="eyebrow mb-4">Einblick ins System</p>
        <h2 className="display max-w-3xl text-4xl md:text-5xl">So sieht Clairify im Betrieb aus.</h2>
        <p className="mt-4 max-w-2xl text-lg text-ink-2">Echte Bildschirme aus dem Dashboard mit Beispieldaten eines Elektrobetriebs. Unten können Sie eine Anfrage selbst eingeben, oder Sie legen ein Testkonto an und arbeiten direkt darin.</p>
      </Reveal>
      <Reveal delay={120} className="mt-12">
        <div className="tabs" role="tablist" aria-label="Bereiche des Dashboards" onKeyDown={onTabKey}>
          {SCREENS.map((t, i) => (
            <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={i === active} aria-controls="screen-panel" tabIndex={i === active ? 0 : -1} className={`tab ${i === active ? "is-active" : ""}`} onClick={() => setActive(i)}>{t.label}</button>
          ))}
        </div>
        <div id="screen-panel" role="tabpanel" aria-labelledby={`tab-${s.key}`} className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr] lg:items-start lg:gap-12">
          <button type="button" className="screen" onClick={() => setZoom(true)} aria-label={`${s.label} vergrößern`}>
            <img src={`/screens/${s.file}.png`} alt={`Dashboard, Bereich ${s.label}: ${s.title}`} width={2160} height={1350} loading="lazy" decoding="async" />
            <span className="screen-hint" aria-hidden>Vergrößern</span>
          </button>
          <div>
            <h3 className="text-2xl font-semibold md:text-[1.7rem]">{s.title}</h3>
            <p className="mt-3 text-ink-2 md:text-[15px]">{s.text}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#demo" className="btn-secondary rounded-full px-5 py-2.5 text-sm font-medium">Anfrage selbst eingeben</a>
              <a href="/registrieren" className="btn-primary rounded-full px-5 py-2.5 text-sm font-semibold">Testkonto anlegen</a>
            </div>
            <p className="mt-6 text-xs text-muted">Aufnahme aus dem Testbetrieb ohne angebundenen KI Anbieter; die Entwürfe sind dort regelbasiert. Beispieldaten, keine echten Kunden.</p>
          </div>
        </div>
      </Reveal>
      {zoom && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${s.label}, vergrößert`} onClick={() => setZoom(false)}>
          <button ref={closeBtn} type="button" className="lightbox-close" onClick={() => setZoom(false)} aria-label="Schließen">×</button>
          <img src={`/screens/${s.file}.png`} alt={`Dashboard, Bereich ${s.label}: ${s.title}`} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </section>
  );
}

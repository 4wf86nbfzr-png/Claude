"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useNear, useReducedMotion } from "./fx/useNear";

type Step = { key: string; title: string; text: string; shot: "anfragen" | "anfrage-detail" | "mobil-anfrage"; phone?: boolean; hl: [number, number, number, number]; k: string };
/* Vier Funktionen, je ein echter Bildschirm aus dem Testbetrieb; die Markierung zeigt die Stelle, um die es geht (Prozent des Bildes). */
const STEPS: Step[] = [
  { key: "buendeln", title: "Alle Anfragen bündeln", text: "Weiterleitung aus dem Postfach, Formular der Website, Notiz nach dem Anruf: Alles landet in einer Liste mit Kategorie, Priorität und Status. Nichts rutscht im Posteingang nach unten.", shot: "anfragen", hl: [18, 19, 80, 36], k: "Posteingang" },
  { key: "dringend", title: "Dringendes erkennen", text: "Notfall, Reparatur, Angebot, Wartung oder Spam, mit Dringlichkeit und Sicherheitswert. Ein Stromausfall steht über der Wartungsanfrage, eine Beschwerde geht immer an einen Menschen.", shot: "anfrage-detail", hl: [18, 20, 53, 20], k: "Einordnung" },
  { key: "antwort", title: "Antworten vorbereiten", text: "Der Entwurf liegt im Ton des Betriebs bereit und nennt, was noch fehlt: Adresse, Telefon, Foto. Sie bearbeiten, geben frei oder verwerfen. Ohne angebundenen KI-Anbieter sind die Entwürfe regelbasiert.", shot: "anfrage-detail", hl: [18, 43, 53, 46], k: "Entwurf" },
  { key: "mobil", title: "Mobil freigeben", text: "Auf der Baustelle prüfen, mit einem Tipp freigeben. Der Kunde bekommt die Antwort, der Termin landet im Kalender. Nichts geht ohne Ihre Freigabe raus.", shot: "mobil-anfrage", phone: true, hl: [5, 36, 90, 12], k: "Freigabe unterwegs" },
];
const DUR = 3.6;

export function ProductShowcase() {
  const ref = useRef<HTMLElement>(null);
  const near = useNear(ref, "-20% 0px");
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const played = useRef(false);
  // Läuft einmal durch, sobald der Abschnitt im Bild ist; ein Klick übernimmt die Steuerung.
  useEffect(() => {
    if (!near || !auto || reduced || played.current) return;
    if (i >= STEPS.length - 1) { played.current = true; return; }
    const t = window.setTimeout(() => setI((v) => v + 1), DUR * 1000);
    return () => window.clearTimeout(t);
  }, [near, auto, reduced, i]);
  const pick = (n: number) => { setAuto(false); played.current = true; setI(n); };
  const s = STEPS[i];
  return (
    <section ref={ref} id="produkt" className="relative" aria-label="Das Produkt">
      <div className="mx-auto max-w-[96rem] px-5 py-20 md:px-10 md:py-28">
        <p className="eyebrow eyebrow-rule">So einfach funktioniert&apos;s</p>
        <h2 data-mask className="display mt-5 max-w-4xl text-[2.2rem] md:text-[3.4rem]">Vier Handgriffe, die der Betrieb nicht mehr selbst machen muss.</h2>
        <div className="product-show" style={{ "--ps-dur": `${DUR}s` } as React.CSSProperties}>
          <div className="ps-nav" role="tablist" aria-label="Funktionen">
            {STEPS.map((st, n) => (
              <button key={st.key} role="tab" aria-selected={n === i} aria-controls="ps-panel" id={`ps-tab-${st.key}`} type="button" className={`ps-step ${n === i ? "is-on" : ""} ${auto && near && !reduced ? "is-auto" : ""}`} onClick={() => pick(n)}>
                <span className="n">0{n + 1}</span><span>{st.title}</span>
                {n === i && auto && !reduced && <span className="bar" aria-hidden><i key={i} /></span>}
              </button>
            ))}
          </div>
          <div className="ps-frame" id="ps-panel" role="tabpanel" aria-labelledby={`ps-tab-${s.key}`}>
            {STEPS.map((st, n) => (
              <div key={st.key} className={`ps-shot ${st.phone ? "is-phone" : ""} ${n === i ? "is-on" : ""}`} aria-hidden={n !== i}>
                <picture>
                  <source srcSet={`/screens/${st.shot}-1080.webp 1080w, /screens/${st.shot}-2160.webp 2160w`} sizes="(min-width: 1024px) 60vw, 100vw" type="image/webp" />
                  <img src={`/screens/${st.shot}.png`} alt={n === i ? `Clairify, Bildschirm ${st.k}` : ""} width={st.phone ? 780 : 1080} height={st.phone ? 1688 : 675} loading="lazy" decoding="async" />
                </picture>
              </div>
            ))}
            <span className="ps-hl" aria-hidden style={s.phone
              ? { left: `calc(50% - ${(s.hl[2] / 2) * (780 / 1688) * 0.625}%)`, top: `${s.hl[1]}%`, width: `${s.hl[2] * (780 / 1688) * 0.625}%`, height: `${s.hl[3]}%` }
              : { left: `${s.hl[0]}%`, top: `${s.hl[1]}%`, width: `${s.hl[2]}%`, height: `${s.hl[3]}%` }} />
          </div>
          <div className="ps-text" aria-live="polite">
            <div key={s.key}>
              <span className="k">{s.k}</span>
              <h3 className="mt-3">{s.title}</h3>
              <p>{s.text}</p>
              <p className="ps-note">Aufnahmen aus dem Testbetrieb mit Beispieldaten eines Elektrobetriebs, ohne angebundenen KI-Anbieter.</p>
              <Link href="/funktionen" className="mt-5 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline">Alle Funktionen ansehen</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/* Fünf Kapitel des Tages, je ein scharfes Szenenbild und ein Satz dazu. Keine Versprechen, nur das, was das Produkt tut. */
export const FILM_SCENES = [
  { k: "Morgens", t: "Die Anfragen der Nacht sind sortiert. Dringendes steht oben." },
  { k: "Haustür", t: "Der Laptop bleibt zu Hause. Der Posteingang passt aufs Handy." },
  { k: "Kurz überlegt", t: "Kein Abend im Büro. Die Entwürfe warten, bis Sie Zeit haben." },
  { k: "Baustelle", t: "Terminvorschläge gehen raus, der Kunde bestätigt per Link." },
  { k: "Mittagspause", t: "Ein Blick in die Mails, freigeben, fertig." },
];

/** Der Tag in Kapiteln: Szenenbilder blenden beim Scrollen mit leichter Kamerafahrt ineinander, der Scrollweg ist
 *  kurz, die Bewegung läuft weich nach und rastet je Kapitel ein. Die Kapitel links sind anklickbar.
 *  Bei reduzierter Bewegung oder auf kleinen Bildschirmen: erstes Bild und die Sätze als Liste. */
export function ScrollFilm() {
  const root = useRef<HTMLElement>(null);
  const layers = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const chapters = useRef<HTMLUListElement>(null);
  const st = useRef<ScrollTrigger | null>(null);
  const activeRef = useRef(0);
  const n = FILM_SCENES.length;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const el = root.current!;
    if (reduced || !desktop) { el.classList.add("is-static"); return; }
    gsap.registerPlugin(ScrollTrigger);
    const setActive = (i: number) => {
      if (i === activeRef.current) return;
      activeRef.current = i;
      Array.from(lines.current!.children).forEach((c, j) => c.classList.toggle("is-on", j === i));
      Array.from(chapters.current!.querySelectorAll("button")).forEach((c, j) => { c.classList.toggle("is-on", j === i); c.setAttribute("aria-current", j === i ? "step" : "false"); });
    };
    const ctx = gsap.context(() => {
      const imgs = Array.from(layers.current!.children) as HTMLElement[];
      gsap.set(imgs, { opacity: (i: number) => (i === 0 ? 1 : 0), scale: 1 });
      const tl = gsap.timeline({ defaults: { ease: "none" } });
      // Jedes Kapitel dauert 1 Einheit: das Bild fährt langsam heran, das nächste blendet im letzten Drittel ein
      imgs.forEach((img, i) => {
        tl.to(img, { scale: 1.08, duration: 1 }, i);
        if (i > 0) tl.to(img, { opacity: 1, duration: 0.45, ease: "power1.inOut" }, i - 0.45);
      });
      st.current = ScrollTrigger.create({
        trigger: el, start: "top top", end: "+=" + (n * 55) + "%", pin: ".film-pin", scrub: 0.8, anticipatePin: 1, animation: tl,
        snap: { snapTo: (v) => Math.round(v * (n - 1)) / (n - 1), duration: { min: 0.15, max: 0.45 }, ease: "power1.inOut", delay: 0.05 },
        onUpdate: (self) => setActive(Math.min(n - 1, Math.round(self.progress * (n - 1)))),
      });
    }, el);
    return () => { ctx.revert(); st.current = null; };
  }, [n]);

  const jump = (i: number) => {
    const s = st.current;
    if (!s) { document.getElementById("tag")?.scrollIntoView({ behavior: "smooth" }); return; }
    window.scrollTo({ top: s.start + (i / (n - 1)) * (s.end - s.start), behavior: "smooth" });
  };

  return (
    <section ref={root} id="tag" className="film relative" aria-label="Ein Arbeitstag mit Clairify">
      <div className="film-pin relative min-h-[100svh] overflow-hidden">
        <div ref={layers} className="film-layers" aria-hidden>
          {FILM_SCENES.map((s, i) => <img key={s.k} className="film-layer" src={`/video/scenes/scene-${i + 1}.jpg`} alt="" width={1920} height={1080} loading={i === 0 ? "eager" : "lazy"} decoding="async" />)}
        </div>
        <div className="film-shade" aria-hidden />
        <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-end px-5 pb-20 pt-32">
          <p className="eyebrow mb-4">Ein Arbeitstag, Schritt für Schritt</p>
          <h2 className="display max-w-3xl text-4xl md:text-5xl">Scrollen Sie durch den Tag.</h2>
          <ul ref={chapters} className="film-chapters mt-6" aria-label="Kapitel">
            {FILM_SCENES.map((s, i) => <li key={s.k}><button type="button" className={`film-chapter ${i === 0 ? "is-on" : ""}`} aria-current={i === 0 ? "step" : "false"} onClick={() => jump(i)}><span className="film-dot" aria-hidden />{s.k}</button></li>)}
          </ul>
          <div ref={lines} className="film-lines mt-5" aria-live="polite">
            {FILM_SCENES.map((s, i) => <p key={s.k} className={`film-line ${i === 0 ? "is-on" : ""}`}><span className="film-k">{s.k}</span><span className="film-t">{s.t}</span></p>)}
          </div>
        </div>
      </div>
    </section>
  );
}

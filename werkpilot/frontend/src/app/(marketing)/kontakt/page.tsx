import type { Metadata } from "next";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Kontakt", description: "Fragen zu Clairify? Rückruf oder Demo anfragen." };

/* Foto links, durchscheinendes Panel rechts (ein Panel je Ansicht, wie in der Designreferenz). */
export default function Kontakt() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
      <div className="relative overflow-hidden rounded-[var(--radius-card)] md:grid md:min-h-[640px] md:grid-cols-[1.15fr_1fr]">
        <div className="relative aspect-[4/3] md:aspect-auto">
          <picture>
            <source type="image/webp" srcSet="/video/stills/still-2-960.webp 960w, /video/stills/still-2-1600.webp 1600w" sizes="(min-width: 768px) 55vw, 100vw" />
            <img src="/video/stills/still-2.jpg" alt="Standbild aus dem Film: Ankunft mit dem Auto auf der Baustelle" className="absolute inset-0 h-full w-full object-cover" loading="eager" decoding="async" />
          </picture>
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,5,5,0.1),rgba(5,5,5,0.8))]" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10">
            <h1 className="text-4xl md:text-6xl">Kontakt</h1>
            <p className="mt-3 max-w-md text-ink-2">Wir antworten per Mail, in der Regel am nächsten Werktag. Keine Verkaufsanrufe, keine Newsletter ohne Ihre Zustimmung.</p>
          </div>
        </div>
        <div className="border-t border-line bg-[rgba(14,14,16,0.8)] p-6 backdrop-blur-xl md:border-l md:border-t-0 md:p-10">
          <h2 className="mono text-xs uppercase tracking-[0.08em] text-muted">Nachricht senden</h2>
          <ContactForm />
        </div>
      </div>
    </div>
  );
}

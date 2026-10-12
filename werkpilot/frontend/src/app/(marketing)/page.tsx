import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "WerkPilot AI – Kundenanfragen für Handwerksbetriebe automatisieren" };

const steps = [
  { t: "Anfrage kommt rein", d: "Per E-Mail-Weiterleitung oder über das Formular Ihrer Website. Nichts geht mehr im Posteingang unter." },
  { t: "KI sortiert und bereitet vor", d: "Dringlichkeit, Kategorie, Zusammenfassung. Fehlende Angaben werden erkannt, ein Antwortentwurf liegt bereit." },
  { t: "Sie geben frei", d: "Ein Blick, ein Klick. Terminvorschläge aus Ihrem Kalender sind schon drin. Preise und Zusagen bleiben bei Ihnen." },
  { t: "Nichts bleibt liegen", d: "Offene Angebote werden nachgefasst, Termine bestätigt, und freitags kommt der Wochenbericht." },
];

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "WerkPilot AI",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: "79", highPrice: "249" },
    description: "KI-gestützte Anfrage- und Terminorganisation für kleine Handwerksbetriebe in Deutschland.",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:pt-24">
        <p className="mb-4 text-sm font-medium text-accent">Für Elektro, SHK, Maler, Dach, Reinigung und GaLaBau</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">Kundenanfragen beantworten, während Sie auf der Baustelle stehen.</h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">WerkPilot sammelt Anfragen aus E-Mail und Website, sortiert sie nach Dringlichkeit und legt Ihnen fertige Antwortentwürfe mit Terminvorschlägen vor. Sie prüfen und geben frei. Offene Angebote werden automatisch nachgefasst.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/registrieren">14 Tage kostenlos testen</Button>
          <Button href="/demo" variant="secondary">Demo ausprobieren</Button>
        </div>
        <p className="mt-4 text-sm text-muted">Ohne Kreditkarte. Testphase endet automatisch. Daten bleiben in der EU.</p>
      </section>

      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 md:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.t}>
              <div className="mb-2 font-mono text-xs text-muted">0{i + 1}</div>
              <h2 className="font-semibold">{s.t}</h2>
              <p className="mt-1 text-sm text-ink-2">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold md:text-3xl">Was die KI macht – und was bewusst nicht.</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-[var(--radius-card)] border border-line bg-paper p-6">
            <h3 className="font-semibold text-ok">Macht sie</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>Anfragen erfassen, zusammenfassen und priorisieren (Notfall zuerst)</li>
              <li>Antwortentwürfe in Ihrem Ton, Sie-Form, mit Ihrer Signatur</li>
              <li>Nachfragen, was fehlt: Adresse, Telefon, Foto, Gerätetyp</li>
              <li>Terminvorschläge aus Geschäftszeiten und Kalender</li>
              <li>Erinnerungen an offene Angebote, Wochenbericht</li>
            </ul>
          </div>
          <div className="rounded-[var(--radius-card)] border border-line bg-paper p-6">
            <h3 className="font-semibold text-bad">Macht sie nicht</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>Keine Preise nennen oder Angebote abgeben</li>
              <li>Keine technischen Diagnosen aus der Ferne</li>
              <li>Keine verbindlichen Zusagen zu Terminen oder Machbarkeit</li>
              <li>Keine Nachrichten senden, die Sie nicht freigegeben haben (außer Sie schalten das für saubere Fälle frei)</li>
              <li>Beschwerden und unklare Fälle gehen immer an einen Menschen</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-8">
        <div className="rounded-[var(--radius-card)] bg-ink p-8 text-white md:p-12">
          <h2 className="text-2xl font-semibold md:text-3xl">Ab 79 € im Monat. Monatlich kündbar.</h2>
          <p className="mt-3 max-w-2xl text-white/80">Die Preise sind Einführungspreise und werden mit den ersten Kunden überprüft. Was Sie heute buchen, bleibt für Ihre Laufzeit so.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/preise" className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-ink">Tarife ansehen</Link>
            <Link href="/kontakt" className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-medium text-white">Rückruf anfragen</Link>
          </div>
        </div>
      </section>
    </>
  );
}

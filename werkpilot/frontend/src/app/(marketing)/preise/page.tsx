import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Preise", description: "Starter 79 €, Business 149 €, Pro 249 € pro Monat. 14 Tage kostenlos testen, monatlich kündbar." };

const plans = [
  { code: "starter", name: "Starter", price: "79 €", for: "Für Einzelbetriebe und kleine Teams", items: ["Anfrageverwaltung (150 Anfragen/Monat)", "Antwortentwürfe der KI mit Freigabe", "Kundenübersicht", "Standardberichte", "2 Nutzer"] },
  { code: "business", name: "Business", price: "149 €", for: "Für Betriebe mit Büro und mehreren Monteuren", hot: true, items: ["Alles aus Starter (500 Anfragen/Monat)", "Automatische Eingangsbestätigung", "Terminvorschläge & Kalender", "Angebotsnachverfolgung", "Individuelle Arbeitsabläufe", "5 Nutzer"] },
  { code: "pro", name: "Pro", price: "249 €", for: "Für wachsende Betriebe mit eigenen Systemen", items: ["Alles aus Business (2.000 Anfragen/Monat)", "Webhooks für Ihr CRM & erweiterte Integrationen", "Eigene Automatisierungsregeln", "Umfangreiche Auswertungen", "Priorisierter Support", "15 Nutzer"] },
];

export default function Preise() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Preise</h1>
      <p className="mt-3 max-w-2xl text-ink-2">Alle Preise zzgl. USt., monatlich kündbar. 14 Tage kostenlos testen, ohne Zahlungsdaten. Die Testphase umfasst Anfragen, Entwürfe, Termine und Angebotsnachverfolgung mit begrenztem Kontingent.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.code} className={`rounded-[var(--radius-card)] border bg-paper p-6 ${p.hot ? "border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" : "border-line"}`}>
            {p.hot && <div className="mb-2 text-xs font-medium text-accent">Meist gewählt</div>}
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <div className="mt-2 text-3xl font-semibold">{p.price}<span className="text-base font-normal text-muted"> / Monat</span></div>
            <p className="mt-1 text-sm text-muted">{p.for}</p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">{p.items.map((i) => <li key={i}>✓ {i}</li>)}</ul>
            <Button href={`/registrieren?tarif=${p.code}`} variant={p.hot ? "primary" : "secondary"} className="mt-6 w-full">Testphase starten</Button>
          </div>
        ))}
      </div>
      <div className="prose mt-12 max-w-2xl">
        <h2>Häufige Fragen</h2>
        <h3>Was kostet die KI zusätzlich?</h3>
        <p>Nichts. Jeder Tarif enthält ein Kontingent für die KI, das für den angegebenen Anfrageumfang reicht. Wird es erreicht, werden Anfragen weiter erfasst, aber ohne Entwurf, und Sie werden informiert.</p>
        <h3>Sind die Preise endgültig?</h3>
        <p>Es sind Einführungspreise. Wir prüfen sie mit den ersten Kunden. Bestehende Verträge behalten ihren Preis.</p>
        <h3>Wie kündige ich?</h3>
        <p>Jederzeit im Kundenportal zum Ende des Abrechnungsmonats. Danach können Sie Ihre Daten exportieren; sie werden nach der Aufbewahrungsfrist gelöscht.</p>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { Button } from "@/components/ui";
import { COMPARE_ROWS, PLANS, PLAN_TERMS } from "@/lib/plans";
import { BillingNote } from "./billing-note";

const priceLine = PLANS.map((p) => `${p.name} ${p.priceEur} €`).join(", ");
export const metadata: Metadata = { title: "Preise", description: `${priceLine} pro Monat zuzüglich Umsatzsteuer. Kostenlos testen ohne Zahlungsdaten, monatlich kündbar.` };

export default function Preise() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Preise</h1>
      <p className="mt-3 max-w-2xl text-ink-2">{PLAN_TERMS.vat} {PLAN_TERMS.cancel} {PLAN_TERMS.extra}</p>
      <BillingNote />
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.code} className={`rounded-[var(--radius-card)] border bg-paper p-6 ${p.hot ? "border-accent shadow-[0_0_0_3px_var(--color-accent-soft)]" : "border-line"}`}>
            {p.hot && <div className="mb-2 text-xs font-medium text-accent">Empfehlung für Betriebe mit Büro</div>}
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <div className="mt-2 text-3xl font-semibold">{p.priceEur} €<span className="text-base font-normal text-muted"> / Monat</span></div>
            <p className="mt-1 text-sm text-muted">{p.for}</p>
            <ul className="mt-5 space-y-2 text-sm text-ink-2">{p.highlights.map((i) => <li key={i}>✓ {i}</li>)}</ul>
            <Button href={`/registrieren?tarif=${p.code}`} variant={p.hot ? "primary" : "secondary"} className="mt-6 w-full">Testphase starten</Button>
          </div>
        ))}
      </div>

      <h2 className="mt-14 text-2xl font-semibold">Tarife im Vergleich</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line"><th scope="col" className="py-2 text-left font-medium text-muted">Leistung</th>{PLANS.map((p) => <th key={p.code} scope="col" className="py-2 font-semibold">{p.name}</th>)}</tr></thead>
          <tbody>
            {COMPARE_ROWS.map((r) => (
              <tr key={r.label} className="border-b border-line">
                <th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink-2">{r.label}{r.note && <span className="block text-xs text-muted">{r.note}</span>}</th>
                {PLANS.map((p, i) => <td key={p.code} className="py-2.5 text-center">{r.values ? r.values[i] : p.features.includes(r.feature!) ? <span className="text-accent" aria-label="enthalten">✓</span> : <span className="text-muted" aria-label="nicht enthalten">–</span>}</td>)}
              </tr>
            ))}
            <tr className="border-b border-line"><th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink-2">Kündigung</th><td colSpan={3} className="py-2.5 text-center text-ink-2">Monatlich, zum Ende des Abrechnungsmonats</td></tr>
            <tr className="border-b border-line"><th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink-2">Testphase</th><td colSpan={3} className="py-2.5 text-center text-ink-2">Ohne Zahlungsdaten: 30 Anfragen, 1 Nutzer, begrenztes KI-Kontingent</td></tr>
            <tr className="border-b border-line"><th scope="row" className="py-2.5 pr-4 text-left font-normal text-ink-2">Umsatzsteuer</th><td colSpan={3} className="py-2.5 text-center text-ink-2">Preise zuzüglich gesetzlicher Umsatzsteuer</td></tr>
          </tbody>
        </table>
      </div>

      <div className="prose mt-12 max-w-2xl">
        <h2>Häufige Fragen</h2>
        <h3>Was kostet die KI zusätzlich?</h3>
        <p>Nichts. Jeder Tarif enthält ein Kontingent für die KI, das für den angegebenen Anfrageumfang bemessen ist. Wird es erreicht, werden Anfragen weiter erfasst und sortiert, aber ohne Entwurf; das Dashboard zeigt den Stand an.</p>
        <h3>Was passiert nach der Testphase?</h3>
        <p>Es läuft kein Tarif automatisch weiter und es wird nichts abgebucht. Ohne Buchung pausiert der Zugriff auf Anfragen und KI-Funktionen; Anmeldung, Einstellungen, Export und Löschung bleiben möglich. Ihre Daten bleiben erhalten, bis Sie den Betrieb löschen oder die Aufbewahrungsfrist abläuft.</p>
        <h3>Sind die Preise endgültig?</h3>
        <p>{PLAN_TERMS.intro} Wir prüfen die Preise mit den ersten Kunden; bestehende Verträge behalten ihren Preis.</p>
        <h3>Wie kündige ich?</h3>
        <p>Jederzeit im Kundenportal zum Ende des Abrechnungsmonats. Danach können Sie Ihre Daten weiter exportieren; gelöscht wird nach der eingestellten Aufbewahrungsfrist oder sofort, wenn Sie den Betrieb löschen.</p>
      </div>
    </div>
  );
}

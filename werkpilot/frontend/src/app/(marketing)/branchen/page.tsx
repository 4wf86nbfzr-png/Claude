import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Branchenlösungen", description: "Clairify für Elektriker, Sanitär- und Heizungsbetriebe, Maler, Dachdecker, Gebäudereiniger, Garten- und Landschaftsbau und kleine Bauunternehmen." };

const trades = [
  { n: "Elektrobetriebe", s: "Stromausfall und Sicherungsprobleme werden als Notfall erkannt. Rückfrage nach Gerät, Foto vom Zählerschrank und Adresse ist vorbereitet." },
  { n: "Sanitär, Heizung, Klima", s: "Heizungsausfall, Rohrbruch, kein Warmwasser: oben in der Liste. Wartungsanfragen landen mit niedriger Priorität im Wochenplan." },
  { n: "Malerbetriebe", s: "Angebotsanfragen mit Quadratmetern, Fotos und Wunschtermin. Nachfassen nach fünf Tagen, ohne dass jemand dran denken muss." },
  { n: "Dachdecker", s: "Sturmschäden werden sofort als dringend markiert. Terminvorschläge für die Besichtigung sind im ersten Entwurf drin." },
  { n: "Gebäudereinigung", s: "Regelmäßige Objekte, Sonderreinigungen, Angebotsanfragen von Hausverwaltungen, getrennt nach Kategorie und Kunde." },
  { n: "Garten- und Landschaftsbau", s: "Saisonale Anfragewellen abfangen: Eingangsbestätigung mit Rückfragen geht sofort raus, Besichtigungstermine werden gebündelt." },
  { n: "Kleine Bauunternehmen", s: "Anbau, Sanierung, Umbau: fehlende Angaben werden gezielt nachgefragt, Angebote bleiben im Blick." },
];

export default function Branchen() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Branchenlösungen</h1>
      <p className="mt-3 max-w-2xl text-ink-2">Die Klassifizierung kennt die typischen Anliegen Ihres Gewerks. Sie wählen es bei der Registrierung, alles andere passt sich an.</p>
      <div className="mt-12 divide-y divide-line border-t border-line">
        {trades.map((t, i) => (
          <section key={t.n} className="grid gap-2 py-6 md:grid-cols-[80px_300px_1fr] md:gap-8">
            <span className="mono text-sm text-muted" aria-hidden>0{i + 1}</span>
            <h2 className="text-xl font-semibold">{t.n}</h2>
            <p className="text-sm text-ink-2 md:text-[15px]">{t.s}</p>
          </section>
        ))}
      </div>
      <div className="mt-12"><Button href="/demo" variant="secondary">Mit einer eigenen Anfrage testen</Button></div>
    </div>
  );
}

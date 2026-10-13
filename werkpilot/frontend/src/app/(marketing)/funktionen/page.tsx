import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Funktionen", description: "Anfrageverwaltung, Antwortentwürfe der KI, Terminvorschläge, Angebotsnachverfolgung, Wochenberichte, alle Funktionen von Clairify." };

const groups = [
  { h: "Anfragen", items: [
    ["Automatische Erfassung", "Weiterleitung aus dem Postfach, Formular der Website (Webhook) oder manuell nach einem Anruf. Dubletten werden erkannt."],
    ["Klassifizierung & Priorität", "Notfall, Reparatur, Neuinstallation, Wartung, Angebot, Terminfrage, Beschwerde, Spam. Notfälle stehen oben."],
    ["Zusammenfassung", "Zwei Sätze statt zehn Zeilen Kundentext. Mit extrahierter Adresse und Zeitwunsch, wenn genannt."],
    ["Fehlende Angaben", "Die KI erkennt, was zur Einschätzung fehlt, und fragt es im Entwurf konkret nach."],
  ]},
  { h: "Antworten", items: [
    ["Antwortentwürfe", "In Ihrem Namen, höfliche Sie Anrede, mit Ihrer Signatur. Sie bearbeiten, geben frei oder verwerfen."],
    ["Freigaberegeln", "Entwürfe mit Warnhinweisen (geringe Sicherheit, Preisaussage, Beschwerde) werden nie automatisch gesendet."],
    ["Automatisches Senden (Business)", "Optional für saubere Fälle: Eingangsbestätigung mit Rückfragen und Terminvorschlägen geht sofort raus."],
    ["Gesprächsverlauf", "Alle Nachrichten einer Anfrage an einem Ort, inklusive interner Notizen."],
  ]},
  { h: "Termine & Angebote", items: [
    ["Terminvorschläge", "Aus Ihren Geschäftszeiten abzüglich belegter Zeiten. Google Kalender optional angebunden."],
    ["Terminbestätigung", "Bestätigte Termine landen im Kalender, andere Vorschläge werden freigegeben."],
    ["Angebotsnachverfolgung", "Sie tragen ein gestelltes Angebot ein, Clairify erinnert nach 5 Tagen und legt einen Entwurf zum Nachfassen an."],
    ["Status je Vorgang", "Neu, in Prüfung, wartet auf Kunde, Termin, Angebot, gewonnen, verloren."],
  ]},
  { h: "Übersicht & Betrieb", items: [
    ["Dashboard mit echten Zahlen", "Offene Vorgänge, Reaktionszeit, Entwürfe zur Prüfung, Termine, offene Angebote. Keine Schätzungen."],
    ["Wochenbericht", "Freitags per Mail: neue Anfragen, Reaktionszeit, offene Angebote, Termine."],
    ["Kundenübersicht", "Endkunden mit Verlauf, Export als CSV."],
    ["Nutzer & Rollen", "Inhaber, Admin, Mitarbeiter. Jede Berechtigung wird serverseitig geprüft."],
    ["Datenschutz", "Datenexport, Löschung, einstellbare Aufbewahrungsfrist, Protokoll aller automatischen Aktionen."],
  ]},
];

export default function Funktionen() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Funktionen</h1>
      <p className="mt-3 max-w-2xl text-ink-2">Alles, was hier steht, ist eingebaut. Was noch nicht geht (WhatsApp, Telefonannahme, Microsoft Kalender), steht ehrlich im Hilfezentrum.</p>
      {/* Zeilen mit Linien statt gleichförmiger Karten; Nummer in Mono wie auf der Startseite */}
      <div className="mt-12 space-y-14">
        {groups.map((g, gi) => (
          <section key={g.h} className="md:grid md:grid-cols-[220px_1fr] md:gap-10">
            <h2 className="mb-4 text-2xl font-semibold md:mb-0"><span className="mono mr-3 text-sm text-muted">0{gi + 1}</span>{g.h}</h2>
            <dl className="divide-y divide-line border-t border-line">
              {g.items.map(([t, d]) => (
                <div key={t} className="grid gap-1 py-4 md:grid-cols-[260px_1fr] md:gap-8">
                  <dt className="font-semibold">{t}</dt>
                  <dd className="text-sm text-ink-2 md:text-[15px]">{d}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="mt-12"><Button href="/registrieren">Kostenlos testen</Button></div>
    </div>
  );
}

import type { Metadata } from "next";
import { Button } from "@/components/ui";

export const metadata: Metadata = { title: "Funktionen", description: "Anfrageverwaltung, KI-Antwortentwürfe, Terminvorschläge, Angebotsnachverfolgung, Wochenberichte – alle Funktionen von WerkPilot AI." };

const groups = [
  { h: "Anfragen", items: [
    ["Automatische Erfassung", "E-Mail-Weiterleitung, Website-Formular (Webhook) oder manuell nach einem Anruf. Dubletten werden erkannt."],
    ["Klassifizierung & Priorität", "Notfall, Reparatur, Neuinstallation, Wartung, Angebot, Terminfrage, Beschwerde, Spam. Notfälle stehen oben."],
    ["Zusammenfassung", "Zwei Sätze statt zehn Zeilen Kundentext. Mit extrahierter Adresse und Zeitwunsch, wenn genannt."],
    ["Fehlende Angaben", "Die KI erkennt, was zur Einschätzung fehlt, und fragt es im Entwurf konkret nach."],
  ]},
  { h: "Antworten", items: [
    ["Antwortentwürfe", "In Ihrem Namen, Sie-Form, mit Ihrer Signatur. Sie bearbeiten, geben frei oder verwerfen."],
    ["Freigabe-Regeln", "Entwürfe mit Warnhinweisen (geringe Sicherheit, Preisaussage, Beschwerde) werden nie automatisch gesendet."],
    ["Automatisches Senden (Business)", "Optional für saubere Fälle: Eingangsbestätigung mit Rückfragen und Terminvorschlägen geht sofort raus."],
    ["Gesprächsverlauf", "Alle Nachrichten einer Anfrage an einem Ort, inklusive interner Notizen."],
  ]},
  { h: "Termine & Angebote", items: [
    ["Terminvorschläge", "Aus Ihren Geschäftszeiten abzüglich belegter Zeiten. Google Kalender optional angebunden."],
    ["Terminbestätigung", "Bestätigte Termine landen im Kalender, andere Vorschläge werden freigegeben."],
    ["Angebotsnachverfolgung", "Sie tragen ein gestelltes Angebot ein, WerkPilot erinnert nach 5 Tagen und legt einen Nachfass-Entwurf an."],
    ["Status je Vorgang", "Neu, in Prüfung, wartet auf Kunde, Termin, Angebot, gewonnen, verloren."],
  ]},
  { h: "Übersicht & Betrieb", items: [
    ["Dashboard mit echten Zahlen", "Offene Vorgänge, Reaktionszeit, Entwürfe zur Prüfung, Termine, offene Angebote. Keine Schätzungen."],
    ["Wochenbericht", "Freitags per E-Mail: neue Anfragen, Reaktionszeit, offene Angebote, Termine."],
    ["Kundenübersicht", "Endkunden mit Verlauf, Export als CSV."],
    ["Nutzer & Rollen", "Inhaber, Admin, Mitarbeiter. Jede Berechtigung wird serverseitig geprüft."],
    ["Datenschutz", "Datenexport, Löschung, einstellbare Aufbewahrungsfrist, Audit-Protokoll aller automatischen Aktionen."],
  ]},
];

export default function Funktionen() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold md:text-4xl">Funktionen</h1>
      <p className="mt-3 max-w-2xl text-ink-2">Alles, was hier steht, ist eingebaut. Was noch nicht geht (WhatsApp, Telefonannahme, Microsoft-Kalender), steht ehrlich im Hilfezentrum.</p>
      <div className="mt-10 space-y-12">
        {groups.map((g) => (
          <section key={g.h}>
            <h2 className="mb-4 text-xl font-semibold">{g.h}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {g.items.map(([t, d]) => (
                <div key={t} className="rounded-[var(--radius-card)] border border-line bg-paper p-5">
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-ink-2">{d}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-12"><Button href="/registrieren">Kostenlos testen</Button></div>
    </div>
  );
}

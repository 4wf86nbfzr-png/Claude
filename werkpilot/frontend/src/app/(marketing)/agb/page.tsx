import type { Metadata } from "next";
import { DraftNotice, PH } from "@/components/legal";

export const metadata: Metadata = { title: "AGB", robots: { index: false } };

export default function AGB() {
  return (
    <div className="prose mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Allgemeine Geschäftsbedingungen</h1>
      <DraftNotice items={["Anbieterdaten", "Prüfung der Haftungsklauseln nach § 307 ff. BGB", "Verfügbarkeitszusage (SLA) festlegen oder bewusst weglassen", "Preisänderungsklausel prüfen", "Regelung zur Nutzung von KI-Ausgaben (keine Gewähr für Richtigkeit) prüfen", "AVV als Anlage", "B2B-Ausschluss von Verbrauchern prüfen"]} />
      <h2>§ 1 Geltungsbereich</h2>
      <p>Diese AGB gelten für alle Verträge zwischen {PH("Anbieter")} („WerkPilot“) und Unternehmern im Sinne des § 14 BGB über die Nutzung der Software WerkPilot AI. Ein Angebot an Verbraucher erfolgt nicht.</p>
      <h2>§ 2 Leistung</h2>
      <p>WerkPilot stellt eine webbasierte Software zur Erfassung, Einordnung und Beantwortung von Kundenanfragen, zur Terminorganisation und zur Nachverfolgung von Angeboten bereit. Der Funktionsumfang ergibt sich aus dem gewählten Tarif. KI-generierte Inhalte sind Entwürfe; der Kunde prüft sie vor Verwendung. WerkPilot trifft keine Preisentscheidungen, technischen Diagnosen oder rechtsverbindlichen Erklärungen gegenüber Endkunden des Kunden.</p>
      <h2>§ 3 Testphase, Vertragsschluss, Laufzeit</h2>
      <p>Die kostenlose Testphase dauert 14 Tage und endet automatisch. Ein kostenpflichtiger Vertrag kommt durch Abschluss des Bestellvorgangs im Kundenportal zustande. Die Laufzeit beträgt einen Monat und verlängert sich jeweils um einen Monat, wenn nicht zum Laufzeitende gekündigt wird.</p>
      <h2>§ 4 Preise und Zahlung</h2>
      <p>Es gelten die zum Zeitpunkt der Bestellung ausgewiesenen Preise zzgl. Umsatzsteuer. Die Abrechnung erfolgt monatlich im Voraus über den Zahlungsdienstleister Stripe. Bei Zahlungsverzug kann WerkPilot den Zugang nach Ankündigung einschränken.</p>
      <h2>§ 5 Pflichten des Kunden</h2>
      <p>Der Kunde stellt sicher, dass er zur Verarbeitung der Daten seiner Endkunden berechtigt ist, schließt den Auftragsverarbeitungsvertrag ab und hält Zugangsdaten geheim. Der Kunde prüft KI-Entwürfe vor dem Versand, sofern er automatische Antworten nicht ausdrücklich aktiviert hat.</p>
      <h2>§ 6 Verfügbarkeit und Haftung</h2>
      <p>{PH("Verfügbarkeitszusage, Wartungsfenster")}. WerkPilot haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der Verletzung von Leben, Körper und Gesundheit. Bei einfacher Fahrlässigkeit haftet WerkPilot nur bei Verletzung wesentlicher Vertragspflichten, begrenzt auf den vertragstypischen, vorhersehbaren Schaden. {PH("Anwaltlich prüfen")}</p>
      <h2>§ 7 Datenschutz</h2>
      <p>Es gelten die Datenschutzerklärung und der Auftragsverarbeitungsvertrag. Nach Vertragsende kann der Kunde seine Daten 30 Tage lang exportieren; danach werden sie gelöscht, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.</p>
      <h2>§ 8 Schlussbestimmungen</h2>
      <p>Es gilt deutsches Recht. Gerichtsstand ist {PH("Ort")}, sofern der Kunde Kaufmann ist.</p>
      <p className="text-sm text-muted">Stand: {PH("Datum")}</p>
    </div>
  );
}

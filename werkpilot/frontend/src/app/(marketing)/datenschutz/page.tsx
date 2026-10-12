import type { Metadata } from "next";
import { DraftNotice, PH } from "@/components/legal";

export const metadata: Metadata = { title: "Datenschutzerklärung", robots: { index: false } };

export default function Datenschutz() {
  return (
    <div className="prose mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Datenschutzerklärung</h1>
      <DraftNotice items={["Verantwortlicher mit Anschrift und Kontakt", "Datenschutzbeauftragte/r (falls Pflicht nach § 38 BDSG)", "Hosting-Anbieter und Serverstandort benennen, AV-Vertrag abschließen", "KI-Anbieter benennen (z.B. Anthropic/OpenAI): AV-Vertrag, Drittlandtransfer (Standardvertragsklauseln / DPF) prüfen, ggf. EU-Endpunkte nutzen", "E-Mail-Versanddienst (z.B. Resend) und Zahlungsanbieter (Stripe) als Empfänger aufführen, AV-Verträge", "Google-Kalender-Anbindung: Google als Empfänger, Rechtsgrundlage Vertrag/Einwilligung", "Speicherfristen konkret angeben (Standard 365 Tage nach Abschluss, konfigurierbar)", "Auftragsverarbeitungsvertrag (AVV) mit Kunden (Handwerksbetrieben) bereitstellen, Art. 28 DSGVO", "Verarbeitungsverzeichnis anlegen (Art. 30)", "TDDDG § 25: Nur technisch notwendige Speicherung (Session-Cookies) – kein Consent-Banner nötig, prüfen", "Datenschutz-Folgenabschätzung (Art. 35) prüfen, da KI-Verarbeitung von Kundenkommunikation"]} />
      <h2>1. Verantwortlicher</h2>
      <p>{PH("Firmenname, Anschrift, E-Mail")}</p>
      <h2>2. Welche Daten wir verarbeiten</h2>
      <p><strong>Website-Besuch:</strong> Server-Logs (IP-Adresse gekürzt, Zeitpunkt, aufgerufene Seite, Browser) zur Sicherstellung des Betriebs und der Sicherheit. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Löschung nach {PH("z.B. 14 Tagen")}.</p>
      <p><strong>Kontaktanfrage:</strong> Betrieb, Name, E-Mail, optional Telefon, Gewerk, Betriebsgröße, Nachricht. Zweck: Beantwortung Ihrer Anfrage. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Wir senden keine Werbung ohne Ihre Einwilligung.</p>
      <p><strong>Kundenkonto:</strong> E-Mail, Name, Passwort (nur als Hash gespeichert), Betriebsdaten, Nutzer und Rollen, Anmeldezeitpunkte und Sicherheitsereignisse. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</p>
      <p><strong>Daten Ihrer Endkunden (Auftragsverarbeitung):</strong> Kundenanfragen, Kontaktdaten, Nachrichtenverläufe, Termine und Angebote verarbeiten wir ausschließlich im Auftrag und nach Weisung des jeweiligen Handwerksbetriebs (Art. 28 DSGVO). Dafür schließen wir mit jedem Kunden einen Auftragsverarbeitungsvertrag. {PH("AVV-Link")}</p>
      <h2>3. Einsatz von KI</h2>
      <p>Zur Klassifizierung von Anfragen und zur Erstellung von Antwortentwürfen übermitteln wir den Anfragetext an einen KI-Anbieter: {PH("Anbieter, Sitz, Vertragsgrundlage, Drittlandtransfer")}. Die Entwürfe werden vor dem Versand vom Betrieb geprüft, sofern dieser keine automatische Eingangsbestätigung aktiviert hat. Es findet keine automatisierte Entscheidung mit rechtlicher Wirkung gegenüber Betroffenen statt (Art. 22 DSGVO). Kundentexte werden nicht zum Training von KI-Modellen verwendet. {PH("Beim Anbieter vertraglich sicherstellen")}</p>
      <h2>4. Empfänger</h2>
      <ul>
        <li>Hosting: {PH("Anbieter, Standort EU")}</li>
        <li>E-Mail-Versand: {PH("Anbieter")}</li>
        <li>Zahlungsabwicklung: Stripe Payments Europe, Ltd., Dublin, Irland. Wir speichern keine Kartendaten. Stripe-Datenschutz: stripe.com/de/privacy</li>
        <li>KI-Anbieter: {PH("Anbieter")}</li>
        <li>Google LLC (nur bei aktivierter Google-Kalender-Anbindung, auf Ihre Veranlassung)</li>
      </ul>
      <h2>5. Cookies und Speicherung im Browser</h2>
      <p>Wir setzen ausschließlich technisch notwendige Cookies für die Anmeldung (Sitzungs- und Erneuerungstoken, httpOnly). Es gibt keine Tracking- oder Marketing-Cookies und keine Einbindung externer Schriftarten oder Analysedienste. {PH("Falls später datenschutzfreundliche Analytics (z.B. selbst gehostet, ohne Cookies) eingesetzt werden: hier ergänzen")}</p>
      <h2>6. Speicherdauer</h2>
      <p>Kontodaten: bis zur Löschung des Kontos. Vorgangsdaten: gemäß der vom Betrieb eingestellten Aufbewahrungsfrist (Standard 365 Tage nach Abschluss). Abrechnungsdaten: gesetzliche Aufbewahrungsfristen (10 Jahre). Nach Vertragsende können Daten exportiert werden; danach werden sie gelöscht.</p>
      <h2>7. Ihre Rechte</h2>
      <p>Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch (Art. 15–21 DSGVO) sowie Beschwerde bei einer Aufsichtsbehörde. Kunden können Export und Löschung direkt im Dashboard auslösen.</p>
      <h2>8. Sicherheit</h2>
      <p>TLS-Verschlüsselung, Passwort-Hashing (Argon2id), verschlüsselte Speicherung von Zugangstoken zu Fremdsystemen, Rollen- und Rechteprüfung, Protokollierung sicherheitsrelevanter Ereignisse, tägliche Backups.</p>
      <p className="text-sm text-muted">Stand: {PH("Datum")}</p>
    </div>
  );
}

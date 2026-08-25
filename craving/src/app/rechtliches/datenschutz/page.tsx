import type { Metadata } from "next";
import { LegalPage, Placeholder } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Datenschutz" };

export default function DatenschutzPage() {
  return (
    <LegalPage kicker="DSGVO" title="Datenschutz">
      <h2>Verantwortlicher</h2>
      <p>
        <Placeholder>Firma, Anschrift, Kontakt</Placeholder>. Ein
        Datenschutzbeauftragter ist <Placeholder>benannt / nicht benannt</Placeholder>.
      </p>

      <h2>Was diese Anwendung speichert</h2>
      <p>
        Die Anwendung kommt ohne Konto aus. Warenkorb, Favoriten, Adressen und
        Bestellhistorie werden ausschliesslich <strong>lokal im Browser</strong>{" "}
        gespeichert (localStorage) und nicht an uns uebertragen, solange keine
        Bestellung abgeschickt wird.
      </p>
      <ul>
        <li><strong>craving.cart.v1</strong> — Warenkorb, Lieferart, PLZ, Trinkgeld</li>
        <li><strong>craving.account.v1</strong> — Profil, Adressen, Favoriten, Bestellungen</li>
      </ul>
      <p>
        Diese Daten lassen sich jederzeit ueber die Browsereinstellungen loeschen.
        Es werden keine Cookies zu Werbe- oder Analysezwecken gesetzt, es sind
        keine Tracking-Dienste eingebunden und es werden keine Schriften von
        fremden Servern nachgeladen — Google Fonts wird zum Build-Zeitpunkt
        eingebettet, nicht zur Laufzeit geladen.
      </p>

      <h2>Bestellung</h2>
      <p>
        Im Testbetrieb werden keine Bestellungen an einen Server uebertragen.
        Sobald die Anwendung produktiv laeuft, werden die zur Abwicklung noetigen
        Daten verarbeitet: Name, Anschrift, Telefonnummer, E-Mail-Adresse,
        Bestellinhalt und Zahlungsart. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b
        DSGVO (Vertragserfuellung). Aufbewahrungsfristen ergeben sich aus
        handels- und steuerrechtlichen Vorgaben.
      </p>

      <h2>Empfaenger</h2>
      <p>
        Geplante Auftragsverarbeiter und Dienstleister:{" "}
        <Placeholder>Hosting</Placeholder>, <Placeholder>Zahlungsdienstleister</Placeholder>,{" "}
        <Placeholder>Lieferdienst</Placeholder>. Mit jedem wird vor dem Live-Gang
        ein Vertrag zur Auftragsverarbeitung geschlossen.
      </p>

      <h2>Server-Logdateien</h2>
      <p>
        Beim Aufruf werden technisch notwendige Daten verarbeitet (IP-Adresse,
        Zeitpunkt, aufgerufene Ressource, User-Agent). Rechtsgrundlage ist
        Art. 6 Abs. 1 lit. f DSGVO. Speicherdauer:{" "}
        <Placeholder>vom Hoster einzutragen</Placeholder>.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Auskunft, Berichtigung, Loeschung, Einschraenkung, Datenuebertragbarkeit
        und Widerspruch nach Art. 15 bis 21 DSGVO. Ausserdem besteht ein
        Beschwerderecht bei einer Aufsichtsbehoerde.
      </p>
    </LegalPage>
  );
}

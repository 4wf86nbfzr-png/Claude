import type { Metadata } from "next";
import { LegalPage, Placeholder } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "AGB" };

export default function AgbPage() {
  return (
    <LegalPage kicker="Bedingungen" title="AGB">
      <h2>Geltungsbereich</h2>
      <p>
        Diese Bedingungen gelten fuer Bestellungen ueber diese Anwendung.
        Anbieter ist <Placeholder>Firma</Placeholder>.
      </p>

      <h2>Vertragsschluss</h2>
      <p>
        Die Darstellung der Speisen ist kein bindendes Angebot. Mit dem Absenden
        der Bestellung gibst du ein Angebot ab; der Vertrag kommt mit unserer
        Bestaetigung zustande.
      </p>
      <p>
        <strong>Testbetrieb:</strong> Aktuell werden keine verbindlichen
        Bestellungen ausgeloest und keine Zahlungen abgewickelt. Die Anwendung
        dient der internen Abnahme.
      </p>

      <h2>Preise und Zahlung</h2>
      <p>
        Alle Preise verstehen sich inklusive der gesetzlichen Umsatzsteuer.
        Lieferkosten und Mindestbestellwerte richten sich nach dem Liefergebiet
        und werden vor dem Abschluss angezeigt.
      </p>

      <h2>Lieferung</h2>
      <p>
        Lieferzeiten sind Schaetzungen und keine zugesicherten Eigenschaften.
        Wir liefern nur in die im Bestellvorgang genannten Postleitzahlen.
      </p>

      <h2>Widerrufsrecht</h2>
      <p>
        Bei der Lieferung von Speisen und Getraenken, die schnell verderben oder
        deren Verfalldatum schnell ueberschritten wuerde, besteht nach § 312g
        Abs. 2 Nr. 2 BGB kein Widerrufsrecht. Einzelheiten:{" "}
        <a href="/rechtliches/widerruf">Hinweise zum Widerruf</a>.
      </p>

      <h2>Allergene</h2>
      <p>
        Angaben zu Allergenen und Zusatzstoffen finden sich bei jeder Zutat und
        gesammelt unter <a href="/rechtliches/allergene">Allergene</a>. In einer
        offenen Kueche lassen sich Spuren nicht ausschliessen.
      </p>
    </LegalPage>
  );
}

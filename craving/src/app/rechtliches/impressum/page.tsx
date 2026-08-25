import type { Metadata } from "next";
import { LegalPage, Placeholder } from "@/components/ui/Prose";
import { BRAND } from "@/data/config";

export const metadata: Metadata = { title: "Impressum" };

export default function ImpressumPage() {
  return (
    <LegalPage kicker="Pflichtangaben" title="Impressum">
      <h2>Anbieter</h2>
      <p>
        Angaben gemaess § 5 DDG (vormals § 5 TMG). Die folgenden Felder sind
        Platzhalter des Testbetriebs:
      </p>
      <dl>
        <dt>Firma</dt>
        <dd><Placeholder>{BRAND.legalName}</Placeholder></dd>
        <dt>Anschrift</dt>
        <dd>
          <Placeholder>Strasse und Hausnummer</Placeholder>, <Placeholder>PLZ Ort</Placeholder>
        </dd>
        <dt>Vertretungsberechtigt</dt>
        <dd><Placeholder>Name der Geschaeftsfuehrung</Placeholder></dd>
        <dt>Telefon</dt>
        <dd><Placeholder>Telefonnummer</Placeholder></dd>
        <dt>E-Mail</dt>
        <dd><Placeholder>E-Mail-Adresse</Placeholder></dd>
        <dt>Handelsregister</dt>
        <dd><Placeholder>Registergericht und Nummer</Placeholder></dd>
        <dt>Umsatzsteuer-Identifikationsnummer</dt>
        <dd><Placeholder>USt-IdNr. gemaess § 27 a UStG</Placeholder></dd>
        <dt>Zustaendige Aufsichtsbehoerde (Lebensmittelueberwachung)</dt>
        <dd><Placeholder>Behoerde</Placeholder></dd>
      </dl>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Wir sind <Placeholder>bereit / nicht bereit</Placeholder>, an einem
        Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen. Die zustaendige Stelle wird hier benannt, sobald die
        Entscheidung getroffen ist.
      </p>

      <h2>Verantwortlich fuer den Inhalt</h2>
      <p>
        <Placeholder>Name und Anschrift der verantwortlichen Person</Placeholder>
      </p>

      <h2>Hosting</h2>
      <p>
        Diese Anwendung wird bei <Placeholder>Hosting-Dienstleister</Placeholder>{" "}
        betrieben. Details stehen in der Datenschutzerklaerung.
      </p>
    </LegalPage>
  );
}

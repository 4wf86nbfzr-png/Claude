import type { Metadata } from "next";
import { DraftNotice, PH } from "@/components/legal";

export const metadata: Metadata = { title: "Impressum", robots: { index: false } };

export default function Impressum() {
  return (
    <div className="prose mx-auto max-w-3xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Impressum</h1>
      <DraftNotice items={["Vollständiger Firmenname und Rechtsform", "Anschrift (ladungsfähig)", "Vertretungsberechtigte Person(en)", "Handelsregister und Registernummer (falls eingetragen)", "Umsatzsteuer-ID nach § 27a UStG", "E-Mail und Telefon", "Verantwortliche Person für Inhalte (§ 18 Abs. 2 MStV)", "Hinweis auf EU-Streitschlichtung und § 36 VSBG prüfen", "Prüfung: DDG § 5 Pflichtangaben vollständig?"]} />
      <h2>Angaben gemäß § 5 DDG</h2>
      <p>{PH("Firmenname / Rechtsform")}<br />{PH("Straße Hausnummer")}<br />{PH("PLZ Ort")}<br />Deutschland</p>
      <p>Vertreten durch: {PH("Name der Inhaberin / des Inhabers oder Geschäftsführung")}</p>
      <h2>Kontakt</h2>
      <p>Telefon: {PH("Telefonnummer")}<br />E-Mail: {PH("E-Mail-Adresse")}</p>
      <h2>Registereintrag</h2>
      <p>{PH("Registergericht und Registernummer, falls vorhanden")}</p>
      <h2>Umsatzsteuer-ID</h2>
      <p>Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: {PH("USt-IdNr.")}</p>
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{PH("Name, Anschrift")}</p>
      <h2>Streitbeilegung</h2>
      <p>Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. {PH("Prüfen: Clairify richtet sich an Unternehmer (B2B); Verbraucherhinweise ggf. entbehrlich.")}</p>
    </div>
  );
}

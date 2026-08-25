import type { Metadata } from "next";
import { LegalPage, Placeholder } from "@/components/ui/Prose";

export const metadata: Metadata = { title: "Widerruf" };

export default function WiderrufPage() {
  return (
    <LegalPage kicker="Verbraucherinformation" title="Hinweise zum Widerruf">
      <h2>Kein Widerrufsrecht bei Speisen</h2>
      <p>
        Fuer die Lieferung frisch zubereiteter Speisen und von Getraenken, die
        schnell verderben koennen, besteht kein Widerrufsrecht (§ 312g Abs. 2
        Nr. 2 und Nr. 4 BGB). Das betrifft praktisch das gesamte Sortiment
        dieser Anwendung.
      </p>

      <h2>Stornierung vor Zubereitung</h2>
      <p>
        Solange die Zubereitung noch nicht begonnen hat, kann eine Bestellung
        telefonisch storniert werden:{" "}
        <Placeholder>Telefonnummer</Placeholder>. Massgeblich ist der Status in
        der Bestellverfolgung.
      </p>

      <h2>Reklamation</h2>
      <p>
        Stimmt etwas mit der Lieferung nicht, melde dich bitte am selben Tag.
        Wir klaeren das unbuerokratisch.
      </p>
    </LegalPage>
  );
}

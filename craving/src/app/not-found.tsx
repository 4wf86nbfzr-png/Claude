import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="shell flex min-h-[70dvh] flex-col justify-center py-24">
      <p className="kicker">Fehler 404</p>
      <h1 className="display display-xl mt-4">Nichts gefunden.</h1>
      <p className="lede mt-6">
        Diese Seite gibt es nicht — oder nicht mehr. Der Hunger bleibt trotzdem.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/bauen" size="lg">
          Etwas bauen
        </ButtonLink>
        <ButtonLink href="/menue" variant="outline" size="lg">
          Zum Menue
        </ButtonLink>
      </div>
      <p className="mt-10 text-sm text-muted">
        Oder zurueck zur <Link href="/" className="underline underline-offset-2">Startseite</Link>.
      </p>
    </div>
  );
}

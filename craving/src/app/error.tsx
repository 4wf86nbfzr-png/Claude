"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";

/**
 * Fehlergrenze der Anwendung. Wichtig: der Warenkorb liegt im localStorage
 * und ueberlebt diesen Zustand — das sagen wir hier auch.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Platzhalter fuer die spaetere Fehlerueberwachung (z. B. Sentry).
    console.error(error);
  }, [error]);

  return (
    <div className="shell flex min-h-[70dvh] flex-col justify-center py-24">
      <p className="kicker">Etwas ist schiefgelaufen</p>
      <h1 className="display display-l mt-4">Kurz verschluckt.</h1>
      <p className="lede mt-6">
        Die Seite konnte nicht geladen werden. Dein Warenkorb ist gespeichert und
        noch da.
      </p>
      {error.digest && <p className="num mt-4 text-xs text-muted">Kennung: {error.digest}</p>}
      <div className="mt-10 flex flex-wrap gap-3">
        <Button size="lg" onClick={reset}>
          Nochmal versuchen
        </Button>
        <ButtonLink href="/" variant="outline" size="lg">
          Zur Startseite
        </ButtonLink>
      </div>
    </div>
  );
}

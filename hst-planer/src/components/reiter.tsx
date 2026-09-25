'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface ReiterEintrag {
  href: string;
  label: string;
  /** Kleiner Zusatz rechts vom Wort, z. B. eine Anzahl. */
  zahl?: number;
}

/**
 * Reiter innerhalb einer Detailseite. Ein Reiter ist ein eigener Pfad,
 * kein umgeschalteter Zustand – dadurch bleibt jede Ansicht verlinkbar
 * und der Zurück-Knopf tut, was er soll.
 */
export function Reiter({ eintraege, basis }: { eintraege: ReiterEintrag[]; basis: string }) {
  const aktuell = usePathname();
  return (
    <nav aria-label="Bereiche" className="reiter nicht-drucken">
      {eintraege.map((eintrag) => {
        const aktiv = eintrag.href === basis ? aktuell === basis : aktuell.startsWith(eintrag.href);
        return (
          <Link key={eintrag.href} href={eintrag.href} aria-current={aktiv ? 'page' : undefined}>
            {eintrag.label}
            {typeof eintrag.zahl === 'number' && eintrag.zahl > 0 && (
              <span className="reiter-zahl">{eintrag.zahl}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

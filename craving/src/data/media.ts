/**
 * Bewegtbild-Slots.
 *
 * Die Startseite hat feste Plaetze fuer kurze Kuechen-Aufnahmen (Kaese
 * ueber die Pizza, Fleisch vom Spiess, Kaesefaden beim Croque). Solange
 * hier keine Datei eingetragen ist, zeigt der Slot die prozedurale
 * Produktdarstellung — es entsteht also nie ein leeres Loch im Layout.
 *
 * Zum Aktivieren: Datei unter public/video/ ablegen und Pfade eintragen.
 * Anforderungen an das Material siehe docs/ASSETS.md.
 */
export interface CinematicSource {
  /** Kategorie, deren Slot befuellt wird. */
  categoryId: string;
  /** Kurze, tonlose Schleife. */
  webm?: string;
  mp4?: string;
  /** Standbild fuer den ersten Frame (AVIF/WebP). */
  poster?: string;
  /** Bildbeschreibung fuer Screenreader. */
  alt: string;
}

export const CINEMATICS: CinematicSource[] = [
  // Beispiel (auskommentiert, bis echtes Material vorliegt):
  // {
  //   categoryId: "pizza",
  //   webm: "/video/pizza-kaese.webm",
  //   mp4: "/video/pizza-kaese.mp4",
  //   poster: "/video/pizza-kaese.avif",
  //   alt: "Kaese wird ueber die Pizza gezogen",
  // },
];

export function cinematicFor(categoryId: string): CinematicSource | undefined {
  return CINEMATICS.find((c) => c.categoryId === categoryId);
}

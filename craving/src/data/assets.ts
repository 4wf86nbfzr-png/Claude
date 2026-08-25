/**
 * Fotomaterial des Builders.
 *
 * Alle Pfade an einer Stelle — so laesst sich eine Zutat auf neues
 * Bildmaterial umstellen, ohne die Zutatenliste anzufassen. Erzeugt
 * werden die Dateien aus den Vorlagenfotos mit
 *   python3 tools/build-sprites.py     (Freisteller)
 *   python3 tools/build-textures.py    (Flaechentexturen)
 * Siehe docs/ASSETS.md.
 */

const S = "/food/sprites";

/** Freisteller: mehrere Varianten je Zutat, damit sich Stuecke unterscheiden. */
export const SPRITES = {
  olive: [`${S}/olive-1.webp`, `${S}/olive-2.webp`, `${S}/olive-3.webp`],
  paprika: [`${S}/paprika-1.webp`, `${S}/paprika-2.webp`, `${S}/paprika-3.webp`],
  salami: [`${S}/salami-1.webp`, `${S}/salami-2.webp`, `${S}/salami-3.webp`],
  doenerfleisch: [`${S}/dnfleisch-1.webp`, `${S}/dnfleisch-2.webp`, `${S}/dnfleisch-3.webp`],
  salat: [`${S}/dnsalat-1.webp`, `${S}/dnsalat-2.webp`, `${S}/dnsalat-3.webp`],
  tomate: [`${S}/dntomate-1.webp`, `${S}/dntomate-2.webp`],
  rotzwiebel: [`${S}/dnzwiebel-1.webp`, `${S}/dnzwiebel-2.webp`],
} as const;

/**
 * Grosse Fotoflaechen fuer Teig, Kaese, Brot, Sosse und Fleisch.
 *
 * Bewusst KEINE kleinen Kacheln: ein wiederholtes Muster verraet sich im
 * Produkt sofort. Diese Felder sind so gross, dass sie die Form in einem
 * Durchgang abdecken (siehe tools/build-fields.py).
 */
export const TEXTURES = {
  kaese: "/food/fields/kaese.webp",
  teig: "/food/fields/teig.webp",
  sosse: "/food/fields/sosse.webp",
  fladenbrot: "/food/fields/fladenbrot.webp",
  doenerfleisch: "/food/fields/doenerfleisch.webp",
  champignon: "/food/fields/champignon.webp",
  hackfleisch: "/food/fields/hackfleisch.webp",
} as const;

export type TextureName = keyof typeof TEXTURES;

export function textureUrl(name?: string): string | undefined {
  if (!name) return undefined;
  return TEXTURES[name as TextureName];
}

/** Farbkorrekturen, um verwandte Zutaten aus demselben Foto abzuleiten. */
export const TINT = {
  /** Sucuk: dunkler und roter als Salami. */
  sucuk: "saturate(1.25) brightness(0.72) hue-rotate(-8deg)",
  /** Jalapeno: kraeftiger und kuehler als Paprika. */
  jalapeno: "saturate(1.35) brightness(0.82) hue-rotate(12deg)",
  /** Rucola/Spinat: dunkleres Blattgruen. */
  blattgruen: "saturate(1.1) brightness(0.7) hue-rotate(-10deg)",
  /** Haehnchen: heller als Kalbfleisch vom Spiess. */
  haehnchen: "saturate(0.85) brightness(1.12)",
  /** Kalb: kraeftig gebraten. */
  kalb: "saturate(1.05) brightness(0.94)",
  /** Schinken: blasses Rosa aus der Salamischeibe. */
  schinken: "saturate(0.42) brightness(1.3)",
  /** Bacon: dunkler und kraeftiger. */
  bacon: "saturate(1.2) brightness(0.78)",
  /** Gurke: helleres Gruen aus dem Salatblatt. */
  gurke: "saturate(0.85) brightness(1.15) hue-rotate(-14deg)",
  /** Weisskohl: entfaerbtes Blatt. */
  weisskohl: "saturate(0.16) brightness(1.5)",
  /** Rotkohl: violett. */
  rotkohl: "saturate(0.85) brightness(0.82) hue-rotate(195deg)",
} as const;

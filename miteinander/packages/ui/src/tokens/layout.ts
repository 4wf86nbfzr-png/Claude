/**
 * Abstaende, Radien, Schatten, Bewegung, Tippflaechen.
 *
 * Alle Groessen sind in dp und werden nur ueber diese Tokens verwendet.
 * Direkte Zahlen in Komponenten sind nicht zulaessig -- sonst laesst sich der
 * Einfach-Modus nicht durchgaengig groesser stellen.
 */

export const spacing = {
  none: 0,
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;
export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: 0,
  s: 8,
  m: 14,
  l: 22,
  pill: 999,
} as const;

/** Zurueckhaltend: Tiefe entsteht durch Flaeche und Abstand, nicht durch Schlagschatten. */
export const elevation = {
  none: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  card: { shadowOpacity: 0.08, shadowRadius: 12, elevation: 2, shadowOffset: { width: 0, height: 4 } },
  sheet: { shadowOpacity: 0.16, shadowRadius: 24, elevation: 8, shadowOffset: { width: 0, height: 8 } },
} as const;

/** Fokus muss immer sichtbar sein -- 3 dp Ring plus Abstand zum Element. */
export const focusRing = {
  width: 3,
  offset: 2,
  radiusExtra: 4,
} as const;

export const motion = {
  /** Kurz und ruhig. Wird bei "Bewegung reduzieren" auf 0 gesetzt. */
  fast: 140,
  normal: 220,
  slow: 320,
} as const;

/** Mindestmasse fuer Tippflaechen je Bedienmodus. */
export const touchTargets = {
  standard: 48,
  comfortable: 56,
  simple: 72,
} as const;

/** Zeilenlaenge: lange Zeilen sind fuer viele Menschen schwer zu verfolgen. */
export const measure = {
  /** Zeichen pro Zeile im Fliesstext. */
  body: 66,
  easyLanguage: 40,
} as const;

export const breakpoints = {
  /** Ab hier zweispaltige Listen auf Tablets. */
  wide: 700,
} as const;

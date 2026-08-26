/**
 * Schriftgroessen und -rollen.
 *
 * Grundlage ist eine sehr gut lesbare, offene Groteske. Ausgeliefert wird
 * "Atkinson Hyperlegible" -- eigens fuer Menschen mit Sehbeeintraechtigung
 * entworfen, mit deutlich unterscheidbaren Zeichen (I l 1, O 0). Faellt die
 * Schrift aus, greift die Systemschrift.
 */

export const fontFamily = {
  regular: 'AtkinsonHyperlegible-Regular',
  bold: 'AtkinsonHyperlegible-Bold',
  /** Fallback, wenn die Schrift nicht geladen ist. */
  system: undefined,
} as const;

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '600' | '700';
  letterSpacing: number;
}

/**
 * Basisgroessen. Sie werden mit dem Skalierungsfaktor der Nutzenden
 * multipliziert (siehe scaleType).
 */
export const typeScale = {
  display: { fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 26, lineHeight: 34, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 21, lineHeight: 29, fontWeight: '600', letterSpacing: 0 },
  body: { fontSize: 18, lineHeight: 28, fontWeight: '400', letterSpacing: 0 },
  bodyStrong: { fontSize: 18, lineHeight: 28, fontWeight: '600', letterSpacing: 0 },
  label: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: 0.1 },
  caption: { fontSize: 15, lineHeight: 22, fontWeight: '400', letterSpacing: 0.1 },
} satisfies Record<string, TypeStyle>;

export type TypeToken = keyof typeof typeScale;

/**
 * Ab dieser Groesse gilt Text als "gross" im Sinne von WCAG 1.4.3 --
 * 18,66 pt fett oder 24 pt normal. Wir rechnen konservativ in dp.
 */
export function isLargeText(style: TypeStyle): boolean {
  if (style.fontWeight !== '400' && style.fontSize >= 19) return true;
  return style.fontSize >= 24;
}

/**
 * Wendet die Nutzer-Skalierung an. Die Zeilenhoehe waechst mit, sonst
 * ueberlappen Zeilen bei grosser Schrift.
 */
export function scaleType(token: TypeToken, fontScale: number): TypeStyle {
  const base = typeScale[token];
  return {
    ...base,
    fontSize: Math.round(base.fontSize * fontScale),
    lineHeight: Math.round(base.lineHeight * fontScale),
  };
}

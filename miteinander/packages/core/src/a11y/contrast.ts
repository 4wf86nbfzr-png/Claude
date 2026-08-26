/**
 * Kontrastberechnung nach WCAG 2.x.
 *
 * Wird nicht nur zur Laufzeit genutzt, sondern vor allem im Test: jede
 * Farbkombination des Design-Systems wird automatisch gegen die Schwellen
 * geprueft, damit ein neuer Farbwert nicht unbemerkt durchrutscht.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Ungültiger Farbwert: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(color: Rgb | string): number {
  const rgb = typeof color === 'string' ? parseHex(color) : color;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Kontrastverhaeltnis zwischen 1 und 21. */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export type TextSize = 'normal' | 'large';

/** WCAG 2.2, 1.4.3 Kontrast (Minimum) -- AA. */
export function meetsAaText(fg: string, bg: string, size: TextSize = 'normal'): boolean {
  const required = size === 'large' ? 3 : 4.5;
  return contrastRatio(fg, bg) >= required - 1e-9;
}

/** WCAG 2.2, 1.4.11 Kontrast von Nicht-Text-Inhalten -- Bedienelemente und Fokus. */
export function meetsAaNonText(fg: string, bg: string): boolean {
  return contrastRatio(fg, bg) >= 3 - 1e-9;
}

/** WCAG 2.2, 1.4.6 -- AAA, Ziel fuer den Hochkontrastmodus. */
export function meetsAaaText(fg: string, bg: string, size: TextSize = 'normal'): boolean {
  const required = size === 'large' ? 4.5 : 7;
  return contrastRatio(fg, bg) >= required - 1e-9;
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

import { z } from 'zod';

/**
 * Huelle fuer Inhalte aus fremder Feder (E-Mail-Text, WhatsApp-Text, Betreff,
 * Absendernamen, Dateinamen). Der Typ ist absichtlich unbequem: an ein
 * `UntrustedText` kommt man nur ueber `unwrapForDisplay()` heran, und die
 * Prompt-Bauer in `@jarvis/security` akzeptieren nichts anderes.
 *
 * Das ist die Typ-Seite des Injection-Schutzes. Die inhaltliche Seite
 * (Neutralisierung, Isolationsrahmen) liegt in `@jarvis/security/isolation`.
 */
declare const untrustedBrand: unique symbol;

export interface UntrustedText {
  readonly [untrustedBrand]: 'UntrustedText';
  readonly value: string;
  readonly origin: string;
}

export function untrusted(value: string, origin: string): UntrustedText {
  return { value, origin } as UntrustedText;
}

/** Bewusster, benannter Ausstieg aus der Huelle. Grep-bar im Review. */
export function unwrapForDisplay(t: UntrustedText): string {
  return t.value;
}

export function isUntrusted(v: unknown): v is UntrustedText {
  return typeof v === 'object' && v !== null && 'value' in v && 'origin' in v;
}

export const UntrustedTextSchema = z
  .object({ value: z.string(), origin: z.string() })
  .transform((v) => untrusted(v.value, v.origin));

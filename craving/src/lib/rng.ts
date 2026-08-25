/**
 * Deterministischer Zufall.
 *
 * Die Zutatenverteilung im Food Builder darf NICHT echt zufaellig sein:
 * Server und Client wuerden sonst unterschiedliche Positionen rendern
 * (Hydration-Fehler) und jede Rerender-Runde wuerde die Pizza neu wuerfeln.
 * Stattdessen: Seed aus Zutaten-ID + Index -> immer dieselbe, aber
 * unregelmaessig wirkende Anordnung.
 */

export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — klein, schnell, ausreichend gleichverteilt. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFor(key: string): () => number {
  return makeRandom(hashString(key));
}

/** Zufallszahl in [min, max) */
export function between(rnd: () => number, min: number, max: number): number {
  return min + rnd() * (max - min);
}

/** Auf n Nachkommastellen runden — verhindert, dass Server und Client
 *  denselben Wert unterschiedlich in Attribute schreiben (Hydration). */
export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function pick<T>(rnd: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rnd() * items.length)];
  // items ist nie leer, wo diese Funktion benutzt wird.
  return item ?? (items[0] as T);
}

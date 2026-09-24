/**
 * Namensabgleich fuer den Stundenzettel-Import (Spec 22 / 68).
 *
 * Anforderungen aus der Praxis: In Partner-Stundenzetteln steht mal
 * "Max Mustermann", mal "Mustermann, Max", mal "MUSTERMANN  Max" und
 * gelegentlich "Mustermann Maximilian" oder ein Tippfehler.
 *
 * Deshalb: Reihenfolge ignorieren, Gross-/Kleinschreibung ignorieren,
 * Umlaute normalisieren, Mehrfach-Leerzeichen zusammenfassen und
 * Tippfehler ueber die Damerau-Levenshtein-Distanz tolerieren.
 *
 * Wichtig: Bei geringer Sicherheit wird NICHT automatisch zugeordnet,
 * sondern der Disponent bekommt die Kandidaten zur Auswahl.
 */

export const AUTO_MATCH_THRESHOLD = 0.92;
export const SUGGEST_THRESHOLD = 0.62;

const UMLAUTS: Array<[RegExp, string]> = [
  [/ä/g, 'ae'], [/ö/g, 'oe'], [/ü/g, 'ue'], [/ß/g, 'ss'],
  [/á|à|â|å|ã/g, 'a'], [/é|è|ê|ë/g, 'e'], [/í|ì|î|ï/g, 'i'],
  [/ó|ò|ô|õ/g, 'o'], [/ú|ù|û/g, 'u'], [/ç/g, 'c'], [/ñ/g, 'n'],
];

/** Titel und Anreden, die in Stundenzetteln vorkommen und nichts zum Namen beitragen. */
const NOISE = new Set(['herr', 'frau', 'hr', 'fr', 'dr', 'prof', 'mr', 'mrs', 'ms']);

export function normalizeName(input: string): string {
  let s = (input ?? '').toLowerCase().trim();
  for (const [re, replacement] of UMLAUTS) s = s.replace(re, replacement);
  s = s.replace(/[.,;_/\\|]+/g, ' ');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** Zerlegt einen Namen in sortierte Bestandteile – Reihenfolge wird so egal. */
export function nameTokens(input: string): string[] {
  return normalizeName(input)
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !NOISE.has(t))
    .sort();
}

/** Damerau-Levenshtein (mit Vertauschungen) – "Mustermann" vs. "Mustremann". */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push(new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i]![0] = i;
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = value;
    }
  }
  return rows[a.length]![b.length]!;
}

/** 0..1 – 1 bedeutet identisch. */
export function similarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - editDistance(a, b) / longest;
}

/**
 * Aehnlichkeit zweier Personennamen, unabhaengig von der Reihenfolge.
 * Jeder Token der einen Seite bekommt seinen besten Partner auf der anderen.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(' ') === tb.join(' ')) return 1;

  const score = (from: string[], to: string[]): number => {
    let sum = 0;
    for (const token of from) {
      let best = 0;
      for (const other of to) {
        // Abkuerzungen: "M." bzw. "M" passt auf "Max"
        if (token.length === 1 && other.startsWith(token)) best = Math.max(best, 0.8);
        else if (other.length === 1 && token.startsWith(other)) best = Math.max(best, 0.8);
        else best = Math.max(best, similarity(token, other));
      }
      sum += best;
    }
    return sum / from.length;
  };

  // Symmetrisch bewerten, damit ein zusaetzlicher Zweitname nicht voll durchschlaegt.
  const forward = score(ta, tb);
  const backward = score(tb, ta);
  let result = (forward + backward) / 2;

  // Unterschiedliche Anzahl Namensteile leicht abwerten.
  if (ta.length !== tb.length) result *= 0.97;
  return Math.max(0, Math.min(1, result));
}

export interface MatchCandidate<T> {
  item: T;
  score: number;
}

export interface MatchResult<T> {
  /** Eindeutiger Treffer – nur gesetzt, wenn sicher genug und ohne ernsthaften Konkurrenten. */
  match: T | null;
  score: number;
  /** Vorschlaege fuer den Disponenten, absteigend sortiert. */
  candidates: Array<MatchCandidate<T>>;
  /** true, wenn mehrere Kandidaten fast gleich gut sind. */
  ambiguous: boolean;
}

export interface MatchOptions {
  autoThreshold?: number;
  suggestThreshold?: number;
  maxCandidates?: number;
  /** Mindestabstand zum zweitbesten Treffer fuer eine automatische Zuordnung. */
  minLead?: number;
}

/**
 * Sucht den besten Namenstreffer in einer Liste.
 * `nameOf` liefert einen oder mehrere Schreibweisen je Eintrag
 * (z.B. "Max Mustermann" und die Personalnummer).
 */
export function matchName<T>(
  query: string,
  items: readonly T[],
  nameOf: (item: T) => string | string[],
  options: MatchOptions = {},
): MatchResult<T> {
  const {
    autoThreshold = AUTO_MATCH_THRESHOLD,
    suggestThreshold = SUGGEST_THRESHOLD,
    maxCandidates = 5,
    minLead = 0.05,
  } = options;

  const cleaned = (query ?? '').trim();
  if (!cleaned) return { match: null, score: 0, candidates: [], ambiguous: false };

  const scored: Array<MatchCandidate<T>> = [];
  for (const item of items) {
    const names = nameOf(item);
    const list = Array.isArray(names) ? names : [names];
    let best = 0;
    for (const name of list) {
      if (!name) continue;
      best = Math.max(best, nameSimilarity(cleaned, name));
      if (best === 1) break;
    }
    if (best > 0) scored.push({ item, score: Math.round(best * 1000) / 1000 });
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.filter((c) => c.score >= suggestThreshold).slice(0, maxCandidates);
  const top = scored[0];
  if (!top) return { match: null, score: 0, candidates: [], ambiguous: false };

  const second = scored[1];
  const lead = second ? top.score - second.score : 1;
  const ambiguous = top.score >= suggestThreshold && lead < minLead;

  const isAuto = top.score >= autoThreshold && !ambiguous;
  return {
    match: isAuto ? top.item : null,
    score: top.score,
    candidates,
    ambiguous,
  };
}

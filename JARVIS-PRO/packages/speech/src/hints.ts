/**
 * Korrektur- und Hint-Liste fuer die deutsche Spracherkennung.
 *
 * whisper.cpp nimmt einen Initial-Prompt entgegen, der die Erkennung in
 * Richtung bestimmter Schreibweisen zieht. Zusaetzlich korrigieren wir nach
 * der Erkennung die Faelle, die erfahrungsgemaess trotzdem falsch ankommen -
 * Eigennamen und Fachbegriffe der Personaldienstleistung.
 *
 * Die Liste ist Konfiguration, kein Code: sie laesst sich aus einer Datei
 * ergaenzen, ohne dass jemand TypeScript anfassen muss.
 */
export interface HintList {
  /** Begriffe fuer den Initial-Prompt. */
  readonly vocabulary: readonly string[];
  /** Ersetzungen nach der Erkennung: falsch -> richtig. */
  readonly corrections: readonly (readonly [RegExp, string])[];
}

const VOCABULARY: readonly string[] = [
  'Noah Benkhofer',
  'HERM Service Team',
  'Hermservice Team',
  'Disposition',
  'Dispo',
  'Einsatzleitung',
  'Einsatzleiter',
  'Ordnungsdienst',
  'Secplan',
  'WhatsApp Business',
  'Personaldienstleistung',
  'Sicherheitsdienst',
  'Veranstaltungsordner',
  'Einlasskontrolle',
  'Akkreditierung',
  'Schichtplan',
  'Dienstplan',
  'Arbeitnehmerueberlassung',
  'Hostess',
  'Promotion',
  'Logistik',
  'Fahrservice',
  'Reinigung',
  'Gastro',
  // Hamburger Einsatzorte, die sonst regelmaessig verstuemmelt werden.
  'Wandsbek',
  'Altona',
  'Harburg',
  'Barmbek',
  'Eimsbuettel',
  'Winterhude',
  'St. Pauli',
  'HafenCity',
  'Elbphilharmonie',
  'Messehallen',
  'Volksparkstadion',
  'Barclays Arena',
  'Hafengeburtstag',
];

/**
 * Nachkorrekturen. Nur Muster, die eindeutig sind - eine zu gierige Regel
 * richtet mehr Schaden an als der Erkennungsfehler selbst.
 */
const CORRECTIONS: readonly (readonly [RegExp, string])[] = [
  [/\bherm\s*service\s*team\b/gi, 'HERM Service Team'],
  [/\bhermsService\b/gi, 'HERM Service'],
  [/\bhärm service\b/gi, 'HERM Service'],
  [/\bnoah\s+b(e|ä)nk\s*hofer\b/gi, 'Noah Benkhofer'],
  [/\bben\s*kofer\b/gi, 'Benkhofer'],
  [/\bsec\s*plan\b/gi, 'Secplan'],
  [/\bsek\s*plan\b/gi, 'Secplan'],
  [/\bwhats\s*app\b/gi, 'WhatsApp'],
  [/\bwatts\s*app\b/gi, 'WhatsApp'],
  [/\bdispo\s*sition\b/gi, 'Disposition'],
  [/\beinsatz\s*leitung\b/gi, 'Einsatzleitung'],
  [/\bordnungs\s*dienst\b/gi, 'Ordnungsdienst'],
  [/\bwandsbeck\b/gi, 'Wandsbek'],
  [/\beims\s*b(ü|ue)ttel\b/gi, 'Eimsbuettel'],
  [/\bhafen\s*city\b/gi, 'HafenCity'],
  [/\belb\s*philharmonie\b/gi, 'Elbphilharmonie'],
  [/\bvolkspark\s*stadion\b/gi, 'Volksparkstadion'],
];

export const DEFAULT_HINTS: HintList = {
  vocabulary: VOCABULARY,
  corrections: CORRECTIONS,
};

/**
 * Baut den Initial-Prompt fuer whisper.cpp. Der Prompt ist bewusst ein
 * natuerlicher deutscher Satz - eine reine Wortliste zieht die Erkennung in
 * einen Aufzaehlungsstil und verschlechtert die Interpunktion.
 */
export function buildInitialPrompt(hints: HintList = DEFAULT_HINTS, extraNames: readonly string[] = []): string {
  const names = [...hints.vocabulary, ...extraNames];
  return (
    'Telefongespraech auf Deutsch bei einer Hamburger Personaldienstleistung. ' +
    `Es geht um Disposition, Schichten und Einsaetze. Vorkommende Begriffe und Namen: ${names.join(', ')}.`
  );
}

/** Wendet die Nachkorrekturen an. */
export function applyCorrections(text: string, hints: HintList = DEFAULT_HINTS): string {
  let out = text;
  for (const [re, replacement] of hints.corrections) {
    out = out.replace(re, replacement);
  }
  return out;
}

/** Ergaenzt die Liste um Kunden- und Mitarbeiternamen aus der Konfiguration. */
export function withExtraNames(base: HintList, names: readonly string[]): HintList {
  return {
    vocabulary: [...base.vocabulary, ...names],
    corrections: base.corrections,
  };
}

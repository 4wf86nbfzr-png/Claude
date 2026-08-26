/**
 * Diskriminierungsschutz im Matching.
 *
 * Grundregel: Merkmale nach AGG (Behinderung, Herkunft, Religion, Geschlecht,
 * Alter, sexuelle Identitaet, "Rasse"/ethnische Herkunft) duerfen die Rangfolge
 * nicht beeinflussen. Ausnahme sind sachlich begruendbare Anforderungen -- bei
 * persoenlicher Assistenz kann etwa das Geschlecht der assistierenden Person
 * erforderlich sein (§ 8 AGG). Solche Faelle werden nicht still zugelassen,
 * sondern markiert und manuell geprueft.
 */

export const PROTECTED_ATTRIBUTES = [
  'behinderung',
  'diagnose',
  'herkunft',
  'nationalitaet',
  'ethnie',
  'religion',
  'weltanschauung',
  'geschlecht',
  'sexuelle_identitaet',
  'alter',
] as const;
export type ProtectedAttribute = (typeof PROTECTED_ATTRIBUTES)[number];

/**
 * Praeferenzen, die eine sachliche Begruendung tragen koennen. Sie werden
 * zugelassen, aber jede Nutzung wird zur Pruefung markiert.
 */
export const JUSTIFIABLE_PREFERENCES: Partial<Record<ProtectedAttribute, string>> = {
  geschlecht:
    'Bei Körpernähe und persönlicher Assistenz kann das Geschlecht der unterstützenden Person erforderlich sein.',
};

export interface PreferenceInput {
  attribute: ProtectedAttribute;
  value: string;
  /** Begruendung der suchenden Person. Pflicht, sonst keine Zulassung. */
  justification?: string;
  /** Betrifft die Anfrage Koerpernaehe oder persoenliche Assistenz? */
  involvesPersonalCare?: boolean;
}

export interface FairnessDecision {
  allowed: boolean;
  needsManualReview: boolean;
  reason: string;
}

export function evaluatePreference(pref: PreferenceInput): FairnessDecision {
  const justifiable = JUSTIFIABLE_PREFERENCES[pref.attribute];
  if (!justifiable) {
    return {
      allowed: false,
      needsManualReview: false,
      reason: `Eine Auswahl nach "${pref.attribute}" ist nicht zulässig und wird nicht berücksichtigt.`,
    };
  }
  if (!pref.involvesPersonalCare) {
    return {
      allowed: false,
      needsManualReview: false,
      reason:
        'Diese Auswahl ist nur bei persönlicher Assistenz oder Körpernähe zulässig. Die Anfrage betrifft das nicht.',
    };
  }
  if (!pref.justification || pref.justification.trim().length < 10) {
    return {
      allowed: false,
      needsManualReview: false,
      reason: 'Bitte erklären Sie kurz, warum das für Sie wichtig ist.',
    };
  }
  return { allowed: true, needsManualReview: true, reason: justifiable };
}

/**
 * Sicherheitsnetz: keine Bewertungskomponente darf auf ein geschuetztes Merkmal
 * zeigen. Der Test faehrt diese Funktion gegen alle Score-Komponenten.
 */
export function assertNoProtectedSignal(signalKeys: readonly string[]): void {
  const offending = signalKeys.filter((key) =>
    PROTECTED_ATTRIBUTES.some((attr) => key.toLowerCase().includes(attr)),
  );
  if (offending.length > 0) {
    throw new Error(
      `Matching darf geschützte Merkmale nicht verwenden: ${offending.join(', ')}`,
    );
  }
}

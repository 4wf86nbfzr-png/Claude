import type { ConsentRecord, Id, IsoDateTime } from '../domain/types';
import type { ConsentPurpose } from '../domain/enums';

/**
 * Granulare Einwilligungen.
 *
 * Kein Buendel, kein Vorabhaken, kein "Weiter heisst Zustimmung". Jede
 * Einwilligung hat einen Zweck, eine Fassung und ist einzeln widerrufbar.
 */

export interface ConsentDefinition {
  purpose: ConsentPurpose;
  title: string;
  /** Erklaerung in normaler Sprache. */
  explanation: string;
  /** Erklaerung in Leichter Sprache. */
  easyExplanation: string;
  /** Ohne diese Einwilligung ist das Produkt nicht nutzbar (Vertrag, nicht Einwilligung i. S. v. Art. 6 Abs. 1 lit. a). */
  requiredForService: boolean;
  /** Besondere Kategorie nach Art. 9 DSGVO. */
  specialCategory: boolean;
  policyVersion: string;
}

export const CONSENT_CATALOG: ConsentDefinition[] = [
  {
    purpose: 'terms',
    title: 'Nutzungsbedingungen',
    explanation: 'Die Regeln für die Nutzung der App. Ohne Zustimmung ist keine Nutzung möglich.',
    easyExplanation: 'Das sind die Regeln in der App. Sie müssen Ja sagen, um die App zu nutzen.',
    requiredForService: true,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'privacy',
    title: 'Datenschutzhinweise',
    explanation: 'Information darüber, welche Daten wir verarbeiten und warum.',
    easyExplanation: 'Hier steht, was mit Ihren Daten passiert.',
    requiredForService: true,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'sensitive_support_needs',
    title: 'Angaben zu Ihrem Unterstützungsbedarf',
    explanation:
      'Diese Angaben können Rückschlüsse auf Gesundheit zulassen. Wir verarbeiten sie nur, wenn Sie ausdrücklich zustimmen, und nur, um passende Unterstützung zu finden.',
    easyExplanation:
      'Sie können sagen, wobei Sie Hilfe brauchen. Das ist freiwillig. Wir nutzen es nur, um passende Menschen zu finden.',
    requiredForService: false,
    specialCategory: true,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'profile_photo',
    title: 'Profilbild',
    explanation: 'Ihr Bild wird anderen Nutzenden angezeigt. Sie können es jederzeit entfernen.',
    easyExplanation: 'Andere Menschen sehen Ihr Bild. Sie können das Bild wieder löschen.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'location_coarse',
    title: 'Ungefährer Standort',
    explanation:
      'Wir verwenden nur eine ungefähre Region, um Unterstützung in Ihrer Nähe zu finden. Ihre genaue Adresse wird nie angezeigt.',
    easyExplanation: 'Wir wissen nur ungefähr, wo Sie wohnen. Nie genau.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'push_notifications',
    title: 'Mitteilungen auf dem Handy',
    explanation: 'Hinweise zu Nachrichten und Terminen. Die Vorschau enthält keine Inhalte.',
    easyExplanation: 'Ihr Handy sagt Ihnen Bescheid. Zum Beispiel bei einer Nachricht.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'trusted_person_access',
    title: 'Zugang für eine Vertrauensperson',
    explanation:
      'Sie erlauben einer Person, Sie bei der Bedienung zu unterstützen. Sie legen fest, was diese Person darf, und können das jederzeit widerrufen.',
    easyExplanation:
      'Eine Person darf Ihnen helfen. Sie bestimmen, was die Person darf. Sie können das jederzeit beenden.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'contact_release',
    title: 'Kontaktdaten freigeben',
    explanation:
      'Telefonnummer und genaue Adresse werden der gebuchten Person gezeigt. Nur für diesen Termin.',
    easyExplanation: 'Die Person bekommt Ihre Telefon-Nummer und Ihre Adresse. Nur für diesen Termin.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
  {
    purpose: 'quality_research',
    title: 'Mitmachen bei Verbesserungen',
    explanation:
      'Wir dürfen Sie fragen, ob Sie an einem Test teilnehmen. Sie können jederzeit Nein sagen.',
    easyExplanation: 'Wir dürfen Sie fragen, ob Sie beim Testen mitmachen.',
    requiredForService: false,
    specialCategory: false,
    policyVersion: '2026-01-01',
  },
];

const CATALOG_INDEX = new Map(CONSENT_CATALOG.map((c) => [c.purpose, c]));

export function getConsentDefinition(purpose: ConsentPurpose): ConsentDefinition | undefined {
  return CATALOG_INDEX.get(purpose);
}

export class ConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentError';
  }
}

/**
 * Erteilt eine Einwilligung. Fuer besondere Kategorien (Art. 9 DSGVO) ist eine
 * ausdrueckliche Handlung noetig -- ein per Sprache erkannter Befehl allein
 * reicht nicht, er muss zusaetzlich bestaetigt worden sein.
 */
export function grantConsent(
  userId: Id,
  purpose: ConsentPurpose,
  now: IsoDateTime,
  options: { channel: ConsentRecord['channel']; assistedBy?: Id; id: string },
): ConsentRecord {
  const def = CATALOG_INDEX.get(purpose);
  if (!def) throw new ConsentError(`Unbekannter Zweck: ${purpose}`);
  // Besondere Kategorien (Art. 9 DSGVO) brauchen eine ausdrueckliche Handlung
  // der betroffenen Person. Eine nachtraegliche Korrektur durch die
  // Verwaltung kann eine solche Einwilligung niemals ersetzen.
  if (def.specialCategory && options.channel === 'admin_correction') {
    throw new ConsentError(
      'Besonders geschützte Angaben brauchen eine ausdrückliche Handlung der betroffenen Person.',
    );
  }
  return {
    id: options.id,
    userId,
    purpose,
    granted: true,
    policyVersion: def.policyVersion,
    grantedAt: now,
    revokedAt: null,
    channel: options.channel,
    assistedBy: options.assistedBy ?? null,
  };
}

/** Widerruf ist immer moeglich und genauso einfach wie die Erteilung. */
export function revokeConsent(record: ConsentRecord, now: IsoDateTime): ConsentRecord {
  return { ...record, granted: false, revokedAt: now };
}

export function hasActiveConsent(
  records: readonly ConsentRecord[],
  purpose: ConsentPurpose,
  policyVersion?: string,
): boolean {
  const def = CATALOG_INDEX.get(purpose);
  const version = policyVersion ?? def?.policyVersion;
  return records.some(
    (r) =>
      r.purpose === purpose &&
      r.granted &&
      !r.revokedAt &&
      (version === undefined || r.policyVersion === version),
  );
}

/** Welche Zwecke fehlen noch, damit die App ueberhaupt nutzbar ist? */
export function missingRequiredConsents(records: readonly ConsentRecord[]): ConsentPurpose[] {
  return CONSENT_CATALOG.filter((c) => c.requiredForService)
    .filter((c) => !hasActiveConsent(records, c.purpose))
    .map((c) => c.purpose);
}

/**
 * Darf eine Verarbeitung stattfinden? Einzige Stelle, an der das entschieden
 * wird -- Aufrufer duerfen nie selbst raten.
 */
export function mayProcess(
  records: readonly ConsentRecord[],
  purpose: ConsentPurpose,
): { allowed: boolean; reason: string } {
  const def = CATALOG_INDEX.get(purpose);
  if (!def) return { allowed: false, reason: `Unbekannter Zweck: ${purpose}` };
  if (hasActiveConsent(records, purpose)) return { allowed: true, reason: 'Einwilligung liegt vor.' };
  const outdated = records.some((r) => r.purpose === purpose && r.granted && r.policyVersion !== def.policyVersion);
  return {
    allowed: false,
    reason: outdated
      ? 'Die Einwilligung bezieht sich auf eine ältere Fassung. Bitte erneut einholen.'
      : 'Es liegt keine gültige Einwilligung vor.',
  };
}

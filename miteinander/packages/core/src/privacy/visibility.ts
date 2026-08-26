import type {
  Booking,
  Id,
  ProviderProfile,
  SeekerFieldKey,
  SupportSeekerProfile,
} from '../domain/types';

/**
 * Feldgenaue Sichtbarkeit.
 *
 * Grundsatz: Vor einer bestaetigten Buchung sieht die anbietende Person nur,
 * was die suchende Person ausdruecklich freigegeben hat -- und niemals
 * Telefonnummer oder genaue Adresse. Diese beiden Felder haengen zusaetzlich
 * an einer eigenen Freigabe.
 */

/** Felder, die niemals vor einer bestaetigten Buchung sichtbar sind. */
export const NEVER_BEFORE_BOOKING: readonly SeekerFieldKey[] = ['phone', 'preciseAddress'];

/** Felder, die immer sichtbar sind, weil ohne sie keine Anfrage bearbeitbar ist. */
export const ALWAYS_VISIBLE: readonly SeekerFieldKey[] = ['displayName', 'region'];

export type ViewerRelation =
  | { kind: 'self' }
  | { kind: 'trusted_person'; scopes: readonly string[] }
  | { kind: 'provider_candidate' }
  | { kind: 'provider_booked'; booking: Booking }
  | { kind: 'admin'; hasDocumentedAccess: boolean }
  | { kind: 'public' };

export type RedactedSeekerProfile = Partial<SupportSeekerProfile> & {
  userId: Id;
  /** Welche Felder bewusst zurueckgehalten wurden -- fuer eine ehrliche Anzeige. */
  withheldFields: SeekerFieldKey[];
};

export function visibleSeekerFields(
  profile: SupportSeekerProfile,
  relation: ViewerRelation,
): SeekerFieldKey[] {
  const all: SeekerFieldKey[] = [
    'displayName',
    'region',
    'aboutMe',
    'communicationModes',
    'languages',
    'mobilityNotes',
    'supportNeeds',
    'photoUrl',
    'phone',
    'preciseAddress',
  ];

  switch (relation.kind) {
    case 'self':
      return all;
    case 'admin':
      // Supportzugriff nur mit protokollierter Freigabe, und auch dann ohne
      // die besonders sensiblen Bedarfsangaben.
      return relation.hasDocumentedAccess
        ? all.filter((f) => f !== 'supportNeeds')
        : [...ALWAYS_VISIBLE];
    case 'trusted_person':
      return relation.scopes.includes('view_profile') ? all : [...ALWAYS_VISIBLE];
    case 'provider_booked': {
      const shared = new Set<SeekerFieldKey>([...ALWAYS_VISIBLE, ...profile.sharedBeforeBooking]);
      // Nach bestaetigter Buchung kommen die Kontaktdaten dazu -- aber nur,
      // wenn die Buchung wirklich bestaetigt und die Freigabe gesetzt ist.
      const confirmed =
        relation.booking.status === 'confirmed' ||
        relation.booking.status === 'in_progress' ||
        relation.booking.status === 'completed';
      if (confirmed && relation.booking.preciseAddressReleased) {
        shared.add('phone');
        shared.add('preciseAddress');
      }
      shared.add('mobilityNotes');
      return [...shared];
    }
    case 'provider_candidate': {
      const shared = new Set<SeekerFieldKey>([...ALWAYS_VISIBLE, ...profile.sharedBeforeBooking]);
      for (const f of NEVER_BEFORE_BOOKING) shared.delete(f);
      return [...shared];
    }
    case 'public':
    default:
      return [];
  }
}

/** Entfernt alles, was der Betrachtende nicht sehen darf. */
export function redactSeekerProfile(
  profile: SupportSeekerProfile,
  relation: ViewerRelation,
): RedactedSeekerProfile {
  const visible = new Set(visibleSeekerFields(profile, relation));
  const result: RedactedSeekerProfile = { userId: profile.userId, withheldFields: [] };

  const assign = <K extends keyof SupportSeekerProfile>(key: K, field: SeekerFieldKey) => {
    if (visible.has(field)) {
      (result as Record<string, unknown>)[key as string] = profile[key];
    } else if (profile[key] != null) {
      result.withheldFields.push(field);
    }
  };

  assign('region', 'region');
  assign('aboutMe', 'aboutMe');
  assign('communicationModes', 'communicationModes');
  assign('languages', 'languages');
  assign('mobilityNotes', 'mobilityNotes');
  assign('supportNeeds', 'supportNeeds');
  assign('photoUrl', 'photoUrl');
  assign('phone', 'phone');
  assign('preciseAddress', 'preciseAddress');
  result.updatedAt = profile.updatedAt;
  return result;
}

/**
 * Oeffentliche Sicht auf ein Anbieterprofil.
 * Fachliche Titel erscheinen nur, wenn sie geprueft wurden.
 */
export interface PublicProviderProfile
  extends Omit<ProviderProfile, 'signLanguageLevel' | 'signLanguageVerified'> {
  /** Nur gesetzt, wenn ein gueltiger Nachweis vorliegt. */
  signLanguageLevel?: ProviderProfile['signLanguageLevel'];
  signLanguageClaimUnverified: boolean;
  verifiedClaims: string[];
  /** Ehrlicher Hinweis: geprueft ist immer nur das konkrete Merkmal. */
  verificationDisclaimer: string;
}

export function toPublicProviderProfile(
  profile: ProviderProfile,
  verifiedQualificationLabels: readonly string[],
): PublicProviderProfile {
  const { signLanguageLevel, signLanguageVerified, ...rest } = profile;
  return {
    ...rest,
    ...(signLanguageVerified && signLanguageLevel !== 'none' ? { signLanguageLevel } : {}),
    signLanguageClaimUnverified: !signLanguageVerified && signLanguageLevel !== 'none',
    verifiedClaims: [...verifiedQualificationLabels],
    verificationDisclaimer:
      'Geprüft wurde genau das, was hier aufgeführt ist. Eine Prüfung ist kein allgemeines Versprechen über einen Menschen.',
  };
}

/**
 * Push-Vorschauen und Log-Eintraege duerfen keine sensiblen Inhalte tragen.
 * Diese Funktion ist die einzige zugelassene Quelle fuer Benachrichtigungstexte.
 */
export function safeNotificationBody(kind: string): string {
  switch (kind) {
    case 'message':
      return 'Sie haben eine neue Nachricht.';
    case 'booking':
      return 'Es gibt eine Neuigkeit zu einem Termin.';
    case 'verification':
      return 'Es gibt eine Neuigkeit zu Ihrem Nachweis.';
    case 'reminder':
      return 'Sie haben bald einen Termin.';
    case 'safety':
      return 'Bitte öffnen Sie die App. Es gibt eine wichtige Information.';
    default:
      return 'Es gibt eine Neuigkeit in der App.';
  }
}

const SENSITIVE_KEYS = [
  'supportneeds', 'diagnose', 'phone', 'telefon', 'address', 'adresse',
  'preciseaddress', 'birthdate', 'geburtsdatum', 'email', 'documentpath',
  'transcript', 'body', 'privatefeedback',
];

/** Filter fuer Audit-Log und Analytics. Wirft nicht, sondern entfernt. */
export function stripSensitive<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) continue;
    out[key] = value;
  }
  return out;
}

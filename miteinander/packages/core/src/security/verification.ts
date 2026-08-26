import type { Id, IsoDate, IsoDateTime, ProviderVerification, User } from '../domain/types';
import type { ProviderKind, VerificationStatus } from '../domain/enums';
import { getQualification } from '../domain/service-categories';
import { hasPermission, isFourEyesSatisfied } from './permissions';

/**
 * Zustandsautomat fuer Nachweise.
 *
 * "approved" ist nie ein Endzustand: Nachweise mit Ablaufdatum wechseln
 * automatisch nach "expired" und muessen erneuert werden.
 */
export const VERIFICATION_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  pending: ['approved', 'rejected'],
  approved: ['expired', 'rejected'],
  rejected: ['pending'],
  expired: ['pending'],
};

export class VerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VerificationError';
  }
}

export interface DecisionInput {
  now: IsoDateTime;
  deciderId: Id;
  decider: Pick<User, 'roles'>;
  secondApproverId?: Id;
  approvers?: Record<Id, Pick<User, 'roles'>>;
  validUntil?: IsoDate;
  rejectionReason?: string;
}

/**
 * Entscheidung ueber einen Nachweis.
 *
 * Nachweise, die zu erlaubnispflichtiger Arbeit berechtigen, brauchen zwei
 * Augenpaare -- eine falsch anerkannte Pflegequalifikation kann Menschen
 * gefaehrden.
 */
export function decideVerification(
  verification: ProviderVerification,
  to: 'approved' | 'rejected',
  input: DecisionInput,
): ProviderVerification {
  if (!VERIFICATION_TRANSITIONS[verification.status].includes(to)) {
    throw new VerificationError(
      `Übergang von "${verification.status}" nach "${to}" ist nicht vorgesehen.`,
    );
  }
  if (!hasPermission(input.decider, 'verification.decide')) {
    throw new VerificationError('Keine Berechtigung, über Nachweise zu entscheiden.');
  }

  const qualification = getQualification(verification.qualificationKey);
  if (!qualification) {
    throw new VerificationError(`Unbekannte Qualifikation: ${verification.qualificationKey}`);
  }

  if (to === 'approved' && qualification.licensesProfessionalWork) {
    const check = isFourEyesSatisfied(
      {
        action: 'verification.decide',
        firstApproverId: input.deciderId,
        secondApproverId: input.secondApproverId ?? null,
      },
      input.approvers ?? {},
    );
    if (!check.ok) throw new VerificationError(check.reason);
  }

  if (to === 'approved' && qualification.expires && !input.validUntil) {
    throw new VerificationError(
      'Dieser Nachweis läuft ab. Bitte tragen Sie ein Gültigkeitsdatum ein.',
    );
  }

  if (to === 'rejected' && !input.rejectionReason?.trim()) {
    throw new VerificationError('Eine Ablehnung braucht eine Begründung für die anbietende Person.');
  }

  return {
    ...verification,
    status: to,
    decidedAt: input.now,
    decidedBy: input.deciderId,
    secondApproverId: input.secondApproverId ?? null,
    validUntil: to === 'approved' ? (input.validUntil ?? null) : null,
    rejectionReason: to === 'rejected' ? (input.rejectionReason ?? null) : null,
  };
}

/** Laeuft taeglich: setzt abgelaufene Nachweise auf "expired". */
export function expireVerifications(
  verifications: readonly ProviderVerification[],
  today: IsoDate,
): ProviderVerification[] {
  return verifications.map((v) =>
    v.status === 'approved' && v.validUntil && v.validUntil < today
      ? { ...v, status: 'expired' as const }
      : v,
  );
}

/** Nachweise, die in den naechsten Tagen ablaufen -- fuer Erinnerung und Dashboard. */
export function expiringSoon(
  verifications: readonly ProviderVerification[],
  today: IsoDate,
  withinDays = 30,
): ProviderVerification[] {
  const limit = new Date(new Date(today).getTime() + withinDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return verifications.filter(
    (v) => v.status === 'approved' && v.validUntil && v.validUntil >= today && v.validUntil <= limit,
  );
}

/**
 * Leitet die oeffentlich anzeigbare Rolle ab.
 *
 * Grundsatz: ohne Nachweis kein Titel. Wer eine Fachqualifikation angibt, sie
 * aber nicht belegt hat, erscheint als private Unterstuetzungsperson.
 */
export function deriveProviderKind(
  verifications: readonly ProviderVerification[],
  today: IsoDate,
): ProviderKind {
  const valid = verifications.filter(
    (v) => v.status === 'approved' && (!v.validUntil || v.validUntil >= today),
  );
  if (valid.some((v) => getQualification(v.qualificationKey)?.licensesProfessionalWork)) {
    return 'professional';
  }
  if (valid.some((v) => v.qualificationKey === 'alltagsbegleitung_43b')) {
    return 'qualified_companion';
  }
  return 'private_helper';
}

/** Ehrlicher Text zu einem einzelnen Nachweis -- keine pauschalen Versprechen. */
export function describeVerification(verification: ProviderVerification): string {
  const label = getQualification(verification.qualificationKey)?.label ?? verification.qualificationKey;
  switch (verification.status) {
    case 'approved':
      return verification.validUntil
        ? `${label}: geprüft, gültig bis ${verification.validUntil}.`
        : `${label}: geprüft.`;
    case 'pending':
      return `${label}: liegt vor, wird noch geprüft.`;
    case 'rejected':
      return `${label}: nicht anerkannt.`;
    case 'expired':
      return `${label}: abgelaufen, muss erneuert werden.`;
    default:
      return label;
  }
}

import type {
  AbsencePeriod,
  AvailabilitySlot,
  IsoDate,
  ProviderProfile,
  ProviderService,
  ProviderVerification,
  SupportRequest,
} from '../domain/types';
import { categoriesRequireProfessional, getQualification } from '../domain/service-categories';
import { distanceKm } from './geo';

export interface ProviderRecord {
  profile: ProviderProfile;
  services: ProviderService[];
  verifications: ProviderVerification[];
  availability: AvailabilitySlot[];
  absences: AbsencePeriod[];
  /** Durchschnittsbewertung 1..3, undefined wenn noch keine Bewertung vorliegt. */
  averageRating?: number;
  reviewCount?: number;
}

export type IneligibilityReason =
  | 'kategorie_nicht_angeboten'
  | 'keine_gueltige_fachqualifikation'
  | 'identitaet_nicht_geprueft'
  | 'ausserhalb_einsatzradius'
  | 'nicht_verfuegbar'
  | 'abwesend'
  | 'sprache_passt_nicht'
  | 'nur_ehrenamt_moeglich'
  | 'budget_zu_niedrig';

export interface EligibilityResult {
  eligible: boolean;
  reasons: IneligibilityReason[];
  distanceKm: number;
}

/** Ein Nachweis zaehlt nur, wenn er geprueft UND nicht abgelaufen ist. */
export function isVerificationValid(
  verification: ProviderVerification,
  today: IsoDate,
): boolean {
  if (verification.status !== 'approved') return false;
  if (verification.validUntil && verification.validUntil < today) return false;
  return true;
}

/** Darf diese Person erlaubnispflichtige Taetigkeiten uebernehmen? */
export function canDoLicensedWork(
  verifications: readonly ProviderVerification[],
  today: IsoDate,
): boolean {
  return verifications.some(
    (v) =>
      isVerificationValid(v, today) &&
      getQualification(v.qualificationKey)?.licensesProfessionalWork === true,
  );
}

export function hasVerifiedIdentity(
  verifications: readonly ProviderVerification[],
  today: IsoDate,
): boolean {
  return verifications.some((v) => v.qualificationKey === 'identitaet' && isVerificationValid(v, today));
}

function isAbsent(absences: readonly AbsencePeriod[], date: IsoDate): boolean {
  return absences.some((a) => a.from <= date && date <= a.to);
}

/** Deckt ein Verfuegbarkeitsfenster den Termin vollstaendig ab? */
export function coversAppointment(
  availability: readonly AvailabilitySlot[],
  startsAt: Date,
  durationMinutes: number,
): boolean {
  const weekday = ((startsAt.getUTCDay() + 6) % 7) + 1; // ISO: Mo=1 .. So=7
  const startMinute = startsAt.getUTCHours() * 60 + startsAt.getUTCMinutes();
  const endMinute = startMinute + durationMinutes;
  const date = startsAt.toISOString().slice(0, 10);

  return availability.some((slot) => {
    if (slot.recurring) {
      if (slot.weekday !== weekday) return false;
    } else if (slot.date !== date) {
      return false;
    }
    return slot.startMinute <= startMinute && endMinute <= slot.endMinute;
  });
}

/**
 * Harte Ausschlusskriterien. Was hier scheitert, wird gar nicht erst
 * vorgeschlagen -- insbesondere erlaubnispflichtige Anfragen.
 */
export function checkEligibility(
  request: SupportRequest,
  provider: ProviderRecord,
  today: IsoDate,
): EligibilityResult {
  const reasons: IneligibilityReason[] = [];
  const dist = distanceKm(request.region, provider.profile.region);

  const offered = new Set(provider.services.map((s) => s.categoryKey));
  if (!request.categoryKeys.some((k) => offered.has(k))) {
    reasons.push('kategorie_nicht_angeboten');
  }

  const needsProfessional =
    request.requiresLicensedProfessional || categoriesRequireProfessional(request.categoryKeys);
  if (needsProfessional && !canDoLicensedWork(provider.verifications, today)) {
    reasons.push('keine_gueltige_fachqualifikation');
  }

  if (!hasVerifiedIdentity(provider.verifications, today)) {
    reasons.push('identitaet_nicht_geprueft');
  }

  if (dist > provider.profile.radiusKm) {
    reasons.push('ausserhalb_einsatzradius');
  }

  const startsAt = new Date(request.startsAt);
  if (!coversAppointment(provider.availability, startsAt, request.durationMinutes)) {
    reasons.push('nicht_verfuegbar');
  }
  if (isAbsent(provider.absences, request.startsAt.slice(0, 10))) {
    reasons.push('abwesend');
  }

  if (request.languages.length > 0) {
    const shared = request.languages.some((l) => provider.profile.languages.includes(l));
    if (!shared) reasons.push('sprache_passt_nicht');
  }

  if (provider.profile.volunteer && !request.acceptsVolunteers) {
    reasons.push('nur_ehrenamt_moeglich');
  }

  if (
    !provider.profile.volunteer &&
    request.budgetCentsPerHour != null &&
    provider.profile.hourlyRateCents != null &&
    provider.profile.hourlyRateCents > request.budgetCentsPerHour
  ) {
    reasons.push('budget_zu_niedrig');
  }

  return { eligible: reasons.length === 0, reasons, distanceKm: dist };
}

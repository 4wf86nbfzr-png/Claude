/** Zentrale Statuswerte und Aufzaehlungen. Spiegeln die Postgres-ENUMs. */

export const USER_ROLES = [
  'support_seeker',
  'provider',
  'trusted_person',
  'reviewer',
  'support_agent',
  'admin',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Wie eine anbietende Person eingeordnet ist. Wird nur nach Pruefung gesetzt. */
export const PROVIDER_KINDS = ['professional', 'qualified_companion', 'private_helper'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  professional: 'verifizierte Fachkraft',
  qualified_companion: 'geprüfte Alltagsbegleitung',
  private_helper: 'private Unterstützungsperson',
};

/** Zustand eines einzelnen Nachweises. */
export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected', 'expired'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const REQUEST_STATUSES = [
  'draft',
  'open',
  'matched',
  'booked',
  'completed',
  'cancelled',
  'withdrawn',
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const BOOKING_STATUSES = [
  'proposed',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled_by_seeker',
  'cancelled_by_provider',
  'no_show',
  'disputed',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'not_required',
  'pending_confirmation',
  'authorized',
  'captured',
  'refunded',
  'failed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INCIDENT_PRIORITIES = ['critical', 'high', 'normal', 'low'] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

export const INCIDENT_STATUSES = ['new', 'triaged', 'in_progress', 'resolved', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Bedienmodus der Oberflaeche. */
export const UI_MODES = ['einfach', 'standard', 'individuell'] as const;
export type UiMode = (typeof UI_MODES)[number];

/** Bevorzugte Kommunikationsformen. Mehrfachauswahl. */
export const COMMUNICATION_MODES = [
  'sprechen',
  'schreiben',
  'leichte_sprache',
  'dgs',
  'schriftdolmetschen',
  'bildkarten',
  'taktil',
] as const;
export type CommunicationMode = (typeof COMMUNICATION_MODES)[number];

export const COMMUNICATION_MODE_LABELS: Record<CommunicationMode, string> = {
  sprechen: 'Sprechen',
  schreiben: 'Schreiben',
  leichte_sprache: 'Leichte Sprache',
  dgs: 'Deutsche Gebärdensprache',
  schriftdolmetschen: 'Schriftdolmetschen',
  bildkarten: 'Bildkarten',
  taktil: 'Taktile Kommunikation',
};

/** Freigabestufe eines Inhalts (Leichte Sprache, DGS). Ehrlichkeit ueber den Stand. */
export const CONTENT_REVIEW_STATUSES = [
  'placeholder',
  'draft',
  'in_review',
  'approved',
  'outdated',
] as const;
export type ContentReviewStatus = (typeof CONTENT_REVIEW_STATUSES)[number];

/** Zweckbindung einer Einwilligung. Keine Buendelung. */
export const CONSENT_PURPOSES = [
  'terms',
  'privacy',
  'sensitive_support_needs',
  'profile_photo',
  'location_coarse',
  'push_notifications',
  'trusted_person_access',
  'contact_release',
  'quality_research',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

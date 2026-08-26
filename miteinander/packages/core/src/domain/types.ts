import type { Untertitelzeile } from '../content/untertitel.js';
import type {
  ApprovalKind,
  ApprovalLegalBasis,
  ApprovalStatus,
  BookingStatus,
  CommunicationMode,
  ConsentPurpose,
  ContentReviewStatus,
  IncidentPriority,
  IncidentStatus,
  PaymentStatus,
  ProviderKind,
  RequestStatus,
  UserRole,
  VerificationStatus,
} from './enums';

export type Id = string;
/** ISO-8601 Zeitstempel in UTC. */
export type IsoDateTime = string;
/** ISO-Datum ohne Zeit, z. B. "2026-03-14". */
export type IsoDate = string;

export interface User {
  id: Id;
  /** Anzeigename oder Vorname -- nie zwingend der Klarname. */
  displayName: string;
  email: string;
  roles: UserRole[];
  createdAt: IsoDateTime;
  /** Bestaetigt volljaehrig. Im MVP Zugangsvoraussetzung. */
  ageConfirmedAdult: boolean;
  locale: 'de-DE';
  deletedAt?: IsoDateTime | null;
}

/** Grobe Region statt exakter Adresse. Vier Stellen der PLZ genuegen nie -- wir speichern Ort + PLZ-Praefix. */
export interface CoarseRegion {
  /** Erste zwei bis drei Stellen der Postleitzahl, z. B. "221". */
  postalPrefix: string;
  city: string;
  /** Ungefaehrer Mittelpunkt, bewusst gerundet (ca. 1-2 km Unschaerfe). */
  approxLat: number;
  approxLon: number;
}

/** Exakte Adresse. Liegt getrennt und wird nur nach Freigabe herausgegeben. */
export interface PreciseAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  addressNote?: string;
}

export interface AccessibilityPreferences {
  userId: Id;
  uiMode: 'einfach' | 'standard' | 'individuell';
  /** Skalierungsfaktor der Schrift, 1.0 = Systemvorgabe. */
  fontScale: number;
  highContrast: boolean;
  colorScheme: 'system' | 'light' | 'dark';
  reduceMotion: boolean;
  /** Integrierter Vorlesemodus (zusaetzlich zum Screenreader des Systems). */
  readAloud: boolean;
  readAloudRate: number;
  haptics: boolean;
  /** Mindestgroesse der Tippflaeche in dp. */
  touchTargetSize: number;
  /** Zusaetzliche Bedienzeit: Faktor auf alle einblendbaren Hinweise. */
  extraTimeFactor: number;
  easyLanguage: boolean;
  signLanguage: boolean;
  captions: boolean;
  updatedAt: IsoDateTime;
}

export interface SupportSeekerProfile {
  userId: Id;
  region: CoarseRegion;
  /** Freiwillig, zweckgebunden, besonders geschuetzt. */
  supportNeeds: string[];
  mobilityNotes?: string;
  communicationModes: CommunicationMode[];
  languages: string[];
  /** Welche Felder vor einer bestaetigten Buchung sichtbar sind. */
  sharedBeforeBooking: SeekerFieldKey[];
  aboutMe?: string;
  photoUrl?: string | null;
  photoAltText?: string | null;
  preciseAddress?: PreciseAddress | null;
  phone?: string | null;
  updatedAt: IsoDateTime;
}

export type SeekerFieldKey =
  | 'displayName'
  | 'region'
  | 'aboutMe'
  | 'communicationModes'
  | 'languages'
  | 'mobilityNotes'
  | 'supportNeeds'
  | 'photoUrl'
  | 'phone'
  | 'preciseAddress';

export interface ServiceCategory {
  key: string;
  label: string;
  /** Erklaerung in Leichter Sprache. */
  easyLabel: string;
  icon: string;
  /**
   * Pflegerische, medizinische oder anderweitig erlaubnispflichtige Taetigkeit.
   * Solche Anfragen duerfen nur verifizierten Fachkraeften angezeigt werden.
   */
  requiresLicensedProfessional: boolean;
}

export interface ProviderProfile {
  userId: Id;
  kind: ProviderKind;
  region: CoarseRegion;
  /** Einsatzradius in Kilometern. */
  radiusKm: number;
  headline: string;
  aboutMe: string;
  /** Was ausdruecklich NICHT geleistet wird. Pflichtfeld -- schuetzt beide Seiten. */
  explicitlyNotOffered: string[];
  languages: string[];
  communicationModes: CommunicationMode[];
  /** Selbstauskunft; oeffentlich nur mit Nachweis (siehe signLanguageVerified). */
  signLanguageLevel: 'none' | 'basic' | 'conversational' | 'fluent' | 'native';
  signLanguageVerified: boolean;
  accessibilitySkills: string[];
  photoUrl?: string | null;
  photoAltText?: string | null;
  introVideoUrl?: string | null;
  volunteer: boolean;
  hourlyRateCents?: number | null;
  cancellationPolicy: string;
  hasMobility: boolean;
  updatedAt: IsoDateTime;
}

export interface ProviderService {
  providerId: Id;
  categoryKey: string;
  /** Jahre Erfahrung in dieser Kategorie -- Selbstauskunft. */
  experienceYears: number;
  note?: string;
}

export interface Qualification {
  key: string;
  label: string;
  /** Berechtigt zu erlaubnispflichtigen Taetigkeiten. */
  licensesProfessionalWork: boolean;
  /** Muss regelmaessig erneuert werden. */
  expires: boolean;
}

export interface ProviderVerification {
  id: Id;
  providerId: Id;
  qualificationKey: string;
  status: VerificationStatus;
  /** Nur der Speicherort, nie der Inhalt im Klartext im Profil. */
  documentPath?: string | null;
  submittedAt: IsoDateTime;
  decidedAt?: IsoDateTime | null;
  decidedBy?: Id | null;
  /** Zweites Augenpaar bei kritischen Entscheidungen. */
  secondApproverId?: Id | null;
  validUntil?: IsoDate | null;
  rejectionReason?: string | null;
}

export interface AvailabilitySlot {
  id: Id;
  providerId: Id;
  /** 1 = Montag ... 7 = Sonntag (ISO). */
  weekday: number;
  startMinute: number;
  endMinute: number;
  recurring: boolean;
  /** Konkretes Datum bei einmaliger Verfuegbarkeit. */
  date?: IsoDate | null;
}

export interface AbsencePeriod {
  id: Id;
  providerId: Id;
  from: IsoDate;
  to: IsoDate;
  reason?: string;
}

export interface SupportRequest {
  id: Id;
  seekerId: Id;
  status: RequestStatus;
  categoryKeys: string[];
  title: string;
  description: string;
  /** Was der Person wichtig ist -- Freitext plus Auswahl. */
  importantToMe: string[];
  region: CoarseRegion;
  startsAt: IsoDateTime;
  durationMinutes: number;
  recurrence: 'once' | 'weekly' | 'biweekly' | 'monthly';
  recurrenceCount?: number;
  /** Wird automatisch aus den Kategorien abgeleitet, nicht frei gesetzt. */
  requiresLicensedProfessional: boolean;
  preferredCommunicationModes: CommunicationMode[];
  languages: string[];
  budgetCentsPerHour?: number | null;
  acceptsVolunteers: boolean;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface MatchReason {
  code: string;
  /** Nachvollziehbare Begruendung in klarer Sprache. */
  text: string;
  easyText: string;
}

export interface Match {
  requestId: Id;
  providerId: Id;
  score: number;
  reasons: MatchReason[];
  /** Wird gesetzt, wenn ein Fall manuell geprueft werden muss. */
  needsManualReview: boolean;
  manualReviewReason?: string;
}

export interface Conversation {
  id: Id;
  requestId?: Id | null;
  seekerId: Id;
  providerId: Id;
  createdAt: IsoDateTime;
  closedAt?: IsoDateTime | null;
}

export interface Message {
  id: Id;
  conversationId: Id;
  senderId: Id;
  kind: 'text' | 'voice' | 'video_invite' | 'system';
  body: string;
  /** Transkript einer Sprachnachricht -- immer sichtbar, nie versteckt. */
  transcript?: string | null;
  mediaPath?: string | null;
  createdAt: IsoDateTime;
  readAt?: IsoDateTime | null;
}

export interface Booking {
  id: Id;
  requestId: Id;
  seekerId: Id;
  providerId: Id;
  status: BookingStatus;
  startsAt: IsoDateTime;
  durationMinutes: number;
  categoryKeys: string[];
  meetingPointDescription: string;
  /** Genaue Adresse erst nach Bestaetigung. */
  preciseAddressReleased: boolean;
  priceCents: number;
  volunteer: boolean;
  cancellationPolicy: string;
  notes?: string;
  /** Aktive Bestaetigung durch die suchende Person -- ohne diese keine Buchung. */
  confirmedBySeekerAt?: IsoDateTime | null;
  confirmedByProviderAt?: IsoDateTime | null;
  startedAt?: IsoDateTime | null;
  completedAt?: IsoDateTime | null;
  cancelledAt?: IsoDateTime | null;
  cancellationReason?: string | null;
  createdAt: IsoDateTime;
}

export interface PaymentIntent {
  id: Id;
  bookingId: Id;
  status: PaymentStatus;
  amountCents: number;
  currency: 'EUR';
  /** Zweite, ausdrueckliche Bestaetigung vor jeder Zahlung. */
  secondConfirmationAt?: IsoDateTime | null;
  providerRef?: string | null;
  invoicePath?: string | null;
  createdAt: IsoDateTime;
}

export interface Review {
  id: Id;
  bookingId: Id;
  authorId: Id;
  subjectId: Id;
  /** 1 = ging gar nicht, 2 = ging so, 3 = war gut. Bewusst grob. */
  rating: 1 | 2 | 3;
  publicComment?: string | null;
  /** Getrennt vom oeffentlichen Text, geht nur an das Sicherheitsteam. */
  privateFeedback?: string | null;
  createdAt: IsoDateTime;
}

export interface Report {
  id: Id;
  reporterId: Id;
  subjectUserId?: Id | null;
  bookingId?: Id | null;
  conversationId?: Id | null;
  category: 'belaestigung' | 'diskriminierung' | 'betrug' | 'nicht_erschienen' | 'grenzverletzung' | 'falsche_angaben' | 'sonstiges';
  description: string;
  createdAt: IsoDateTime;
  incidentId?: Id | null;
}

export interface Incident {
  id: Id;
  priority: IncidentPriority;
  status: IncidentStatus;
  title: string;
  summary: string;
  assignedTo?: Id | null;
  /** Sperrungen brauchen zwei Personen. */
  requiresFourEyes: boolean;
  secondApproverId?: Id | null;
  createdAt: IsoDateTime;
  resolvedAt?: IsoDateTime | null;
}

export interface ConsentRecord {
  id: Id;
  userId: Id;
  purpose: ConsentPurpose;
  granted: boolean;
  /** Fassung des Textes, dem zugestimmt wurde. */
  policyVersion: string;
  grantedAt?: IsoDateTime | null;
  revokedAt?: IsoDateTime | null;
  /** Wie die Einwilligung erteilt wurde -- fuer die Nachweispflicht. */
  channel: 'tap' | 'voice_confirmed' | 'assisted_by_trusted_person' | 'admin_correction';
  assistedBy?: Id | null;
}

export interface TrustedAccessGrant {
  id: Id;
  seekerId: Id;
  trustedPersonId: Id;
  scopes: TrustedScope[];
  /**
   * Stufe der Verantwortung.
   *
   * "begleitung"   -- unterstuetzt beim Bedienen, sieht was freigegeben ist,
   *                   entscheidet aber nichts.
   * "verantwortung" -- muss zusaetzlich die unten benannten Handlungen
   *                   freigeben, bevor sie wirksam werden.
   */
  responsibilityLevel: 'begleitung' | 'verantwortung';
  /** Handlungen, die diese Person freigeben muss. Leer bei "begleitung". */
  approvalRequired: ApprovalKind[];
  /** Worauf sich die Freigabepflicht stuetzt. Null, wenn keine besteht. */
  approvalLegalBasis?: ApprovalLegalBasis | null;
  /** Aktenzeichen des Betreuungsgerichts -- Pflicht bei "court_ordered". */
  courtReference?: string | null;
  /** Immer widerrufbar, immer sichtbar. */
  createdAt: IsoDateTime;
  expiresAt?: IsoDateTime | null;
  revokedAt?: IsoDateTime | null;
  /** Rechtliche Grundlage im Klartext, falls Betreuung besteht. */
  legalBasisNote?: string | null;
}

/**
 * Eine einzelne Freigabeanfrage.
 *
 * Grundsaetze, die im Zustandsautomaten durchgesetzt werden:
 *  - Es gibt keine stille Zustimmung durch Zeitablauf.
 *  - Es gibt keine stille Ablehnung. Ohne Antwort bleibt der Fall offen und
 *    sichtbar, und es wird erinnert.
 *  - Die unterstuetzungssuchende Person sieht jede Freigabeanfrage, die sie
 *    betrifft, samt Stand und zustaendiger Person.
 *  - Eine Ablehnung braucht eine Begruendung.
 */
export interface ApprovalRequest {
  id: Id;
  seekerId: Id;
  responsibleId: Id;
  kind: ApprovalKind;
  /** Anfrage, Buchung oder Zahlung, um die es geht. */
  subjectId: Id;
  status: ApprovalStatus;
  /** Kurzfassung fuer die Anzeige. Ohne sensible Angaben. */
  summary: string;
  /** Dieselbe Kurzfassung in Leichter Sprache. */
  easySummary: string;
  createdAt: IsoDateTime;
  /** Bis wann eine Antwort erwartet wird. Danach wird erinnert, nichts sonst. */
  respondBy: IsoDateTime;
  decidedAt?: IsoDateTime | null;
  decidedBy?: Id | null;
  /** Pflicht bei einer Ablehnung -- die Person hat ein Recht auf den Grund. */
  reason?: string | null;
  remindedAt?: IsoDateTime | null;
}

export type TrustedScope =
  | 'view_profile'
  | 'edit_profile'
  | 'create_requests'
  | 'read_messages'
  | 'write_messages'
  | 'confirm_bookings'
  | 'manage_payments';

export interface DgsContentItem {
  key: string;
  title: string;
  status: ContentReviewStatus;
  videoUrl?: string | null;
  captionsUrl?: string | null;
  /** Untertitel als Daten -- die App setzt sie selbst, damit sie mitwachsen. */
  untertitel: Untertitelzeile[];
  transcript?: string | null;
  /** Wer geprueft hat. Ohne Eintrag gilt der Inhalt nicht als geprueft. */
  reviewedBy?: string | null;
  reviewedAt?: IsoDateTime | null;
  version: number;
}

export interface EasyLanguageItem {
  key: string;
  text: string;
  status: ContentReviewStatus;
  reviewedBy?: string | null;
  reviewedAt?: IsoDateTime | null;
}

export interface Notification {
  id: Id;
  userId: Id;
  kind: 'booking' | 'message' | 'verification' | 'reminder' | 'safety';
  /** Bewusst inhaltsarm -- keine sensiblen Daten in der Push-Vorschau. */
  title: string;
  body: string;
  deeplink: string;
  createdAt: IsoDateTime;
  readAt?: IsoDateTime | null;
}

export interface AuditEvent {
  id: Id;
  actorId?: Id | null;
  action: string;
  entity: string;
  entityId: Id;
  at: IsoDateTime;
  /** Keine sensiblen Inhalte, nur was fuer die Revision noetig ist. */
  metadata: Record<string, string | number | boolean>;
}

import type {
  AbsencePeriod,
  ApprovalRequest,
  AuditEvent,
  AvailabilitySlot,
  Booking,
  ConsentRecord,
  Conversation,
  Id,
  Incident,
  Message,
  Notification,
  ProviderProfile,
  ProviderService,
  ProviderVerification,
  Report,
  Review,
  SupportRequest,
  SupportSeekerProfile,
  TrustedAccessGrant,
  User,
  AccessibilityPreferences,
} from '../domain/types';

/**
 * Schnittstellen der Datenschicht.
 *
 * Der gesamte Anwendungskern spricht nur diese Interfaces an. Die
 * Supabase-Implementierung und die In-Memory-Implementierung sind
 * austauschbar -- ein spaeterer Wechsel des Backends beruehrt keine
 * Domaenenlogik.
 */

export interface Repository<T> {
  get(id: Id): Promise<T | undefined>;
  list(): Promise<T[]>;
  save(entity: T): Promise<T>;
}

export interface UserRepository extends Repository<User> {
  findByEmail(email: string): Promise<User | undefined>;
}

export interface SeekerProfileRepository {
  get(userId: Id): Promise<SupportSeekerProfile | undefined>;
  save(profile: SupportSeekerProfile): Promise<SupportSeekerProfile>;
}

export interface ProviderRepository {
  get(userId: Id): Promise<ProviderProfile | undefined>;
  save(profile: ProviderProfile): Promise<ProviderProfile>;
  list(): Promise<ProviderProfile[]>;
  services(providerId: Id): Promise<ProviderService[]>;
  saveService(service: ProviderService): Promise<ProviderService>;
  availability(providerId: Id): Promise<AvailabilitySlot[]>;
  saveAvailability(slot: AvailabilitySlot): Promise<AvailabilitySlot>;
  absences(providerId: Id): Promise<AbsencePeriod[]>;
  saveAbsence(absence: AbsencePeriod): Promise<AbsencePeriod>;
}

export interface VerificationRepository {
  forProvider(providerId: Id): Promise<ProviderVerification[]>;
  save(verification: ProviderVerification): Promise<ProviderVerification>;
  pending(): Promise<ProviderVerification[]>;
  all(): Promise<ProviderVerification[]>;
}

export interface RequestRepository extends Repository<SupportRequest> {
  forSeeker(seekerId: Id): Promise<SupportRequest[]>;
  open(): Promise<SupportRequest[]>;
}

export interface BookingRepository extends Repository<Booking> {
  forUser(userId: Id): Promise<Booking[]>;
  forRequest(requestId: Id): Promise<Booking[]>;
}

export interface ConversationRepository extends Repository<Conversation> {
  forUser(userId: Id): Promise<Conversation[]>;
  messages(conversationId: Id): Promise<Message[]>;
  addMessage(message: Message): Promise<Message>;
}

export interface ConsentRepository {
  forUser(userId: Id): Promise<ConsentRecord[]>;
  save(record: ConsentRecord): Promise<ConsentRecord>;
}

export interface PreferencesRepository {
  get(userId: Id): Promise<AccessibilityPreferences | undefined>;
  save(prefs: AccessibilityPreferences): Promise<AccessibilityPreferences>;
}

export interface TrustRepository {
  forSeeker(seekerId: Id): Promise<TrustedAccessGrant[]>;
  forTrustedPerson(trustedPersonId: Id): Promise<TrustedAccessGrant[]>;
  save(grant: TrustedAccessGrant): Promise<TrustedAccessGrant>;
}

export interface ApprovalRepository {
  get(id: Id): Promise<ApprovalRequest | undefined>;
  save(request: ApprovalRequest): Promise<ApprovalRequest>;
  /** Alles, was diese verantwortliche Person betrifft. */
  forResponsible(responsibleId: Id): Promise<ApprovalRequest[]>;
  /** Alles, was diese Person betrifft -- sie sieht immer alles zu sich. */
  forSeeker(seekerId: Id): Promise<ApprovalRequest[]>;
  forSubject(subjectId: Id): Promise<ApprovalRequest[]>;
}

export interface SafetyRepository {
  saveReport(report: Report): Promise<Report>;
  reports(): Promise<Report[]>;
  saveIncident(incident: Incident): Promise<Incident>;
  incidents(): Promise<Incident[]>;
}

export interface ReviewRepository {
  forSubject(subjectId: Id): Promise<Review[]>;
  save(review: Review): Promise<Review>;
}

export interface NotificationRepository {
  forUser(userId: Id): Promise<Notification[]>;
  save(notification: Notification): Promise<Notification>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<AuditEvent>;
  list(): Promise<AuditEvent[]>;
}

/** Buendel aller Repositories. Wird einmal zusammengestellt und durchgereicht. */
export interface DataContext {
  users: UserRepository;
  seekers: SeekerProfileRepository;
  providers: ProviderRepository;
  verifications: VerificationRepository;
  requests: RequestRepository;
  bookings: BookingRepository;
  conversations: ConversationRepository;
  consents: ConsentRepository;
  preferences: PreferencesRepository;
  trust: TrustRepository;
  approvals: ApprovalRepository;
  safety: SafetyRepository;
  reviews: ReviewRepository;
  notifications: NotificationRepository;
  audit: AuditRepository;
}

/** Zeitquelle als Abhaengigkeit -- macht Tests deterministisch. */
export interface Clock {
  now(): string;
  today(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
};

export function fixedClock(iso: string): Clock {
  return { now: () => iso, today: () => iso.slice(0, 10) };
}

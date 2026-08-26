import type {
  AbsencePeriod,
  AccessibilityPreferences,
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
} from '../../domain/types';
import type { DataContext } from '../repositories';

/**
 * In-Memory-Implementierung der Datenschicht.
 *
 * Zweck: der MVP laeuft ohne Backend (Demo-Modus in der App) und die
 * Domaenenlogik ist ohne Datenbank testbar. Die Zugriffsregeln werden NICHT
 * hier durchgesetzt, sondern in der Service-Schicht und in der Row-Level-
 * Security der Datenbank -- sonst haetten wir zwei Wahrheiten.
 */
export interface MemorySeed {
  users?: User[];
  seekers?: SupportSeekerProfile[];
  providers?: ProviderProfile[];
  services?: ProviderService[];
  availability?: AvailabilitySlot[];
  absences?: AbsencePeriod[];
  verifications?: ProviderVerification[];
  requests?: SupportRequest[];
  bookings?: Booking[];
  conversations?: Conversation[];
  messages?: Message[];
  consents?: ConsentRecord[];
  preferences?: AccessibilityPreferences[];
  trust?: TrustedAccessGrant[];
  approvals?: ApprovalRequest[];
  reports?: Report[];
  incidents?: Incident[];
  reviews?: Review[];
  notifications?: Notification[];
}

export function createMemoryContext(seed: MemorySeed = {}): DataContext {
  const users = new Map<Id, User>((seed.users ?? []).map((u) => [u.id, u]));
  const seekers = new Map<Id, SupportSeekerProfile>((seed.seekers ?? []).map((p) => [p.userId, p]));
  const providers = new Map<Id, ProviderProfile>((seed.providers ?? []).map((p) => [p.userId, p]));
  const services = [...(seed.services ?? [])];
  const availability = [...(seed.availability ?? [])];
  const absences = [...(seed.absences ?? [])];
  const verifications = [...(seed.verifications ?? [])];
  const requests = new Map<Id, SupportRequest>((seed.requests ?? []).map((r) => [r.id, r]));
  const bookings = new Map<Id, Booking>((seed.bookings ?? []).map((b) => [b.id, b]));
  const conversations = new Map<Id, Conversation>((seed.conversations ?? []).map((c) => [c.id, c]));
  const messages = [...(seed.messages ?? [])];
  const consents = [...(seed.consents ?? [])];
  const preferences = new Map<Id, AccessibilityPreferences>(
    (seed.preferences ?? []).map((p) => [p.userId, p]),
  );
  const trust = [...(seed.trust ?? [])];
  const approvals = [...(seed.approvals ?? [])];
  const reports = [...(seed.reports ?? [])];
  const incidents = [...(seed.incidents ?? [])];
  const reviews = [...(seed.reviews ?? [])];
  const notifications = [...(seed.notifications ?? [])];
  const audit: AuditEvent[] = [];

  const clone = <T>(value: T): T => structuredClone(value);

  return {
    users: {
      async get(id) {
        const u = users.get(id);
        return u ? clone(u) : undefined;
      },
      async list() {
        return [...users.values()].map(clone);
      },
      async save(user) {
        users.set(user.id, clone(user));
        return user;
      },
      async findByEmail(email) {
        const u = [...users.values()].find((x) => x.email.toLowerCase() === email.toLowerCase());
        return u ? clone(u) : undefined;
      },
    },
    seekers: {
      async get(userId) {
        const p = seekers.get(userId);
        return p ? clone(p) : undefined;
      },
      async save(profile) {
        seekers.set(profile.userId, clone(profile));
        return profile;
      },
    },
    providers: {
      async get(userId) {
        const p = providers.get(userId);
        return p ? clone(p) : undefined;
      },
      async save(profile) {
        providers.set(profile.userId, clone(profile));
        return profile;
      },
      async list() {
        return [...providers.values()].map(clone);
      },
      async services(providerId) {
        return services.filter((s) => s.providerId === providerId).map(clone);
      },
      async saveService(service) {
        const idx = services.findIndex(
          (s) => s.providerId === service.providerId && s.categoryKey === service.categoryKey,
        );
        if (idx >= 0) services[idx] = clone(service);
        else services.push(clone(service));
        return service;
      },
      async availability(providerId) {
        return availability.filter((a) => a.providerId === providerId).map(clone);
      },
      async saveAvailability(slot) {
        const idx = availability.findIndex((a) => a.id === slot.id);
        if (idx >= 0) availability[idx] = clone(slot);
        else availability.push(clone(slot));
        return slot;
      },
      async absences(providerId) {
        return absences.filter((a) => a.providerId === providerId).map(clone);
      },
      async saveAbsence(absence) {
        const idx = absences.findIndex((a) => a.id === absence.id);
        if (idx >= 0) absences[idx] = clone(absence);
        else absences.push(clone(absence));
        return absence;
      },
    },
    verifications: {
      async forProvider(providerId) {
        return verifications.filter((v) => v.providerId === providerId).map(clone);
      },
      async save(verification) {
        const idx = verifications.findIndex((v) => v.id === verification.id);
        if (idx >= 0) verifications[idx] = clone(verification);
        else verifications.push(clone(verification));
        return verification;
      },
      async pending() {
        return verifications.filter((v) => v.status === 'pending').map(clone);
      },
      async all() {
        return verifications.map(clone);
      },
    },
    requests: {
      async get(id) {
        const r = requests.get(id);
        return r ? clone(r) : undefined;
      },
      async list() {
        return [...requests.values()].map(clone);
      },
      async save(request) {
        requests.set(request.id, clone(request));
        return request;
      },
      async forSeeker(seekerId) {
        return [...requests.values()].filter((r) => r.seekerId === seekerId).map(clone);
      },
      async open() {
        return [...requests.values()].filter((r) => r.status === 'open').map(clone);
      },
    },
    bookings: {
      async get(id) {
        const b = bookings.get(id);
        return b ? clone(b) : undefined;
      },
      async list() {
        return [...bookings.values()].map(clone);
      },
      async save(booking) {
        bookings.set(booking.id, clone(booking));
        return booking;
      },
      async forUser(userId) {
        return [...bookings.values()]
          .filter((b) => b.seekerId === userId || b.providerId === userId)
          .map(clone);
      },
      async forRequest(requestId) {
        return [...bookings.values()].filter((b) => b.requestId === requestId).map(clone);
      },
    },
    conversations: {
      async get(id) {
        const c = conversations.get(id);
        return c ? clone(c) : undefined;
      },
      async list() {
        return [...conversations.values()].map(clone);
      },
      async save(conversation) {
        conversations.set(conversation.id, clone(conversation));
        return conversation;
      },
      async forUser(userId) {
        return [...conversations.values()]
          .filter((c) => c.seekerId === userId || c.providerId === userId)
          .map(clone);
      },
      async messages(conversationId) {
        return messages
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(clone);
      },
      async addMessage(message) {
        messages.push(clone(message));
        return message;
      },
    },
    consents: {
      async forUser(userId) {
        return consents.filter((c) => c.userId === userId).map(clone);
      },
      async save(record) {
        const idx = consents.findIndex((c) => c.id === record.id);
        if (idx >= 0) consents[idx] = clone(record);
        else consents.push(clone(record));
        return record;
      },
    },
    preferences: {
      async get(userId) {
        const p = preferences.get(userId);
        return p ? clone(p) : undefined;
      },
      async save(prefs) {
        preferences.set(prefs.userId, clone(prefs));
        return prefs;
      },
    },
    trust: {
      async forSeeker(seekerId) {
        return trust.filter((g) => g.seekerId === seekerId).map(clone);
      },
      async forTrustedPerson(trustedPersonId) {
        return trust.filter((g) => g.trustedPersonId === trustedPersonId).map(clone);
      },
      async save(grant) {
        const idx = trust.findIndex((g) => g.id === grant.id);
        if (idx >= 0) trust[idx] = clone(grant);
        else trust.push(clone(grant));
        return grant;
      },
    },
    approvals: {
      async get(id) {
        const a = approvals.find((x) => x.id === id);
        return a ? clone(a) : undefined;
      },
      async save(request) {
        const idx = approvals.findIndex((a) => a.id === request.id);
        if (idx >= 0) approvals[idx] = clone(request);
        else approvals.push(clone(request));
        return request;
      },
      async forResponsible(responsibleId) {
        return approvals.filter((a) => a.responsibleId === responsibleId).map(clone);
      },
      async forSeeker(seekerId) {
        return approvals.filter((a) => a.seekerId === seekerId).map(clone);
      },
      async forSubject(subjectId) {
        return approvals.filter((a) => a.subjectId === subjectId).map(clone);
      },
    },
    safety: {
      async saveReport(report) {
        reports.push(clone(report));
        return report;
      },
      async reports() {
        return reports.map(clone);
      },
      async saveIncident(incident) {
        const idx = incidents.findIndex((i) => i.id === incident.id);
        if (idx >= 0) incidents[idx] = clone(incident);
        else incidents.push(clone(incident));
        return incident;
      },
      async incidents() {
        return incidents.map(clone);
      },
    },
    reviews: {
      async forSubject(subjectId) {
        return reviews.filter((r) => r.subjectId === subjectId).map(clone);
      },
      async save(review) {
        reviews.push(clone(review));
        return review;
      },
    },
    notifications: {
      async forUser(userId) {
        return notifications.filter((n) => n.userId === userId).map(clone);
      },
      async save(notification) {
        notifications.push(clone(notification));
        return notification;
      },
    },
    audit: {
      async append(event) {
        audit.push(clone(event));
        return event;
      },
      async list() {
        return audit.map(clone);
      },
    },
  };
}

import type {
  AuditEvent,
  Booking,
  Conversation,
  Id,
  Message,
  Notification,
  Report,
  Review,
  SupportRequest,
} from '../domain/types';
import type { Clock, DataContext } from '../data/repositories';
import { finalizeDraft, type RequestDraft } from '../requests/wizard';
import { findMatches, type ScoredProvider } from '../matching/matcher';
import type { ProviderRecord } from '../matching/eligibility';
import { buildBookingSummary, type ConfirmationSummary } from '../booking/summary';
import {
  confirmByProvider,
  confirmBySeeker,
  describeCancellation,
  transition,
  type CancellationOutcome,
} from '../booking/state-machine';
import { hasActiveConsent, mayProcess } from '../privacy/consent';
import { redactSeekerProfile, safeNotificationBody, stripSensitive } from '../privacy/visibility';
import { incidentFromReport, RESPONSE_TARGET_HOURS } from '../security/incidents';
import { requirePermission } from '../security/permissions';
import { getCategory } from '../domain/service-categories';

/**
 * Anwendungsschicht.
 *
 * Hier laufen Datenzugriff, Einwilligungen, Rechte und Domaenenregeln
 * zusammen. Die Oberflaechen (App und Adminbereich) rufen ausschliesslich
 * diese Methoden auf und treffen selbst keine fachlichen Entscheidungen.
 */

export interface IdGenerator {
  next(prefix: string): string;
}

/** Deterministischer Generator -- in Tests reproduzierbar. */
export function createCounterIds(start = 1): IdGenerator {
  let n = start;
  return { next: (prefix) => `${prefix}_${n++}` };
}

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export interface SuggestionView {
  match: ScoredProvider;
  providerName: string;
  headline: string;
  kind: string;
  priceLabel: string;
  distanceLabel: string;
  /** Warum wird das vorgeschlagen? Immer sichtbar, nie geheim. */
  reasons: string[];
  easyReasons: string[];
}

export class SupportService {
  constructor(
    private readonly data: DataContext,
    private readonly clock: Clock,
    private readonly ids: IdGenerator = createCounterIds(),
  ) {}

  private async audit(
    actorId: Id | null,
    action: string,
    entity: string,
    entityId: Id,
    metadata: Record<string, unknown> = {},
  ): Promise<AuditEvent> {
    return this.data.audit.append({
      id: this.ids.next('audit'),
      actorId,
      action,
      entity,
      entityId,
      at: this.clock.now(),
      metadata: stripSensitive(metadata) as Record<string, string | number | boolean>,
    });
  }

  private async notify(
    userId: Id,
    kind: Notification['kind'],
    title: string,
    deeplink: string,
  ): Promise<Notification> {
    // Der Text kommt aus einer Whitelist -- keine Inhalte in der Vorschau.
    return this.data.notifications.save({
      id: this.ids.next('note'),
      userId,
      kind,
      title,
      body: safeNotificationBody(kind),
      deeplink,
      createdAt: this.clock.now(),
      readAt: null,
    });
  }

  /**
   * Anfrage absenden.
   *
   * Enthaelt die Anfrage Angaben zum Unterstuetzungsbedarf, ist dafuer eine
   * ausdrueckliche Einwilligung noetig (Art. 9 DSGVO). Fehlt sie, wird die
   * Anfrage nicht heimlich beschnitten, sondern klar abgelehnt.
   */
  async submitRequest(draft: RequestDraft): Promise<SupportRequest> {
    const user = await this.data.users.get(draft.seekerId);
    if (!user) throw new ServiceError('Konto nicht gefunden.', 'user_not_found');
    requirePermission(user, 'request.create');

    const request = finalizeDraft(draft, this.clock.now());

    const revealsSupportNeeds =
      request.importantToMe.length > 0 || request.requiresLicensedProfessional;
    if (revealsSupportNeeds) {
      const consents = await this.data.consents.forUser(draft.seekerId);
      const decision = mayProcess(consents, 'sensitive_support_needs');
      if (!decision.allowed) {
        throw new ServiceError(
          `Für diese Angaben fehlt Ihre Einwilligung. ${decision.reason}`,
          'consent_missing',
        );
      }
    }

    await this.data.requests.save(request);
    await this.audit(draft.seekerId, 'request.submitted', 'support_requests', request.id, {
      categories: request.categoryKeys.length,
      requiresLicensedProfessional: request.requiresLicensedProfessional,
    });
    return request;
  }

  /** Laedt einen Anbietenden vollstaendig -- Profil, Leistungen, Nachweise, Zeiten. */
  private async loadProviderRecord(providerId: Id): Promise<ProviderRecord | undefined> {
    const profile = await this.data.providers.get(providerId);
    if (!profile) return undefined;
    const [services, verifications, availability, absences, reviews] = await Promise.all([
      this.data.providers.services(providerId),
      this.data.verifications.forProvider(providerId),
      this.data.providers.availability(providerId),
      this.data.providers.absences(providerId),
      this.data.reviews.forSubject(providerId),
    ]);
    const record: ProviderRecord = { profile, services, verifications, availability, absences };
    if (reviews.length > 0) {
      record.averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      record.reviewCount = reviews.length;
    }
    return record;
  }

  async loadAllProviderRecords(): Promise<ProviderRecord[]> {
    const profiles = await this.data.providers.list();
    const records = await Promise.all(profiles.map((p) => this.loadProviderRecord(p.userId)));
    return records.filter((r): r is ProviderRecord => r !== undefined);
  }

  /** Vorschlaege zu einer Anfrage, aufbereitet fuer die Anzeige. */
  async suggestProviders(requestId: Id, limit = 10): Promise<SuggestionView[]> {
    const request = await this.data.requests.get(requestId);
    if (!request) throw new ServiceError('Anfrage nicht gefunden.', 'request_not_found');

    const records = await this.loadAllProviderRecords();
    const matches = findMatches(request, records, { today: this.clock.today(), limit });

    const views: SuggestionView[] = [];
    for (const match of matches) {
      const user = await this.data.users.get(match.providerId);
      const record = records.find((r) => r.profile.userId === match.providerId);
      if (!user || !record) continue;
      views.push({
        match,
        providerName: user.displayName,
        headline: record.profile.headline,
        kind: record.profile.kind,
        priceLabel: record.profile.volunteer
          ? 'ehrenamtlich, kostenlos'
          : record.profile.hourlyRateCents != null
            ? `${(record.profile.hourlyRateCents / 100).toFixed(2).replace('.', ',')} Euro pro Stunde`
            : 'Preis auf Anfrage',
        distanceLabel: match.distanceLabel,
        reasons: match.reasons.map((r) => r.text),
        easyReasons: match.reasons.map((r) => r.easyText),
      });
    }
    return views;
  }

  /**
   * Was eine anbietende Person vor der Annahme sieht.
   * Bewusst reduziert: nur was fuer die Entscheidung noetig ist.
   */
  async requestPreviewForProvider(requestId: Id): Promise<{
    request: Pick<SupportRequest, 'id' | 'title' | 'categoryKeys' | 'startsAt' | 'durationMinutes' | 'recurrence'>;
    regionLabel: string;
    seeker: ReturnType<typeof redactSeekerProfile>;
    categoryLabels: string[];
  }> {
    const request = await this.data.requests.get(requestId);
    if (!request) throw new ServiceError('Anfrage nicht gefunden.', 'request_not_found');
    const profile = await this.data.seekers.get(request.seekerId);
    if (!profile) throw new ServiceError('Profil nicht gefunden.', 'profile_not_found');

    return {
      request: {
        id: request.id,
        title: request.title,
        categoryKeys: request.categoryKeys,
        startsAt: request.startsAt,
        durationMinutes: request.durationMinutes,
        recurrence: request.recurrence,
      },
      regionLabel: `${request.region.city} (${request.region.postalPrefix}…)`,
      seeker: redactSeekerProfile(profile, { kind: 'provider_candidate' }),
      categoryLabels: request.categoryKeys.map((k) => getCategory(k)?.label ?? k),
    };
  }

  async startConversation(requestId: Id, providerId: Id): Promise<Conversation> {
    const request = await this.data.requests.get(requestId);
    if (!request) throw new ServiceError('Anfrage nicht gefunden.', 'request_not_found');

    const existing = (await this.data.conversations.forUser(request.seekerId)).find(
      (c) => c.providerId === providerId && c.requestId === requestId,
    );
    if (existing) return existing;

    const conversation: Conversation = {
      id: this.ids.next('conv'),
      requestId,
      seekerId: request.seekerId,
      providerId,
      createdAt: this.clock.now(),
      closedAt: null,
    };
    await this.data.conversations.save(conversation);
    await this.notify(providerId, 'message', 'Neue Anfrage', `/chat/${conversation.id}`);
    await this.audit(request.seekerId, 'conversation.started', 'conversations', conversation.id, {});
    return conversation;
  }

  /**
   * Nachricht senden. Sprachnachrichten tragen immer ein sichtbares
   * Transkript -- eine Nachricht, die nur gehoert werden kann, waere fuer
   * gehoerlose Nutzende nicht zugaenglich.
   */
  async sendMessage(
    conversationId: Id,
    senderId: Id,
    kind: Message['kind'],
    body: string,
    options: { transcript?: string; mediaPath?: string } = {},
  ): Promise<Message> {
    const conversation = await this.data.conversations.get(conversationId);
    if (!conversation) throw new ServiceError('Unterhaltung nicht gefunden.', 'conversation_not_found');
    if (conversation.seekerId !== senderId && conversation.providerId !== senderId) {
      throw new ServiceError('Kein Zugriff auf diese Unterhaltung.', 'forbidden');
    }
    if (kind === 'voice' && !options.transcript?.trim()) {
      throw new ServiceError(
        'Eine Sprachnachricht braucht ein Transkript, damit sie alle lesen können.',
        'transcript_required',
      );
    }

    const message: Message = {
      id: this.ids.next('msg'),
      conversationId,
      senderId,
      kind,
      body,
      transcript: options.transcript ?? null,
      mediaPath: options.mediaPath ?? null,
      createdAt: this.clock.now(),
      readAt: null,
    };
    await this.data.conversations.addMessage(message);
    const recipient =
      senderId === conversation.seekerId ? conversation.providerId : conversation.seekerId;
    await this.notify(recipient, 'message', 'Neue Nachricht', `/chat/${conversationId}`);
    return message;
  }

  /** Schlaegt eine Buchung vor. Verbindlich wird sie erst durch zwei Bestaetigungen. */
  async proposeBooking(input: {
    requestId: Id;
    providerId: Id;
    startsAt: string;
    durationMinutes: number;
    meetingPointDescription: string;
    priceCents: number;
    notes?: string;
  }): Promise<{ booking: Booking; summary: ConfirmationSummary }> {
    const request = await this.data.requests.get(input.requestId);
    if (!request) throw new ServiceError('Anfrage nicht gefunden.', 'request_not_found');
    const record = await this.loadProviderRecord(input.providerId);
    if (!record) throw new ServiceError('Anbieterprofil nicht gefunden.', 'provider_not_found');
    const providerUser = await this.data.users.get(input.providerId);
    if (!providerUser) throw new ServiceError('Konto nicht gefunden.', 'user_not_found');

    const booking: Booking = {
      id: this.ids.next('book'),
      requestId: request.id,
      seekerId: request.seekerId,
      providerId: input.providerId,
      status: 'proposed',
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      categoryKeys: [...request.categoryKeys],
      meetingPointDescription: input.meetingPointDescription,
      preciseAddressReleased: false,
      priceCents: record.profile.volunteer ? 0 : input.priceCents,
      volunteer: record.profile.volunteer,
      cancellationPolicy: record.profile.cancellationPolicy,
      ...(input.notes ? { notes: input.notes } : {}),
      confirmedBySeekerAt: null,
      confirmedByProviderAt: null,
      createdAt: this.clock.now(),
    };
    await this.data.bookings.save(booking);
    await this.audit(input.providerId, 'booking.proposed', 'bookings', booking.id, {
      durationMinutes: booking.durationMinutes,
      volunteer: booking.volunteer,
    });

    return { booking, summary: buildBookingSummary(booking, record.profile, providerUser.displayName) };
  }

  /** Zusammenfassung vor der Bestaetigung -- Pflicht, nicht optional. */
  async bookingSummary(bookingId: Id): Promise<ConfirmationSummary> {
    const booking = await this.data.bookings.get(bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    const profile = await this.data.providers.get(booking.providerId);
    const user = await this.data.users.get(booking.providerId);
    if (!profile || !user) throw new ServiceError('Anbieterprofil nicht gefunden.', 'provider_not_found');
    return buildBookingSummary(booking, profile, user.displayName);
  }

  /**
   * Aktive Bestaetigung einer Seite. Sobald beide bestaetigt haben, wird die
   * Buchung verbindlich und der Treffpunkt freigegeben.
   */
  async confirmBooking(bookingId: Id, actorId: Id): Promise<Booking> {
    let booking = await this.data.bookings.get(bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    const actor = await this.data.users.get(actorId);
    if (!actor) throw new ServiceError('Konto nicht gefunden.', 'user_not_found');
    requirePermission(actor, 'booking.confirm');

    const now = this.clock.now();
    if (actorId === booking.seekerId) {
      // Kontaktfreigabe ist eine eigene Einwilligung, kein Nebeneffekt der Buchung.
      const consents = await this.data.consents.forUser(actorId);
      if (!hasActiveConsent(consents, 'contact_release')) {
        throw new ServiceError(
          'Bitte geben Sie zuerst frei, dass die Person Ihre Kontaktdaten für diesen Termin sehen darf.',
          'contact_release_missing',
        );
      }
      booking = confirmBySeeker(booking, now);
    } else if (actorId === booking.providerId) {
      booking = confirmByProvider(booking, now);
    } else {
      throw new ServiceError('Nur die Beteiligten können diese Buchung bestätigen.', 'forbidden');
    }

    if (booking.confirmedBySeekerAt && booking.confirmedByProviderAt && booking.status === 'proposed') {
      booking = transition(booking, 'confirmed', { now, actorId });
      const request = await this.data.requests.get(booking.requestId);
      if (request) await this.data.requests.save({ ...request, status: 'booked', updatedAt: now });
      await this.notify(booking.seekerId, 'booking', 'Ihr Termin steht fest', `/termine/${booking.id}`);
      await this.notify(booking.providerId, 'booking', 'Termin bestätigt', `/termine/${booking.id}`);
    }

    await this.data.bookings.save(booking);
    await this.audit(actorId, 'booking.confirmed', 'bookings', booking.id, { status: booking.status });
    return booking;
  }

  /** Vor jeder Absage sagen wir ehrlich, was sie kostet. */
  async previewCancellation(bookingId: Id): Promise<CancellationOutcome> {
    const booking = await this.data.bookings.get(bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    return describeCancellation(booking, this.clock.now());
  }

  async cancelBooking(bookingId: Id, actorId: Id, reason: string): Promise<Booking> {
    const booking = await this.data.bookings.get(bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    const target =
      actorId === booking.seekerId
        ? 'cancelled_by_seeker'
        : actorId === booking.providerId
          ? 'cancelled_by_provider'
          : null;
    if (!target) throw new ServiceError('Nur die Beteiligten können absagen.', 'forbidden');

    const next = transition(booking, target, { now: this.clock.now(), actorId, reason });
    await this.data.bookings.save(next);
    const other = actorId === booking.seekerId ? booking.providerId : booking.seekerId;
    await this.notify(other, 'booking', 'Ein Termin wurde abgesagt', `/termine/${booking.id}`);
    await this.audit(actorId, 'booking.cancelled', 'bookings', booking.id, { status: next.status });
    return next;
  }

  async completeBooking(bookingId: Id, actorId: Id): Promise<Booking> {
    let booking = await this.data.bookings.get(bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    const now = this.clock.now();
    if (booking.status === 'confirmed') {
      booking = transition(booking, 'in_progress', { now, actorId });
    }
    booking = transition(booking, 'completed', { now, actorId });
    await this.data.bookings.save(booking);
    await this.audit(actorId, 'booking.completed', 'bookings', booking.id, {});
    return booking;
  }

  /**
   * Bewertung. Die private Rueckmeldung an das Sicherheitsteam wird getrennt
   * gefuehrt und erscheint nie oeffentlich.
   */
  async submitReview(input: {
    bookingId: Id;
    authorId: Id;
    rating: 1 | 2 | 3;
    publicComment?: string;
    privateFeedback?: string;
  }): Promise<Review> {
    const booking = await this.data.bookings.get(input.bookingId);
    if (!booking) throw new ServiceError('Buchung nicht gefunden.', 'booking_not_found');
    if (booking.status !== 'completed') {
      throw new ServiceError('Bewerten können Sie erst nach dem Termin.', 'booking_not_completed');
    }
    const subjectId = input.authorId === booking.seekerId ? booking.providerId : booking.seekerId;

    const review: Review = {
      id: this.ids.next('rev'),
      bookingId: booking.id,
      authorId: input.authorId,
      subjectId,
      rating: input.rating,
      publicComment: input.publicComment ?? null,
      privateFeedback: input.privateFeedback ?? null,
      createdAt: this.clock.now(),
    };
    await this.data.reviews.save(review);

    // Eine private Rueckmeldung ist ein Signal fuer das Sicherheitsteam,
    // aber noch kein Vorfall -- sie wird gesondert gesichtet.
    if (input.privateFeedback?.trim()) {
      await this.audit(input.authorId, 'review.private_feedback', 'reviews', review.id, {
        hasPrivateFeedback: true,
      });
    }
    return review;
  }

  /** Problem melden -- immer erreichbar, immer mit klarer Folge. */
  async reportProblem(input: {
    reporterId: Id;
    category: Report['category'];
    description: string;
    subjectUserId?: Id;
    bookingId?: Id;
    conversationId?: Id;
  }): Promise<{ report: Report; incidentId: Id; responseTargetHours: number }> {
    const now = this.clock.now();
    const report: Report = {
      id: this.ids.next('rep'),
      reporterId: input.reporterId,
      subjectUserId: input.subjectUserId ?? null,
      bookingId: input.bookingId ?? null,
      conversationId: input.conversationId ?? null,
      category: input.category,
      description: input.description,
      createdAt: now,
      incidentId: null,
    };
    const incident = incidentFromReport(report, this.ids.next('inc'), now);
    report.incidentId = incident.id;

    await this.data.safety.saveReport(report);
    await this.data.safety.saveIncident(incident);
    await this.audit(input.reporterId, 'report.created', 'reports', report.id, {
      category: report.category,
      priority: incident.priority,
    });

    return { report, incidentId: incident.id, responseTargetHours: RESPONSE_TARGET_HOURS[incident.priority] };
  }
}

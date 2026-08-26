import type {
  ApprovalRequest,
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
import { buildBookingSummary, buildRequestSummary, type ConfirmationSummary } from '../booking/summary';
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
import {
  createApprovalRequest,
  decideApproval,
  findApprover,
  isApprovalOverdue,
  sortForResponsible,
  statusForSeeker,
  withdrawApproval,
} from '../security/approvals';
import type { ApprovalKind } from '../domain/enums';
import { APPROVAL_KIND_LABELS } from '../domain/enums';
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

/**
 * Ergebnis einer Bestaetigung.
 *
 * Steht `approval` darin, ist die Buchung noch nicht bestaetigt: es wartet
 * die Freigabe einer verantwortlichen Person. Das ist ein normaler Zustand
 * und kein Fehler -- deshalb kein geworfener Fehler, sondern ein Feld.
 */
export interface BookingConfirmationResult {
  booking: Booking;
  approval?: ApprovalRequest;
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
   * Legt eine Freigabeanfrage an, wenn fuer diese Handlung eine
   * verantwortliche Person benannt ist. Gibt es keine, passiert nichts --
   * dann entscheidet die Person allein, so wie jeder andere Mensch auch.
   */
  private async requestApproval(
    seekerId: Id,
    kind: ApprovalKind,
    subjectId: Id,
    summary: string,
    easySummary: string,
  ): Promise<ApprovalRequest | undefined> {
    const now = this.clock.now();
    const grants = await this.data.trust.forSeeker(seekerId);
    const grant = findApprover(grants, kind, now);
    if (!grant) return undefined;

    const request = createApprovalRequest(
      {
        id: this.ids.next('appr'),
        seekerId,
        responsibleId: grant.trustedPersonId,
        kind,
        subjectId,
        summary,
        easySummary,
      },
      now,
    );
    await this.data.approvals.save(request);

    // Die Benachrichtigung geht privat an das Geraet der verantwortlichen
    // Person. Die Vorschau nennt nie den Inhalt.
    await this.notify(
      grant.trustedPersonId,
      'booking',
      'Eine Freigabe wartet auf Sie',
      `/verantwortlich/freigaben/${request.id}`,
    );
    await this.audit(seekerId, 'approval.requested', 'approval_requests', request.id, {
      kind,
      responsible: true,
    });
    return request;
  }

  /** Offene und entschiedene Freigaben zu einem Vorgang. */
  async approvalsForSubject(subjectId: Id): Promise<ApprovalRequest[]> {
    return this.data.approvals.forSubject(subjectId);
  }

  /**
   * Was die betroffene Person ueber ihre Freigaben sieht.
   * Es gibt keine Freigabe, von der sie nichts weiss.
   */
  async approvalStatusForSeeker(seekerId: Id): Promise<
    Array<{ request: ApprovalRequest; responsibleName: string } & ReturnType<typeof statusForSeeker>>
  > {
    const now = this.clock.now();
    const eintraege = await this.data.approvals.forSeeker(seekerId);
    const ergebnis = [];
    for (const request of eintraege) {
      const person = await this.data.users.get(request.responsibleId);
      const name = person?.displayName ?? 'Ihre verantwortliche Person';
      ergebnis.push({ request, responsibleName: name, ...statusForSeeker(request, name, now) });
    }
    return ergebnis;
  }

  /** Die betroffene Person zieht ihr eigenes Anliegen zurueck. */
  async withdrawApproval(approvalId: Id, actorId: Id): Promise<ApprovalRequest> {
    const request = await this.data.approvals.get(approvalId);
    if (!request) throw new ServiceError('Freigabe nicht gefunden.', 'approval_not_found');
    const next = withdrawApproval(request, actorId, this.clock.now());
    await this.data.approvals.save(next);
    await this.audit(actorId, 'approval.withdrawn', 'approval_requests', next.id, {});
    return next;
  }

  /**
   * Entscheidung einer verantwortlichen Person.
   *
   * Bei Zustimmung wird der zugehoerige Vorgang freigeschaltet, bei
   * Ablehnung zurueckgenommen. Die betroffene Person wird in beiden Faellen
   * benachrichtigt -- auch bei einer Ablehnung, mit dem Grund.
   */
  async decideApproval(
    approvalId: Id,
    actorId: Id,
    entscheidung: 'approved' | 'declined',
    grund?: string,
  ): Promise<ApprovalRequest> {
    const request = await this.data.approvals.get(approvalId);
    if (!request) throw new ServiceError('Freigabe nicht gefunden.', 'approval_not_found');

    const next = decideApproval(request, {
      status: entscheidung,
      actorId,
      now: this.clock.now(),
      ...(grund ? { reason: grund } : {}),
    });
    await this.data.approvals.save(next);

    if (next.kind === 'support_request') {
      const anfrage = await this.data.requests.get(next.subjectId);
      if (anfrage) {
        await this.data.requests.save({
          ...anfrage,
          status: entscheidung === 'approved' ? 'open' : 'withdrawn',
          updatedAt: this.clock.now(),
        });
      }
    }
    if (next.kind === 'booking' && entscheidung === 'approved') {
      // Die Freigabe ersetzt keine Bestaetigung: die Person bestaetigt
      // weiterhin selbst. Sie kann es jetzt nur eben auch tun.
      await this.notify(next.seekerId, 'booking', 'Sie können den Termin jetzt bestätigen', `/suchen/termine`);
    }

    await this.notify(
      next.seekerId,
      'booking',
      entscheidung === 'approved' ? 'Ihre Anfrage wurde freigegeben' : 'Es gibt eine Antwort zu Ihrer Anfrage',
      '/freigaben',
    );
    await this.audit(actorId, `approval.${entscheidung}`, 'approval_requests', next.id, {
      kind: next.kind,
    });
    return next;
  }

  /**
   * Ueberblick fuer eine verantwortliche Person.
   *
   * Bewusst begrenzt auf das, wofuer die Berechtigung erteilt wurde. Und
   * bewusst nicht heimlich: die betroffene Person sieht in ihrer eigenen App,
   * wer was sehen darf.
   */
  async overviewForResponsible(responsibleId: Id): Promise<{
    klienten: Array<{
      seekerId: Id;
      name: string;
      stufe: 'begleitung' | 'verantwortung';
      freigabepflichten: string[];
      offeneFreigaben: number;
      naechsterTermin: Booking | undefined;
      offeneAnfragen: number;
    }>;
    offeneFreigaben: ApprovalRequest[];
    ueberfaellig: number;
  }> {
    const now = this.clock.now();
    const grants = (await this.data.trust.forTrustedPerson(responsibleId)).filter(
      (g) => !g.revokedAt && (!g.expiresAt || g.expiresAt > now),
    );
    const alleFreigaben = await this.data.approvals.forResponsible(responsibleId);
    const offen = sortForResponsible(alleFreigaben, now);

    const klienten = [];
    for (const grant of grants) {
      const person = await this.data.users.get(grant.seekerId);
      const termine = (await this.data.bookings.forUser(grant.seekerId))
        .filter((b) => b.status === 'confirmed' && b.startsAt > now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const anfragen = await this.data.requests.forSeeker(grant.seekerId);
      klienten.push({
        seekerId: grant.seekerId,
        name: person?.displayName ?? grant.seekerId,
        stufe: grant.responsibilityLevel,
        freigabepflichten: grant.approvalRequired.map((k) => APPROVAL_KIND_LABELS[k].label),
        offeneFreigaben: offen.filter((f) => f.seekerId === grant.seekerId).length,
        naechsterTermin: termine[0],
        offeneAnfragen: anfragen.filter((a) => a.status === 'open' || a.status === 'waiting_approval')
          .length,
      });
    }

    return {
      klienten,
      offeneFreigaben: offen,
      ueberfaellig: offen.filter((f) => isApprovalOverdue(f, now)).length,
    };
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

    // Ist eine verantwortliche Person fuer Anfragen benannt, geht die
    // Anfrage nicht sofort raus, sondern zuerst zur Freigabe.
    const freigabe = await this.requestApproval(
      draft.seekerId,
      'support_request',
      request.id,
      buildRequestSummary(request).plainText,
      buildRequestSummary(request).easyText,
    );
    const gespeichert: SupportRequest = freigabe
      ? { ...request, status: 'waiting_approval' }
      : request;

    await this.data.requests.save(gespeichert);
    await this.audit(draft.seekerId, 'request.submitted', 'support_requests', request.id, {
      categories: request.categoryKeys.length,
      requiresLicensedProfessional: request.requiresLicensedProfessional,
      wartetAufFreigabe: freigabe !== undefined,
    });
    return gespeichert;
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
  async confirmBooking(bookingId: Id, actorId: Id): Promise<BookingConfirmationResult> {
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

      // Ist eine verantwortliche Person fuer Termine benannt, braucht es
      // deren Freigabe. Das ist kein Fehler, sondern ein normaler
      // Zwischenschritt -- deshalb kommt die Buchung unveraendert zurueck.
      const bestehend = (await this.data.approvals.forSubject(booking.id)).find(
        (a) => a.kind === 'booking',
      );
      if (!bestehend || bestehend.status === 'withdrawn') {
        const providerUser = await this.data.users.get(booking.providerId);
        const providerProfile = await this.data.providers.get(booking.providerId);
        const zusammenfassung =
          providerProfile && providerUser
            ? buildBookingSummary(booking, providerProfile, providerUser.displayName)
            : undefined;
        const freigabe = await this.requestApproval(
          booking.seekerId,
          'booking',
          booking.id,
          zusammenfassung?.plainText ?? 'Ein Termin soll verbindlich gebucht werden.',
          zusammenfassung?.easyText ?? 'Ein Termin soll fest gebucht werden.',
        );
        if (freigabe) return { booking, approval: freigabe };
      } else if (bestehend.status === 'pending') {
        return { booking, approval: bestehend };
      } else if (bestehend.status === 'declined') {
        throw new ServiceError(
          `Dieser Termin wurde nicht freigegeben. Begründung: ${bestehend.reason ?? 'keine angegeben'}`,
          'approval_declined',
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
    return { booking };
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

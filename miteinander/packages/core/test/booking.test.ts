import { describe, expect, it } from 'vitest';
import {
  BookingTransitionError,
  canTransition,
  confirmByProvider,
  confirmBySeeker,
  describeCancellation,
  transition,
} from '../src/booking/state-machine';
import { buildBookingSummary, buildRequestSummary, formatDateTimeGerman, formatDuration } from '../src/booking/summary';
import { demoSeed } from '../src/seed/demo-data';
import type { Booking, SupportRequest } from '../src/domain/types';

const NOW = '2026-03-02T09:00:00.000Z';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'book_1',
    requestId: 'req_1',
    seekerId: 'u_seeker_1',
    providerId: 'u_provider_1',
    status: 'proposed',
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 90,
    categoryKeys: ['begleitung_termine'],
    meetingPointDescription: 'Vor dem Eingang des Bürgeramts',
    preciseAddressReleased: false,
    priceCents: 4200,
    volunteer: false,
    cancellationPolicy: 'Bis 24 Stunden vorher kostenlos. Danach die Hälfte.',
    confirmedBySeekerAt: null,
    confirmedByProviderAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('Zustandsautomat', () => {
  it('kennt die erlaubten Übergänge', () => {
    expect(canTransition('proposed', 'confirmed')).toBe(true);
    expect(canTransition('proposed', 'completed')).toBe(false);
    expect(canTransition('cancelled_by_seeker', 'confirmed')).toBe(false);
  });

  it('lässt eine Buchung ohne beide Bestätigungen nicht verbindlich werden', () => {
    const nurEineSeite = confirmBySeeker(booking(), NOW);
    expect(() => transition(nurEineSeite, 'confirmed', { now: NOW, actorId: 'u_seeker_1' })).toThrow(
      BookingTransitionError,
    );
  });

  it('gibt den Treffpunkt erst mit der verbindlichen Buchung frei', () => {
    let b = booking();
    expect(b.preciseAddressReleased).toBe(false);
    b = confirmBySeeker(b, NOW);
    b = confirmByProvider(b, NOW);
    b = transition(b, 'confirmed', { now: NOW, actorId: 'u_seeker_1' });
    expect(b.status).toBe('confirmed');
    expect(b.preciseAddressReleased).toBe(true);
  });

  it('zieht freigegebene Kontaktdaten bei einer Absage wieder ein', () => {
    let b = confirmByProvider(confirmBySeeker(booking(), NOW), NOW);
    b = transition(b, 'confirmed', { now: NOW, actorId: 'u_seeker_1' });
    b = transition(b, 'cancelled_by_seeker', {
      now: NOW,
      actorId: 'u_seeker_1',
      reason: 'Termin verschoben',
    });
    expect(b.preciseAddressReleased).toBe(false);
    expect(b.cancellationReason).toBe('Termin verschoben');
  });

  it('führt einen Termin über in_progress zu completed', () => {
    let b = confirmByProvider(confirmBySeeker(booking(), NOW), NOW);
    b = transition(b, 'confirmed', { now: NOW, actorId: 'u_seeker_1' });
    b = transition(b, 'in_progress', { now: '2026-03-04T10:00:00.000Z', actorId: 'u_provider_1' });
    b = transition(b, 'completed', { now: '2026-03-04T11:30:00.000Z', actorId: 'u_provider_1' });
    expect(b.startedAt).toBe('2026-03-04T10:00:00.000Z');
    expect(b.completedAt).toBe('2026-03-04T11:30:00.000Z');
  });
});

describe('Absage', () => {
  it('erlaubt eine Absage immer und benennt die Kosten ehrlich', () => {
    const frueh = describeCancellation(booking(), '2026-03-01T09:00:00.000Z');
    expect(frueh.allowed).toBe(true);
    expect(frueh.feeCents).toBe(0);

    const spaet = describeCancellation(booking(), '2026-03-04T08:00:00.000Z');
    expect(spaet.allowed).toBe(true);
    expect(spaet.feeCents).toBe(2100);
    expect(spaet.explanation).toContain('21,00 Euro');
    expect(spaet.easyExplanation.length).toBeLessThan(spaet.explanation.length);
  });

  it('berechnet bei ehrenamtlichen Terminen nie etwas', () => {
    const ehrenamt = describeCancellation(
      booking({ volunteer: true, priceCents: 0 }),
      '2026-03-04T09:30:00.000Z',
    );
    expect(ehrenamt.feeCents).toBe(0);
  });
});

describe('Zusammenfassung vor der Bestätigung', () => {
  const profile = demoSeed.providers!.find((p) => p.userId === 'u_provider_1')!;

  it('liefert denselben Inhalt in normaler Sprache, Leichter Sprache und als Vorlese-Text', () => {
    const summary = buildBookingSummary(booking(), profile, 'Meike (Demo)');
    expect(summary.requiresExplicitConfirmation).toBe(true);
    expect(summary.plainText).toContain('Meike (Demo)');
    expect(summary.easyText).toContain('Meike (Demo)');
    expect(summary.speechText).toContain('Meike (Demo)');
    expect(summary.dgsKey).toBe('booking.summary');
  });

  it('nennt Preis, Treffpunkt und Absage-Regel ausdrücklich', () => {
    const summary = buildBookingSummary(booking(), profile, 'Meike (Demo)');
    const labels = summary.lines.map((l) => l.label);
    expect(labels).toContain('Kosten');
    expect(labels).toContain('Treffpunkt');
    expect(labels).toContain('Wenn Sie absagen');
    expect(summary.whatHappensNext.length).toBeGreaterThan(20);
  });

  it('weist bei erlaubnispflichtigen Anfragen auf die eingeschränkte Sichtbarkeit hin', () => {
    const request: SupportRequest = {
      id: 'req_2',
      seekerId: 'u_seeker_1',
      status: 'open',
      categoryKeys: ['pflegerische_unterstuetzung'],
      title: 'Unterstützung',
      description: '',
      importantToMe: [],
      region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
      startsAt: '2026-03-04T10:00:00.000Z',
      durationMinutes: 60,
      recurrence: 'once',
      requiresLicensedProfessional: true,
      preferredCommunicationModes: [],
      languages: ['Deutsch'],
      budgetCentsPerHour: null,
      acceptsVolunteers: false,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const summary = buildRequestSummary(request);
    expect(summary.plainText).toContain('nur geprüfte Fachkräfte');
  });

  it('formatiert Datum und Dauer auf Deutsch', () => {
    expect(formatDateTimeGerman('2026-03-04T10:00:00.000Z')).toBe('Mittwoch, 4. März 2026, 10:00 Uhr');
    expect(formatDuration(90)).toBe('1 Stunde und 30 Minuten');
    expect(formatDuration(45)).toBe('45 Minuten');
    expect(formatDuration(120)).toBe('2 Stunden');
  });
});

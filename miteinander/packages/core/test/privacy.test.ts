import { describe, expect, it } from 'vitest';
import {
  NEVER_BEFORE_BOOKING,
  redactSeekerProfile,
  safeNotificationBody,
  stripSensitive,
  toPublicProviderProfile,
  visibleSeekerFields,
} from '../src/privacy/visibility';
import {
  CONSENT_CATALOG,
  ConsentError,
  grantConsent,
  hasActiveConsent,
  mayProcess,
  missingRequiredConsents,
  revokeConsent,
} from '../src/privacy/consent';
import { RETENTION_RULES, buildDeletionPlan, getRetentionRule } from '../src/privacy/retention';
import { demoSeed } from '../src/seed/demo-data';
import type { Booking } from '../src/domain/types';

const NOW = '2026-03-02T09:00:00.000Z';
const profile = demoSeed.seekers!.find((p) => p.userId === 'u_seeker_1')!;

function booking(status: Booking['status'], released: boolean): Booking {
  return {
    id: 'book_1',
    requestId: 'req_1',
    seekerId: 'u_seeker_1',
    providerId: 'u_provider_1',
    status,
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 90,
    categoryKeys: ['begleitung_termine'],
    meetingPointDescription: 'Vor dem Eingang',
    preciseAddressReleased: released,
    priceCents: 4200,
    volunteer: false,
    cancellationPolicy: 'Bis 24 Stunden vorher kostenlos.',
    confirmedBySeekerAt: NOW,
    confirmedByProviderAt: NOW,
    createdAt: NOW,
  };
}

describe('Sichtbarkeit von Profilangaben', () => {
  it('zeigt einer noch nicht gebuchten Person nie Telefon oder Adresse', () => {
    const fields = visibleSeekerFields(profile, { kind: 'provider_candidate' });
    for (const forbidden of NEVER_BEFORE_BOOKING) {
      expect(fields).not.toContain(forbidden);
    }
    const redacted = redactSeekerProfile(profile, { kind: 'provider_candidate' });
    expect(redacted.phone).toBeUndefined();
    expect(redacted.preciseAddress).toBeUndefined();
    expect(redacted.withheldFields).toContain('phone');
  });

  it('hält auch freiwillige Angaben zurück, die nicht freigegeben wurden', () => {
    const redacted = redactSeekerProfile(profile, { kind: 'provider_candidate' });
    // "supportNeeds" steht nicht in sharedBeforeBooking.
    expect(redacted.supportNeeds).toBeUndefined();
    expect(redacted.withheldFields).toContain('supportNeeds');
    // Freigegeben wurde die Verständigungsform.
    expect(redacted.communicationModes).toBeDefined();
  });

  it('gibt Kontaktdaten erst nach bestätigter Buchung und gesetzter Freigabe heraus', () => {
    const vorher = redactSeekerProfile(profile, {
      kind: 'provider_booked',
      booking: booking('proposed', false),
    });
    expect(vorher.phone).toBeUndefined();

    const nachher = redactSeekerProfile(profile, {
      kind: 'provider_booked',
      booking: booking('confirmed', true),
    });
    expect(nachher.phone).toBeDefined();
    expect(nachher.preciseAddress).toBeDefined();
  });

  it('gibt nach einer Absage nichts mehr heraus, auch wenn die Buchung bestand', () => {
    const abgesagt = redactSeekerProfile(profile, {
      kind: 'provider_booked',
      booking: booking('cancelled_by_seeker', false),
    });
    expect(abgesagt.phone).toBeUndefined();
    expect(abgesagt.preciseAddress).toBeUndefined();
  });

  it('lässt die Verwaltung ohne dokumentierte Freigabe nur das Nötigste sehen', () => {
    const ohne = visibleSeekerFields(profile, { kind: 'admin', hasDocumentedAccess: false });
    expect(ohne).toEqual(['displayName', 'region']);
    const mit = visibleSeekerFields(profile, { kind: 'admin', hasDocumentedAccess: true });
    // Auch mit Freigabe bleiben die besonders sensiblen Bedarfsangaben außen vor.
    expect(mit).not.toContain('supportNeeds');
  });

  it('zeigt öffentlich nichts', () => {
    expect(visibleSeekerFields(profile, { kind: 'public' })).toEqual([]);
  });
});

describe('Anbieterprofil in der öffentlichen Sicht', () => {
  it('zeigt eine ungeprüfte Gebärdensprach-Angabe nicht als Kompetenzstufe', () => {
    const p = demoSeed.providers!.find((x) => x.userId === 'u_provider_1')!;
    const publicProfile = toPublicProviderProfile(p, ['Identitätsprüfung', 'Heilerziehungspfleger:in']);
    expect(publicProfile.signLanguageLevel).toBeUndefined();
    expect(publicProfile.signLanguageClaimUnverified).toBe(true);
  });

  it('zeigt eine geprüfte Angabe mit Stufe', () => {
    const p = demoSeed.providers!.find((x) => x.userId === 'u_provider_2')!;
    const publicProfile = toPublicProviderProfile(p, ['Identitätsprüfung']);
    expect(publicProfile.signLanguageLevel).toBe('native');
    expect(publicProfile.signLanguageClaimUnverified).toBe(false);
  });

  it('macht keine pauschale Vertrauensaussage', () => {
    const p = demoSeed.providers!.find((x) => x.userId === 'u_provider_1')!;
    const publicProfile = toPublicProviderProfile(p, []);
    expect(publicProfile.verificationDisclaimer).toContain('kein allgemeines Versprechen');
  });
});

describe('Benachrichtigungen und Protokolle', () => {
  it('verwendet in der Push-Vorschau nie Inhalte', () => {
    expect(safeNotificationBody('message')).toBe('Sie haben eine neue Nachricht.');
    expect(safeNotificationBody('unbekannt')).not.toContain('undefined');
  });

  it('entfernt sensible Felder aus Protokolldaten', () => {
    const cleaned = stripSensitive({
      bookingId: 'book_1',
      phone: '+49 40 123',
      supportNeeds: ['x'],
      transcript: 'Text',
      durationMinutes: 90,
    });
    expect(cleaned).toEqual({ bookingId: 'book_1', durationMinutes: 90 });
  });
});

describe('Einwilligungen', () => {
  it('bündelt nichts: jeder Zweck steht für sich', () => {
    const purposes = new Set(CONSENT_CATALOG.map((c) => c.purpose));
    expect(purposes.size).toBe(CONSENT_CATALOG.length);
    expect(CONSENT_CATALOG.filter((c) => c.requiredForService).map((c) => c.purpose)).toEqual([
      'terms',
      'privacy',
    ]);
  });

  it('erklärt jeden Zweck auch in Leichter Sprache', () => {
    for (const item of CONSENT_CATALOG) {
      expect(item.easyExplanation.length).toBeGreaterThan(10);
    }
  });

  it('erteilt und widerruft eine Einwilligung', () => {
    const record = grantConsent('u1', 'push_notifications', NOW, { channel: 'tap', id: 'c1' });
    expect(hasActiveConsent([record], 'push_notifications')).toBe(true);
    const revoked = revokeConsent(record, '2026-03-05T09:00:00.000Z');
    expect(hasActiveConsent([revoked], 'push_notifications')).toBe(false);
  });

  it('lässt besonders geschützte Angaben nicht durch die Verwaltung erteilen', () => {
    expect(() =>
      grantConsent('u1', 'sensitive_support_needs', NOW, { channel: 'admin_correction', id: 'c2' }),
    ).toThrow(ConsentError);
  });

  it('erkennt eine veraltete Fassung als ungültig', () => {
    const alt = {
      ...grantConsent('u1', 'privacy', NOW, { channel: 'tap', id: 'c3' }),
      policyVersion: '2024-01-01',
    };
    const decision = mayProcess([alt], 'privacy');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('ältere Fassung');
  });

  it('nennt die noch fehlenden Pflicht-Einwilligungen', () => {
    expect(missingRequiredConsents([])).toEqual(['terms', 'privacy']);
  });
});

describe('Aufbewahrung und Löschung', () => {
  it('hat für jede Datenart eine Frist mit Begründung', () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.reason.length).toBeGreaterThan(10);
      expect(rule.days).toBeGreaterThanOrEqual(0);
    }
  });

  it('löscht sensible Bedarfsangaben sofort nach Widerruf', () => {
    const rule = getRetentionRule('sensitive_support_needs')!;
    expect(rule.days).toBe(0);
    expect(rule.onDeletionRequest).toBe('delete');
  });

  it('sperrt gesetzlich aufzubewahrende Daten, statt sie zu löschen', () => {
    const plan = buildDeletionPlan(NOW);
    const zahlungen = plan.find((p) => p.entity === 'payments')!;
    expect(zahlungen.action).toBe('restrict');
    expect(zahlungen.explanation).toContain('sperren');
  });

  it('nennt für jede Position einen konkreten Zeitpunkt', () => {
    const plan = buildDeletionPlan(NOW);
    expect(plan.length).toBe(RETENTION_RULES.length);
    for (const item of plan) {
      expect(new Date(item.effectiveAt).toString()).not.toBe('Invalid Date');
    }
  });
});

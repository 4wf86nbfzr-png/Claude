import { describe, expect, it } from 'vitest';
import { findMatches, SCORE_WEIGHTS, buildComparison } from '../src/matching/matcher';
import { checkEligibility, canDoLicensedWork, coversAppointment } from '../src/matching/eligibility';
import type { ProviderRecord } from '../src/matching/eligibility';
import { assertNoProtectedSignal, evaluatePreference } from '../src/matching/fairness';
import { blurCoordinates, coarseDistanceLabel, distanceKm } from '../src/matching/geo';
import { demoSeed } from '../src/seed/demo-data';
import type { SupportRequest } from '../src/domain/types';

const TODAY = '2026-03-02';

function records(): ProviderRecord[] {
  return (demoSeed.providers ?? []).map((profile) => ({
    profile,
    services: (demoSeed.services ?? []).filter((s) => s.providerId === profile.userId),
    verifications: (demoSeed.verifications ?? []).filter((v) => v.providerId === profile.userId),
    availability: (demoSeed.availability ?? []).filter((a) => a.providerId === profile.userId),
    absences: (demoSeed.absences ?? []).filter((a) => a.providerId === profile.userId),
  }));
}

function request(overrides: Partial<SupportRequest> = {}): SupportRequest {
  return {
    id: 'req_1',
    seekerId: 'u_seeker_1',
    status: 'open',
    categoryKeys: ['begleitung_termine'],
    title: 'Begleitung zum Amt',
    description: 'Ich möchte zum Bürgeramt begleitet werden.',
    importantToMe: ['Rollator'],
    region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
    // Mittwoch, 4. März 2026, 10:00 UTC
    startsAt: '2026-03-04T10:00:00.000Z',
    durationMinutes: 90,
    recurrence: 'once',
    requiresLicensedProfessional: false,
    preferredCommunicationModes: ['sprechen'],
    languages: ['Deutsch'],
    budgetCentsPerHour: null,
    acceptsVolunteers: true,
    createdAt: '2026-03-02T09:00:00.000Z',
    updatedAt: '2026-03-02T09:00:00.000Z',
    ...overrides,
  };
}

describe('Entfernung', () => {
  it('rechnet Kilometer plausibel', () => {
    const hamburg = { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 };
    const bremen = { postalPrefix: '281', city: 'Bremen', approxLat: 53.08, approxLon: 8.8 };
    expect(distanceKm(hamburg, hamburg)).toBeCloseTo(0, 6);
    expect(distanceKm(hamburg, bremen)).toBeGreaterThan(90);
    expect(distanceKm(hamburg, bremen)).toBeLessThan(110);
  });

  it('zeigt Entfernungen nur grob an', () => {
    expect(coarseDistanceLabel(0.4)).toBe('in Ihrer Nähe');
    expect(coarseDistanceLabel(7)).toBe('etwa 10 km entfernt');
    expect(coarseDistanceLabel(300)).toBe('weiter entfernt');
  });

  it('rundet Koordinaten, damit keine Adresse rekonstruierbar ist', () => {
    const { approxLat, approxLon } = blurCoordinates(53.551234, 9.987654);
    expect(approxLat).toBe(53.55);
    expect(approxLon).toBe(9.99);
  });
});

describe('Harte Ausschlusskriterien', () => {
  it('schlägt nur Personen vor, die die Kategorie anbieten', () => {
    // Dienstag: nur die ehrenamtliche Nachbarschaftshilfe bietet Vorlesen an
    // und hat dienstagvormittags Zeit.
    const result = findMatches(
      request({ categoryKeys: ['vorlesen'], startsAt: '2026-03-03T10:00:00.000Z', durationMinutes: 60 }),
      records(),
      { today: TODAY },
    );
    expect(result.map((r) => r.providerId)).toEqual(['u_provider_3']);
  });

  it('schlägt niemanden vor, der zum Wunschtermin keine Zeit hat', () => {
    // Mittwoch -- diese Person arbeitet nur dienstags und donnerstags.
    const result = findMatches(request({ categoryKeys: ['vorlesen'] }), records(), { today: TODAY });
    expect(result).toHaveLength(0);
  });

  it('zeigt erlaubnispflichtige Anfragen ausschließlich geprüften Fachkräften', () => {
    const req = request({
      categoryKeys: ['pflegerische_unterstuetzung'],
      requiresLicensedProfessional: true,
    });
    const result = findMatches(req, records(), { today: TODAY });
    expect(result).toHaveLength(1);
    expect(result[0]?.providerId).toBe('u_provider_1');
  });

  it('entzieht die Berechtigung, sobald der Fachnachweis abgelaufen ist', () => {
    const all = records();
    const fachkraft = all.find((r) => r.profile.userId === 'u_provider_1')!;
    fachkraft.verifications = fachkraft.verifications.map((v) =>
      v.qualificationKey === 'heilerziehungspflege' ? { ...v, status: 'expired' as const } : v,
    );
    expect(canDoLicensedWork(fachkraft.verifications, TODAY)).toBe(false);

    const req = request({ categoryKeys: ['pflegerische_unterstuetzung'], requiresLicensedProfessional: true });
    expect(findMatches(req, all, { today: TODAY })).toHaveLength(0);
  });

  it('schließt Personen ohne geprüfte Identität aus', () => {
    const all = records();
    const ohneIdent = all.find((r) => r.profile.userId === 'u_provider_3')!;
    ohneIdent.verifications = ohneIdent.verifications.filter((v) => v.qualificationKey !== 'identitaet');
    const result = checkEligibility(request({ categoryKeys: ['vorlesen'] }), ohneIdent, TODAY);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('identitaet_nicht_geprueft');
  });

  it('berücksichtigt Abwesenheiten', () => {
    const all = records();
    const fachkraft = all.find((r) => r.profile.userId === 'u_provider_1')!;
    const req = request({ startsAt: '2026-04-08T10:00:00.000Z' });
    const result = checkEligibility(req, fachkraft, TODAY);
    expect(result.reasons).toContain('abwesend');
  });

  it('prüft, ob das Zeitfenster den Termin vollständig abdeckt', () => {
    const slots = (demoSeed.availability ?? []).filter((a) => a.providerId === 'u_provider_3');
    // Dienstag 9-12 Uhr: 11:00 + 90 Minuten passt nicht mehr hinein.
    expect(coversAppointment(slots, new Date('2026-03-03T10:00:00.000Z'), 60)).toBe(true);
    expect(coversAppointment(slots, new Date('2026-03-03T11:00:00.000Z'), 90)).toBe(false);
  });

  it('respektiert das Budget', () => {
    const req = request({ budgetCentsPerHour: 2000, acceptsVolunteers: false });
    const ids = findMatches(req, records(), { today: TODAY }).map((r) => r.providerId);
    expect(ids).not.toContain('u_provider_1'); // 28 Euro
    expect(ids).not.toContain('u_provider_3'); // ehrenamtlich, aber nicht gewünscht
  });
});

describe('Bewertung und Begründung', () => {
  it('liefert zu jedem Vorschlag nachvollziehbare Gründe', () => {
    const [top] = findMatches(request(), records(), { today: TODAY });
    expect(top).toBeDefined();
    expect(top!.reasons.length).toBeGreaterThan(2);
    for (const reason of top!.reasons) {
      expect(reason.text.length).toBeGreaterThan(5);
      expect(reason.easyText.length).toBeGreaterThan(5);
    }
  });

  it('setzt die Fachkraft mit passender Kompetenz nach oben', () => {
    const result = findMatches(request(), records(), { today: TODAY });
    expect(result[0]?.providerId).toBe('u_provider_1');
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
  });

  it('weist ungeprüfte Gebärdensprach-Angaben ausdrücklich aus', () => {
    const all = records();
    const req = request({ preferredCommunicationModes: ['dgs'], languages: ['Deutsch'] });
    const fachkraft = all.filter((r) => r.profile.userId === 'u_provider_1');
    // Fachkraft gibt DGS "basic" an, hat aber keinen Nachweis.
    fachkraft[0]!.profile = {
      ...fachkraft[0]!.profile,
      communicationModes: [...fachkraft[0]!.profile.communicationModes, 'dgs'],
    };
    const [match] = findMatches(req, fachkraft, { today: TODAY });
    expect(match!.reasons.map((r) => r.code)).toContain('dgs_ungeprueft');
  });

  it('verwendet kein geschütztes Merkmal als Bewertungssignal', () => {
    expect(() => assertNoProtectedSignal(Object.keys(SCORE_WEIGHTS))).not.toThrow();
    expect(() => assertNoProtectedSignal(['naehe', 'herkunft'])).toThrow(/geschützte Merkmale/);
  });

  it('begrenzt die Ergebnisliste', () => {
    expect(findMatches(request(), records(), { today: TODAY, limit: 1 })).toHaveLength(1);
  });
});

describe('Diskriminierungsschutz', () => {
  it('lehnt eine Auswahl nach Herkunft grundsätzlich ab', () => {
    const decision = evaluatePreference({ attribute: 'herkunft', value: 'deutsch' });
    expect(decision.allowed).toBe(false);
    expect(decision.needsManualReview).toBe(false);
  });

  it('lehnt eine Geschlechtspräferenz ohne Körpernähe ab', () => {
    const decision = evaluatePreference({
      attribute: 'geschlecht',
      value: 'weiblich',
      justification: 'Ich hätte das gern so.',
      involvesPersonalCare: false,
    });
    expect(decision.allowed).toBe(false);
  });

  it('lässt eine begründete Geschlechtspräferenz bei Körpernähe zu, markiert sie aber zur Prüfung', () => {
    const decision = evaluatePreference({
      attribute: 'geschlecht',
      value: 'weiblich',
      justification: 'Bei der Körperpflege ist mir eine weibliche Assistenz wichtig.',
      involvesPersonalCare: true,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.needsManualReview).toBe(true);
  });

  it('markiert Vorschläge, wenn eine prüfpflichtige Präferenz im Spiel ist', () => {
    const result = findMatches(request(), records(), {
      today: TODAY,
      preferences: [
        {
          attribute: 'geschlecht',
          value: 'weiblich',
          justification: 'Bei der Körperpflege ist mir das wichtig.',
          involvesPersonalCare: true,
        },
      ],
    });
    expect(result.every((r) => r.needsManualReview)).toBe(true);
  });
});

describe('Vergleich von Vorschlägen', () => {
  it('stellt höchstens drei Vorschläge gegenüber und nennt auch, was nicht angeboten wird', () => {
    const all = records();
    const matches = findMatches(request({ categoryKeys: ['begleitung_termine'] }), all, { today: TODAY });
    const comparison = buildComparison(matches, all);
    expect(comparison.headers.length).toBeLessThanOrEqual(3);
    const labels = comparison.rows.map((r) => r.label);
    expect(labels).toContain('Macht ausdrücklich nicht');
    expect(labels).toContain('Preis');
    expect(labels).toContain('Absage-Regel');
  });
});

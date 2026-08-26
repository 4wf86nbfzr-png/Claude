import { beforeEach, describe, expect, it } from 'vitest';
import {
  ANTWORTFRIST_STUNDEN,
  ApprovalError,
  createApprovalRequest,
  decideApproval,
  findApprover,
  isApprovalOverdue,
  mayEndApprovalAlone,
  needsReminder,
  requiresApproval,
  sortForResponsible,
  statusForSeeker,
  validateGrant,
  withdrawApproval,
} from '../src/security/approvals';
import { createMemoryContext } from '../src/data/memory/memory-context';
import { fixedClock, type DataContext } from '../src/data/repositories';
import { SupportService, createCounterIds } from '../src/services/support-service';
import { createDraft } from '../src/requests/wizard';
import { demoSeed } from '../src/seed/demo-data';
import type { ApprovalRequest, TrustedAccessGrant } from '../src/domain/types';

const NOW = '2026-03-02T09:00:00.000Z';

function grant(overrides: Partial<TrustedAccessGrant> = {}): TrustedAccessGrant {
  return {
    id: 'g1',
    seekerId: 'klient',
    trustedPersonId: 'verantwortlich',
    scopes: ['view_profile'],
    responsibilityLevel: 'verantwortung',
    approvalRequired: ['booking'],
    approvalLegalBasis: 'client_wish',
    courtReference: null,
    createdAt: NOW,
    expiresAt: null,
    revokedAt: null,
    legalBasisNote: null,
    ...overrides,
  };
}

function anfrage(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    ...createApprovalRequest(
      {
        id: 'a1',
        seekerId: 'klient',
        responsibleId: 'verantwortlich',
        kind: 'booking',
        subjectId: 'book_1',
        summary: 'Ein Termin am Donnerstag.',
        easySummary: 'Ein Termin am Donnerstag.',
      },
      NOW,
    ),
    ...overrides,
  };
}

describe('Wann eine Freigabe überhaupt zulässig ist', () => {
  it('lässt eine Begleitung nichts entscheiden', () => {
    expect(() =>
      validateGrant(grant({ responsibilityLevel: 'begleitung', approvalRequired: ['booking'] })),
    ).toThrow(/Begleitung entscheidet nichts/);
  });

  it('verlangt für jede Freigabepflicht eine Grundlage', () => {
    expect(() => validateGrant(grant({ approvalLegalBasis: null }))).toThrow(/Grundlage/);
  });

  it('verlangt beim gerichtlichen Vorbehalt das Aktenzeichen', () => {
    expect(() =>
      validateGrant(grant({ approvalLegalBasis: 'court_ordered', courtReference: '  ' })),
    ).toThrow(/Aktenzeichen/);
    expect(() =>
      validateGrant(grant({ approvalLegalBasis: 'court_ordered', courtReference: '123 XVII 456/25' })),
    ).not.toThrow();
  });

  it('schließt aus, dass jemand sich selbst freigibt', () => {
    expect(() => validateGrant(grant({ trustedPersonId: 'klient' }))).toThrow(/selbst freigeben/);
  });

  it('lässt eine Berechtigung ohne Freigabepflicht anstandslos zu', () => {
    expect(() =>
      validateGrant(
        grant({ responsibilityLevel: 'begleitung', approvalRequired: [], approvalLegalBasis: null }),
      ),
    ).not.toThrow();
  });
});

describe('Wer die Freigabepflicht wieder beenden darf', () => {
  it('lässt die Person eine selbst gewünschte Pflicht allein beenden', () => {
    const ergebnis = mayEndApprovalAlone(grant({ approvalLegalBasis: 'client_wish' }));
    expect(ergebnis.allowed).toBe(true);
  });

  it('lässt einen gerichtlichen Vorbehalt nicht allein beenden', () => {
    const ergebnis = mayEndApprovalAlone(
      grant({ approvalLegalBasis: 'court_ordered', courtReference: '123 XVII 456/25' }),
    );
    expect(ergebnis.allowed).toBe(false);
    expect(ergebnis.reason).toContain('Betreuungsgericht');
  });

  it('behandelt eine reine Begleitung als frei widerrufbar', () => {
    expect(
      mayEndApprovalAlone(grant({ responsibilityLevel: 'begleitung', approvalRequired: [] })).allowed,
    ).toBe(true);
  });
});

describe('Zuständigkeit', () => {
  it('findet die verantwortliche Person zur Handlung', () => {
    expect(findApprover([grant()], 'booking', NOW)?.trustedPersonId).toBe('verantwortlich');
    expect(findApprover([grant()], 'payment', NOW)).toBeUndefined();
  });

  it('ignoriert widerrufene und abgelaufene Berechtigungen', () => {
    expect(requiresApproval([grant({ revokedAt: NOW })], 'booking', NOW)).toBe(false);
    expect(
      requiresApproval([grant({ expiresAt: '2026-01-01T00:00:00.000Z' })], 'booking', NOW),
    ).toBe(false);
  });

  it('verlangt ohne Verantwortungsstufe gar keine Freigabe', () => {
    expect(
      requiresApproval(
        [grant({ responsibilityLevel: 'begleitung', approvalRequired: [] })],
        'booking',
        NOW,
      ),
    ).toBe(false);
  });
});

describe('Entscheidung', () => {
  it('lässt nur die benannte Person entscheiden', () => {
    expect(() =>
      decideApproval(anfrage(), { status: 'approved', actorId: 'jemand_anders', now: NOW }),
    ).toThrow(ApprovalError);
  });

  it('verlangt für eine Ablehnung eine Begründung', () => {
    expect(() =>
      decideApproval(anfrage(), { status: 'declined', actorId: 'verantwortlich', now: NOW }),
    ).toThrow(/Begründung/);
  });

  it('nimmt eine begründete Ablehnung an', () => {
    const entschieden = decideApproval(anfrage(), {
      status: 'declined',
      actorId: 'verantwortlich',
      now: NOW,
      reason: 'An dem Tag ist schon ein Arzttermin.',
    });
    expect(entschieden.status).toBe('declined');
    expect(entschieden.reason).toContain('Arzttermin');
  });

  it('lässt sich nicht zweimal entscheiden', () => {
    const einmal = decideApproval(anfrage(), { status: 'approved', actorId: 'verantwortlich', now: NOW });
    expect(() =>
      decideApproval(einmal, { status: 'declined', actorId: 'verantwortlich', now: NOW, reason: 'x' }),
    ).toThrow(/bereits entschieden/);
  });

  it('lässt die betroffene Person ihr Anliegen zurückziehen', () => {
    const zurueck = withdrawApproval(anfrage(), 'klient', NOW);
    expect(zurueck.status).toBe('withdrawn');
    expect(() => withdrawApproval(anfrage(), 'verantwortlich', NOW)).toThrow(/nur die Person/i);
  });
});

describe('Keine stille Zustimmung durch Zeitablauf', () => {
  const spaeter = '2026-03-04T09:00:00.000Z';

  it('bleibt nach Fristablauf offen -- weder zugestimmt noch abgelehnt', () => {
    const offen = anfrage();
    expect(isApprovalOverdue(offen, spaeter)).toBe(true);
    expect(offen.status).toBe('pending');
  });

  it('erinnert, statt zu entscheiden', () => {
    const offen = anfrage();
    expect(needsReminder(offen, NOW)).toBe(false);
    expect(needsReminder(offen, spaeter)).toBe(true);
    expect(needsReminder({ ...offen, remindedAt: spaeter }, spaeter)).toBe(false);
  });

  it('setzt je Handlung eine eigene Frist', () => {
    expect(ANTWORTFRIST_STUNDEN.booking).toBeLessThan(ANTWORTFRIST_STUNDEN.account_deletion);
    for (const stunden of Object.values(ANTWORTFRIST_STUNDEN)) {
      expect(stunden).toBeGreaterThan(0);
    }
  });

  it('stellt überfällige Fälle nach oben', () => {
    const alt = anfrage({ id: 'alt', respondBy: '2026-03-01T09:00:00.000Z' });
    const neu = anfrage({ id: 'neu', respondBy: '2026-03-09T09:00:00.000Z' });
    expect(sortForResponsible([neu, alt], spaeter).map((a) => a.id)).toEqual(['alt', 'neu']);
  });
});

describe('Was die betroffene Person sieht', () => {
  it('nennt Stand und zuständige Person', () => {
    const sicht = statusForSeeker(anfrage(), 'Frau Naumann (Demo)', NOW);
    expect(sicht.text).toContain('Frau Naumann (Demo)');
    expect(sicht.ton).toBe('info');
  });

  it('nennt bei einer Ablehnung immer den Grund', () => {
    const abgelehnt = decideApproval(anfrage(), {
      status: 'declined',
      actorId: 'verantwortlich',
      now: NOW,
      reason: 'An dem Tag ist schon ein Arzttermin.',
    });
    const sicht = statusForSeeker(abgelehnt, 'Frau Naumann (Demo)', NOW);
    expect(sicht.text).toContain('Arzttermin');
    expect(sicht.easyText).toContain('Arzttermin');
    expect(sicht.ton).toBe('danger');
  });

  it('sagt bei Überfälligkeit, dass erinnert wurde', () => {
    const sicht = statusForSeeker(anfrage(), 'Frau Naumann (Demo)', '2026-03-04T09:00:00.000Z');
    expect(sicht.text).toContain('erinnert');
    expect(sicht.ton).toBe('warning');
  });
});

describe('Durchgehender Ablauf mit verantwortlicher Person', () => {
  let data: DataContext;
  let service: SupportService;

  beforeEach(() => {
    data = createMemoryContext(demoSeed);
    service = new SupportService(data, fixedClock(NOW), createCounterIds());
  });

  function entwurf(seekerId: string) {
    return {
      ...createDraft(`req_${seekerId}`, seekerId, NOW),
      categoryKeys: ['spaziergang'],
      startsAt: '2026-03-03T10:00:00.000Z',
      durationMinutes: 60,
      region: { postalPrefix: '221', city: 'Hamburg', approxLat: 53.55, approxLon: 9.99 },
      importantToMe: [],
    };
  }

  it('hält eine Buchung an, bis die verantwortliche Person zustimmt', async () => {
    // Herr Naumann hat seine Tochter selbst als verantwortlich benannt.
    await data.consents.save({
      id: 'c_naumann_kontakt',
      userId: 'u_seeker_3',
      purpose: 'contact_release',
      granted: true,
      policyVersion: '2026-01-01',
      grantedAt: NOW,
      revokedAt: null,
      channel: 'tap',
      assistedBy: null,
    });
    const request = await service.submitRequest(entwurf('u_seeker_3'));
    // Fuer Anfragen besteht keine Freigabepflicht -- nur fuer Termine.
    expect(request.status).toBe('open');

    const { booking } = await service.proposeBooking({
      requestId: request.id,
      providerId: 'u_provider_3',
      startsAt: '2026-03-03T10:00:00.000Z',
      durationMinutes: 60,
      meetingPointDescription: 'Vor der Haustür',
      priceCents: 0,
    });

    const versuch = await service.confirmBooking(booking.id, 'u_seeker_3');
    expect(versuch.approval).toBeDefined();
    expect(versuch.booking.confirmedBySeekerAt).toBeNull();

    // Die verantwortliche Person wird privat benachrichtigt -- ohne Inhalt.
    const nachrichten = await data.notifications.forUser('u_trusted_2');
    expect(nachrichten.length).toBeGreaterThan(0);
    expect(nachrichten.some((n) => n.body.includes('Spaziergang'))).toBe(false);

    // Herr Naumann sieht, dass etwas offen ist, und bei wem.
    const sicht = await service.approvalStatusForSeeker('u_seeker_3');
    expect(sicht.some((e) => e.responsibleName === 'Frau Naumann (Demo)')).toBe(true);

    // Nach der Zustimmung bestätigt er weiterhin selbst.
    await service.decideApproval(versuch.approval!.id, 'u_trusted_2', 'approved');
    const jetzt = await service.confirmBooking(booking.id, 'u_seeker_3');
    expect(jetzt.approval).toBeUndefined();
    expect(jetzt.booking.confirmedBySeekerAt).not.toBeNull();
  });

  it('nennt bei einer Ablehnung den Grund und bucht nicht', async () => {
    await data.consents.save({
      id: 'c2',
      userId: 'u_seeker_3',
      purpose: 'contact_release',
      granted: true,
      policyVersion: '2026-01-01',
      grantedAt: NOW,
      revokedAt: null,
      channel: 'tap',
      assistedBy: null,
    });
    const request = await service.submitRequest(entwurf('u_seeker_3'));
    const { booking } = await service.proposeBooking({
      requestId: request.id,
      providerId: 'u_provider_3',
      startsAt: '2026-03-03T10:00:00.000Z',
      durationMinutes: 60,
      meetingPointDescription: 'Vor der Haustür',
      priceCents: 0,
    });
    const versuch = await service.confirmBooking(booking.id, 'u_seeker_3');
    await service.decideApproval(
      versuch.approval!.id,
      'u_trusted_2',
      'declined',
      'An dem Tag ist schon ein Arzttermin.',
    );
    await expect(service.confirmBooking(booking.id, 'u_seeker_3')).rejects.toThrow(/Arzttermin/);
  });

  it('lässt Menschen ohne verantwortliche Person allein entscheiden', async () => {
    const request = await service.submitRequest({
      ...entwurf('u_seeker_1'),
      categoryKeys: ['begleitung_termine'],
      startsAt: '2026-03-04T10:00:00.000Z',
      importantToMe: ['Rollator'],
    });
    expect(request.status).toBe('open');
    const { booking } = await service.proposeBooking({
      requestId: request.id,
      providerId: 'u_provider_1',
      startsAt: '2026-03-04T10:00:00.000Z',
      durationMinutes: 60,
      meetingPointDescription: 'Vor dem Eingang',
      priceCents: 2800,
    });
    const versuch = await service.confirmBooking(booking.id, 'u_seeker_1');
    expect(versuch.approval).toBeUndefined();
  });

  it('gibt der verantwortlichen Person nur einen Überblick über ihre Klienten', async () => {
    const uebersicht = await service.overviewForResponsible('u_trusted_2');
    expect(uebersicht.klienten.map((k) => k.seekerId)).toEqual(['u_seeker_3']);
    expect(uebersicht.klienten[0]?.stufe).toBe('verantwortung');
    expect(uebersicht.klienten[0]?.freigabepflichten).toContain('Verbindliche Termine');
    expect(uebersicht.offeneFreigaben.length).toBeGreaterThan(0);

    // Eine Begleitung sieht dieselbe Übersicht, aber ohne Freigabepflichten.
    const begleitung = await service.overviewForResponsible('u_trusted_1');
    expect(begleitung.klienten[0]?.stufe).toBe('begleitung');
    expect(begleitung.klienten[0]?.freigabepflichten).toEqual([]);
    expect(begleitung.offeneFreigaben).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  AuthorizationError,
  evaluateSupportAccess,
  hasPermission,
  isFourEyesSatisfied,
  mayActAsTrustedPerson,
  requirePermission,
  trustedScopesFor,
} from '../src/security/permissions';
import {
  VerificationError,
  decideVerification,
  deriveProviderKind,
  describeVerification,
  expireVerifications,
  expiringSoon,
} from '../src/security/verification';
import {
  incidentFromReport,
  isOverdue,
  transitionIncident,
  triageOrder,
  RESPONSE_TARGET_HOURS,
} from '../src/security/incidents';
import { demoSeed } from '../src/seed/demo-data';
import type { ProviderVerification, Report, User } from '../src/domain/types';

const NOW = '2026-03-02T09:00:00.000Z';
const TODAY = '2026-03-02';

const reviewer: Pick<User, 'roles'> = { roles: ['reviewer'] };
const admin: Pick<User, 'roles'> = { roles: ['admin'] };
const seeker: Pick<User, 'roles'> = { roles: ['support_seeker'] };

describe('Rechte', () => {
  it('trennt die Rollen sauber', () => {
    expect(hasPermission(seeker, 'request.create')).toBe(true);
    expect(hasPermission(seeker, 'verification.decide')).toBe(false);
    expect(hasPermission(reviewer, 'verification.decide')).toBe(true);
    expect(hasPermission(reviewer, 'user.suspend')).toBe(false);
  });

  it('gibt einer Vertrauensperson allein durch die Rolle keine Rechte', () => {
    expect(hasPermission({ roles: ['trusted_person'] }, 'profile.read.own')).toBe(false);
  });

  it('wirft eine klare Fehlermeldung bei fehlender Berechtigung', () => {
    expect(() => requirePermission(seeker, 'audit.read')).toThrow(AuthorizationError);
  });
});

describe('Vier-Augen-Prinzip', () => {
  const approvers = { r1: reviewer, r2: admin, s1: seeker };

  it('verlangt eine zweite Freigabe bei Sperrungen', () => {
    const result = isFourEyesSatisfied(
      { action: 'user.suspend', firstApproverId: 'r2', secondApproverId: null },
      approvers,
    );
    expect(result.ok).toBe(false);
  });

  it('schließt Selbstfreigabe aus', () => {
    const result = isFourEyesSatisfied(
      { action: 'user.suspend', firstApproverId: 'r2', secondApproverId: 'r2' },
      approvers,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('anderen Person');
  });

  it('lässt zwei verschiedene berechtigte Personen zu', () => {
    const result = isFourEyesSatisfied(
      { action: 'verification.decide', firstApproverId: 'r1', secondApproverId: 'r2' },
      approvers,
    );
    expect(result.ok).toBe(true);
  });

  it('weist eine unberechtigte zweite Person ab', () => {
    const result = isFourEyesSatisfied(
      { action: 'verification.decide', firstApproverId: 'r1', secondApproverId: 's1' },
      approvers,
    );
    expect(result.ok).toBe(false);
  });
});

describe('Vertrauenspersonen', () => {
  const grants = demoSeed.trust!;

  it('leitet Rechte nur aus einer aktiven Berechtigung ab', () => {
    expect(trustedScopesFor(grants, 'u_trusted_1', 'u_seeker_1', NOW)).toContain('create_requests');
    expect(mayActAsTrustedPerson(grants, 'u_trusted_1', 'u_seeker_1', 'confirm_bookings', NOW)).toBe(false);
  });

  it('entzieht nach Widerruf sofort alle Rechte', () => {
    const widerrufen = grants.map((g) => ({ ...g, revokedAt: '2026-03-01T00:00:00.000Z' }));
    expect(trustedScopesFor(widerrufen, 'u_trusted_1', 'u_seeker_1', NOW)).toEqual([]);
  });

  it('beachtet ein Ablaufdatum', () => {
    const abgelaufen = grants.map((g) => ({ ...g, expiresAt: '2026-02-01T00:00:00.000Z' }));
    expect(trustedScopesFor(abgelaufen, 'u_trusted_1', 'u_seeker_1', NOW)).toEqual([]);
  });
});

describe('Supportzugriff', () => {
  const agent: Pick<User, 'roles'> = { roles: ['support_agent'] };

  it('verlangt eine Begründung', () => {
    const result = evaluateSupportAccess(agent, {
      agentId: 'a1',
      subjectUserId: 'u1',
      reason: 'kurz',
      approvedBySubject: true,
    });
    expect(result.allowed).toBe(false);
  });

  it('erlaubt keinen Zugriff ohne Freigabe oder dokumentierten Vorfall', () => {
    const result = evaluateSupportAccess(agent, {
      agentId: 'a1',
      subjectUserId: 'u1',
      reason: 'Nutzerin bittet um Hilfe beim Termin.',
      approvedBySubject: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.mustLog).toBe(true);
  });

  it('erlaubt Zugriff mit Freigabe und protokolliert immer', () => {
    const result = evaluateSupportAccess(agent, {
      agentId: 'a1',
      subjectUserId: 'u1',
      reason: 'Nutzerin bittet um Hilfe beim Termin.',
      approvedBySubject: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.mustLog).toBe(true);
  });
});

describe('Nachweise', () => {
  function pending(qualificationKey: string): ProviderVerification {
    return {
      id: 'v1',
      providerId: 'p1',
      qualificationKey,
      status: 'pending',
      submittedAt: NOW,
      decidedAt: null,
      decidedBy: null,
      secondApproverId: null,
      validUntil: null,
      rejectionReason: null,
      documentPath: null,
    };
  }

  it('verlangt für eine Fachqualifikation zwei Augenpaare', () => {
    expect(() =>
      decideVerification(pending('heilerziehungspflege'), 'approved', {
        now: NOW,
        deciderId: 'r1',
        decider: reviewer,
        approvers: { r1: reviewer },
      }),
    ).toThrow(VerificationError);

    const ok = decideVerification(pending('heilerziehungspflege'), 'approved', {
      now: NOW,
      deciderId: 'r1',
      decider: reviewer,
      secondApproverId: 'r2',
      approvers: { r1: reviewer, r2: admin },
    });
    expect(ok.status).toBe('approved');
    expect(ok.secondApproverId).toBe('r2');
  });

  it('verlangt bei ablaufenden Nachweisen ein Gültigkeitsdatum', () => {
    expect(() =>
      decideVerification(pending('erste_hilfe'), 'approved', {
        now: NOW,
        deciderId: 'r1',
        decider: reviewer,
      }),
    ).toThrow(/Gültigkeitsdatum/);
  });

  it('verlangt für eine Ablehnung eine Begründung', () => {
    expect(() =>
      decideVerification(pending('identitaet'), 'rejected', {
        now: NOW,
        deciderId: 'r1',
        decider: reviewer,
      }),
    ).toThrow(/Begründung/);
  });

  it('lässt Unberechtigte nicht entscheiden', () => {
    expect(() =>
      decideVerification(pending('identitaet'), 'approved', {
        now: NOW,
        deciderId: 's1',
        decider: seeker,
      }),
    ).toThrow(/Keine Berechtigung/);
  });

  it('setzt abgelaufene Nachweise automatisch auf abgelaufen', () => {
    const abgelaufen = expireVerifications(
      [{ ...pending('erste_hilfe'), status: 'approved', validUntil: '2026-01-01' }],
      TODAY,
    );
    expect(abgelaufen[0]?.status).toBe('expired');
  });

  it('erkennt bald ablaufende Nachweise', () => {
    const bald = expiringSoon(demoSeed.verifications!, TODAY, 30);
    expect(bald.map((v) => v.id)).toContain('ver_7');
  });

  it('vergibt Titel nur mit gültigem Nachweis', () => {
    const fachkraft = demoSeed.verifications!.filter((v) => v.providerId === 'u_provider_1');
    expect(deriveProviderKind(fachkraft, TODAY)).toBe('professional');

    const ohneFach = fachkraft.map((v) =>
      v.qualificationKey === 'heilerziehungspflege' ? { ...v, status: 'expired' as const } : v,
    );
    expect(deriveProviderKind(ohneFach, TODAY)).toBe('private_helper');
  });

  it('beschreibt jeden Nachweis ehrlich', () => {
    expect(describeVerification({ ...pending('identitaet'), status: 'pending' })).toContain(
      'wird noch geprüft',
    );
    expect(
      describeVerification({ ...pending('erste_hilfe'), status: 'expired' }),
    ).toContain('abgelaufen');
  });
});

describe('Sicherheitsvorfälle', () => {
  function report(category: Report['category']): Report {
    return {
      id: 'rep_1',
      reporterId: 'u_seeker_1',
      subjectUserId: 'u_provider_1',
      bookingId: null,
      conversationId: null,
      category,
      description: 'Sehr persönlicher Freitext, der nicht in Listen auftauchen darf.',
      createdAt: NOW,
      incidentId: null,
    };
  }

  it('stuft Grenzverletzungen sofort als kritisch ein', () => {
    const incident = incidentFromReport(report('grenzverletzung'), 'inc_1', NOW);
    expect(incident.priority).toBe('critical');
    expect(incident.requiresFourEyes).toBe(true);
    expect(RESPONSE_TARGET_HOURS[incident.priority]).toBe(1);
  });

  it('trägt den Freitext der Meldung nicht in die Zusammenfassung', () => {
    const incident = incidentFromReport(report('belaestigung'), 'inc_1', NOW);
    expect(incident.summary).not.toContain('Freitext');
  });

  it('verlangt für die Bearbeitung eine zuständige Person', () => {
    const incident = transitionIncident(incidentFromReport(report('betrug'), 'inc_1', NOW), 'triaged', NOW);
    expect(() => transitionIncident(incident, 'in_progress', NOW)).toThrow(/zuständige Person/);
    const zugewiesen = { ...incident, assignedTo: 'u_admin_1' };
    expect(transitionIncident(zugewiesen, 'in_progress', NOW).status).toBe('in_progress');
  });

  it('erkennt überschrittene Bearbeitungszusagen', () => {
    const incident = incidentFromReport(report('grenzverletzung'), 'inc_1', NOW);
    expect(isOverdue(incident, '2026-03-02T09:30:00.000Z')).toBe(false);
    expect(isOverdue(incident, '2026-03-02T11:00:00.000Z')).toBe(true);
  });

  it('sortiert überfällige und kritische Fälle nach oben', () => {
    const kritisch = incidentFromReport(report('grenzverletzung'), 'inc_1', NOW);
    const klein = { ...incidentFromReport(report('sonstiges'), 'inc_2', NOW), createdAt: '2026-02-01T09:00:00.000Z' };
    const sortiert = triageOrder([kritisch, klein], '2026-03-02T09:30:00.000Z');
    // Der kleine Fall ist überfällig und steht deshalb vorn.
    expect(sortiert[0]?.id).toBe('inc_2');
    expect(sortiert[1]?.id).toBe('inc_1');
  });
});

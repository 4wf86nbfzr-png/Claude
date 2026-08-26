import type {
  ApprovalRequest,
  Id,
  IsoDateTime,
  TrustedAccessGrant,
} from '../domain/types';
import type { ApprovalKind, ApprovalStatus } from '../domain/enums';
import { APPROVAL_KIND_LABELS } from '../domain/enums';

/**
 * Freigaben durch verantwortliche Personen.
 *
 * Das Grundproblem: Eine Freigabepflicht ist ein Eingriff in die
 * Selbstbestimmung eines volljaehrigen Menschen. Rechtlich traegt sie nur in
 * zwei Faellen -- als eigener Wunsch der Person oder als gerichtlich
 * angeordneter Einwilligungsvorbehalt (§ 1825 BGB). Beides wird hier
 * unterschieden und unterschiedlich behandelt.
 *
 * Daraus folgen die Regeln in diesem Modul:
 *  - Keine stille Zustimmung durch Zeitablauf, keine stille Ablehnung.
 *  - Eine Ablehnung braucht eine Begruendung.
 *  - Die betroffene Person sieht jede Freigabeanfrage, die sie betrifft.
 *  - Sie kann ihre eigene Anfrage jederzeit zurueckziehen.
 *  - Eine selbst gewuenschte Freigabepflicht kann sie allein beenden.
 */

/** Standardfrist, bis eine Antwort erwartet wird. */
export const ANTWORTFRIST_STUNDEN: Record<ApprovalKind, number> = {
  support_request: 24,
  booking: 12,
  contact_release: 12,
  payment: 24,
  account_deletion: 72,
};

export class ApprovalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ApprovalError';
  }
}

function isActive(grant: TrustedAccessGrant, now: IsoDateTime): boolean {
  if (grant.revokedAt) return false;
  if (grant.expiresAt && grant.expiresAt <= now) return false;
  return true;
}

/** Alle aktiven Berechtigungen mit Verantwortungsstufe. */
export function responsibleGrants(
  grants: readonly TrustedAccessGrant[],
  now: IsoDateTime,
): TrustedAccessGrant[] {
  return grants.filter((g) => isActive(g, now) && g.responsibilityLevel === 'verantwortung');
}

/**
 * Muss diese Handlung freigegeben werden? Wenn ja: von wem.
 *
 * Gibt es mehrere verantwortliche Personen fuer dieselbe Handlung, wird die
 * erste zustaendig. Alle weiteren werden nur informiert -- zwei Freigaben
 * fuer denselben Vorgang zu verlangen wuerde Menschen ausbremsen, ohne sie
 * besser zu schuetzen.
 */
export function findApprover(
  grants: readonly TrustedAccessGrant[],
  kind: ApprovalKind,
  now: IsoDateTime,
): TrustedAccessGrant | undefined {
  return responsibleGrants(grants, now).find((g) => g.approvalRequired.includes(kind));
}

export function requiresApproval(
  grants: readonly TrustedAccessGrant[],
  kind: ApprovalKind,
  now: IsoDateTime,
): boolean {
  return findApprover(grants, kind, now) !== undefined;
}

/**
 * Darf die unterstuetzungssuchende Person die Freigabepflicht allein beenden?
 *
 * Bei einem eigenen Wunsch: ja, jederzeit und ohne Begruendung. Bei einem
 * gerichtlich angeordneten Einwilligungsvorbehalt: nein -- den hebt nur das
 * Betreuungsgericht auf.
 */
export function mayEndApprovalAlone(grant: TrustedAccessGrant): {
  allowed: boolean;
  reason: string;
} {
  if (grant.responsibilityLevel !== 'verantwortung' || grant.approvalRequired.length === 0) {
    return { allowed: true, reason: 'Es besteht keine Freigabepflicht.' };
  }
  if (grant.approvalLegalBasis === 'court_ordered') {
    return {
      allowed: false,
      reason:
        'Diese Freigabepflicht hat ein Gericht angeordnet. Nur das Betreuungsgericht kann sie aufheben. Sprechen Sie mit Ihrer Betreuerin oder Ihrem Betreuer.',
    };
  }
  return {
    allowed: true,
    reason: 'Sie haben das selbst so gewünscht. Sie können es jederzeit wieder beenden.',
  };
}

/**
 * Prueft eine Berechtigung, bevor sie gespeichert wird.
 *
 * Ohne diese Pruefung koennte eine Freigabepflicht ohne Rechtsgrundlage
 * entstehen -- das waere schlicht eine Bevormundung.
 */
export function validateGrant(grant: TrustedAccessGrant): void {
  if (grant.seekerId === grant.trustedPersonId) {
    throw new ApprovalError('Niemand kann sich selbst freigeben.', 'self_grant');
  }
  if (grant.responsibilityLevel === 'begleitung' && grant.approvalRequired.length > 0) {
    throw new ApprovalError(
      'Eine Begleitung entscheidet nichts. Für Freigaben braucht es die Stufe „Verantwortung".',
      'level_mismatch',
    );
  }
  if (grant.responsibilityLevel === 'verantwortung' && grant.approvalRequired.length > 0) {
    if (!grant.approvalLegalBasis) {
      throw new ApprovalError(
        'Eine Freigabepflicht braucht eine Grundlage: entweder der Wunsch der Person selbst oder ein gerichtlicher Einwilligungsvorbehalt.',
        'legal_basis_missing',
      );
    }
    if (grant.approvalLegalBasis === 'court_ordered' && !grant.courtReference?.trim()) {
      throw new ApprovalError(
        'Bei einem gerichtlichen Einwilligungsvorbehalt muss das Aktenzeichen hinterlegt sein.',
        'court_reference_missing',
      );
    }
  }
}

export interface ApprovalDraft {
  id: Id;
  seekerId: Id;
  responsibleId: Id;
  kind: ApprovalKind;
  subjectId: Id;
  summary: string;
  easySummary: string;
}

export function createApprovalRequest(draft: ApprovalDraft, now: IsoDateTime): ApprovalRequest {
  const frist = ANTWORTFRIST_STUNDEN[draft.kind] * 3_600_000;
  return {
    ...draft,
    status: 'pending',
    createdAt: now,
    respondBy: new Date(new Date(now).getTime() + frist).toISOString(),
    decidedAt: null,
    decidedBy: null,
    reason: null,
    remindedAt: null,
  };
}

export interface ApprovalDecision {
  status: Extract<ApprovalStatus, 'approved' | 'declined'>;
  actorId: Id;
  now: IsoDateTime;
  reason?: string;
}

/**
 * Entscheidung ueber eine Freigabe.
 *
 * Entscheiden darf nur die Person, die dafuer benannt ist. Eine Ablehnung
 * ohne Begruendung wird abgelehnt -- wer eine Entscheidung fuer einen
 * anderen Menschen trifft, schuldet ihm eine Erklaerung.
 */
export function decideApproval(
  request: ApprovalRequest,
  decision: ApprovalDecision,
): ApprovalRequest {
  if (request.status !== 'pending') {
    throw new ApprovalError(
      `Diese Freigabe ist bereits entschieden (${request.status}).`,
      'already_decided',
    );
  }
  if (decision.actorId !== request.responsibleId) {
    throw new ApprovalError(
      'Nur die benannte verantwortliche Person kann diese Freigabe entscheiden.',
      'not_responsible',
    );
  }
  if (decision.actorId === request.seekerId) {
    throw new ApprovalError('Niemand gibt sich selbst frei.', 'self_approval');
  }
  if (decision.status === 'declined' && !decision.reason?.trim()) {
    throw new ApprovalError(
      'Eine Ablehnung braucht eine Begründung. Die Person hat ein Recht darauf zu erfahren, warum.',
      'reason_missing',
    );
  }
  return {
    ...request,
    status: decision.status,
    decidedAt: decision.now,
    decidedBy: decision.actorId,
    reason: decision.reason?.trim() || null,
  };
}

/** Die betroffene Person zieht ihre eigene Anfrage zurueck. Immer moeglich. */
export function withdrawApproval(
  request: ApprovalRequest,
  actorId: Id,
  now: IsoDateTime,
): ApprovalRequest {
  if (actorId !== request.seekerId) {
    throw new ApprovalError(
      'Zurückziehen kann nur die Person, um deren Anliegen es geht.',
      'not_owner',
    );
  }
  if (request.status !== 'pending') {
    throw new ApprovalError('Diese Freigabe ist bereits entschieden.', 'already_decided');
  }
  return { ...request, status: 'withdrawn', decidedAt: now, decidedBy: actorId };
}

/**
 * Ueberfaellig heisst: es wird erinnert. Es heisst NICHT, dass die Handlung
 * automatisch durchgeht oder automatisch scheitert.
 */
export function isApprovalOverdue(request: ApprovalRequest, now: IsoDateTime): boolean {
  return request.status === 'pending' && request.respondBy < now;
}

export function needsReminder(
  request: ApprovalRequest,
  now: IsoDateTime,
  abstandStunden = 12,
): boolean {
  if (!isApprovalOverdue(request, now)) return false;
  if (!request.remindedAt) return true;
  return new Date(now).getTime() - new Date(request.remindedAt).getTime() >= abstandStunden * 3_600_000;
}

/** Offene Freigaben, dringendste zuerst. */
export function sortForResponsible(
  requests: readonly ApprovalRequest[],
  now: IsoDateTime,
): ApprovalRequest[] {
  return [...requests]
    .filter((r) => r.status === 'pending')
    .sort((a, b) => {
      const ueberfaellig = Number(isApprovalOverdue(b, now)) - Number(isApprovalOverdue(a, now));
      if (ueberfaellig !== 0) return ueberfaellig;
      return a.respondBy.localeCompare(b.respondBy);
    });
}

/**
 * Was die betroffene Person ueber eine offene Freigabe zu sehen bekommt.
 * Es gibt keine Freigabe, von der sie nichts weiss.
 */
export function statusForSeeker(
  request: ApprovalRequest,
  responsibleName: string,
  now: IsoDateTime,
): { text: string; easyText: string; ton: 'info' | 'warning' | 'success' | 'danger' } {
  const was = APPROVAL_KIND_LABELS[request.kind].label.toLowerCase();
  switch (request.status) {
    case 'pending':
      return isApprovalOverdue(request, now)
        ? {
            text: `${responsibleName} hat noch nicht geantwortet. Wir haben erinnert. Sie können auch selbst nachfragen.`,
            easyText: `${responsibleName} hat noch nicht geantwortet.\nWir haben schon erinnert.`,
            ton: 'warning',
          }
        : {
            text: `${responsibleName} muss das noch freigeben (${was}). Wir haben Bescheid gesagt.`,
            easyText: `${responsibleName} muss noch Ja sagen.\nWir haben Bescheid gesagt.`,
            ton: 'info',
          };
    case 'approved':
      return {
        text: `${responsibleName} hat zugestimmt. Es geht weiter.`,
        easyText: `${responsibleName} hat Ja gesagt.\nEs geht weiter.`,
        ton: 'success',
      };
    case 'declined':
      return {
        text: `${responsibleName} hat nicht zugestimmt. Begründung: ${request.reason ?? 'keine angegeben'}`,
        easyText: `${responsibleName} hat Nein gesagt.\nDer Grund: ${request.reason ?? 'kein Grund angegeben'}`,
        ton: 'danger',
      };
    case 'withdrawn':
    default:
      return {
        text: 'Sie haben das zurückgezogen.',
        easyText: 'Sie haben das zurückgezogen.',
        ton: 'info',
      };
  }
}

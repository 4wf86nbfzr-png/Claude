import type { Id, TrustedAccessGrant, TrustedScope, User } from '../domain/types';
import type { UserRole } from '../domain/enums';

/**
 * Rollen- und Rechtekonzept.
 *
 * Bewusst als Matrix und nicht als verstreute if-Abfragen: so laesst sich im
 * Test und im Audit auf einen Blick sehen, wer was darf.
 */
export const PERMISSIONS = [
  'profile.read.own',
  'profile.write.own',
  'request.create',
  'request.read.matching',
  'booking.confirm',
  'booking.read.own',
  'message.read.own',
  'message.write.own',
  'payment.manage.own',
  'verification.submit',
  'verification.decide',
  'verification.decide.second',
  'user.suspend',
  'user.suspend.second',
  'incident.read',
  'incident.assign',
  'content.edit',
  'audit.read',
  'support.access.user_data',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  support_seeker: [
    'profile.read.own',
    'profile.write.own',
    'request.create',
    'booking.confirm',
    'booking.read.own',
    'message.read.own',
    'message.write.own',
    'payment.manage.own',
  ],
  provider: [
    'profile.read.own',
    'profile.write.own',
    'request.read.matching',
    'booking.confirm',
    'booking.read.own',
    'message.read.own',
    'message.write.own',
    'payment.manage.own',
    'verification.submit',
  ],
  trusted_person: [],
  reviewer: ['verification.decide', 'verification.decide.second', 'incident.read'],
  support_agent: ['incident.read', 'incident.assign', 'support.access.user_data'],
  admin: [
    'verification.decide',
    'verification.decide.second',
    'user.suspend',
    'user.suspend.second',
    'incident.read',
    'incident.assign',
    'content.edit',
    'audit.read',
  ],
};

/** Handlungen, die zwei verschiedene berechtigte Personen brauchen. */
export const FOUR_EYES_ACTIONS: readonly Permission[] = ['user.suspend', 'verification.decide'];

export function hasPermission(user: Pick<User, 'roles'>, permission: Permission): boolean {
  return user.roles.some((role) => ROLE_PERMISSIONS[role]?.includes(permission));
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function requirePermission(user: Pick<User, 'roles'>, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new AuthorizationError(`Fehlende Berechtigung: ${permission}`);
  }
}

export interface FourEyesDecision {
  action: Permission;
  firstApproverId: Id;
  secondApproverId?: Id | null;
}

/**
 * Vier-Augen-Prinzip. Zwei verschiedene Personen, beide berechtigt.
 * Selbstfreigabe ist ausgeschlossen.
 */
export function isFourEyesSatisfied(
  decision: FourEyesDecision,
  approvers: Record<Id, Pick<User, 'roles'>>,
): { ok: boolean; reason: string } {
  if (!FOUR_EYES_ACTIONS.includes(decision.action)) {
    return { ok: true, reason: 'Für diese Handlung ist kein zweites Augenpaar nötig.' };
  }
  if (!decision.secondApproverId) {
    return { ok: false, reason: 'Es fehlt die Freigabe einer zweiten Person.' };
  }
  if (decision.secondApproverId === decision.firstApproverId) {
    return { ok: false, reason: 'Die zweite Freigabe muss von einer anderen Person kommen.' };
  }
  const first = approvers[decision.firstApproverId];
  const second = approvers[decision.secondApproverId];
  if (!first || !hasPermission(first, decision.action)) {
    return { ok: false, reason: 'Die erste Person ist für diese Handlung nicht berechtigt.' };
  }
  const secondPermission = `${decision.action}.second` as Permission;
  if (!second || !hasPermission(second, secondPermission)) {
    return { ok: false, reason: 'Die zweite Person ist für die Freigabe nicht berechtigt.' };
  }
  return { ok: true, reason: 'Zwei berechtigte Personen haben freigegeben.' };
}

/**
 * Rechte einer Vertrauensperson.
 *
 * Sie leiten sich ausschliesslich aus einer aktiven, nicht widerrufenen
 * Berechtigung ab. Es gibt keinen Weg, sie ueber eine Rolle zu erlangen.
 */
export function trustedScopesFor(
  grants: readonly TrustedAccessGrant[],
  trustedPersonId: Id,
  seekerId: Id,
  now: string,
): TrustedScope[] {
  const active = grants.filter(
    (g) =>
      g.trustedPersonId === trustedPersonId &&
      g.seekerId === seekerId &&
      !g.revokedAt &&
      (!g.expiresAt || g.expiresAt > now),
  );
  return [...new Set(active.flatMap((g) => g.scopes))];
}

export function mayActAsTrustedPerson(
  grants: readonly TrustedAccessGrant[],
  trustedPersonId: Id,
  seekerId: Id,
  scope: TrustedScope,
  now: string,
): boolean {
  return trustedScopesFor(grants, trustedPersonId, seekerId, now).includes(scope);
}

/**
 * Supportzugriff auf Nutzerdaten. Es gibt kein stilles Impersonieren:
 * jeder Zugriff braucht eine dokumentierte Freigabe und wird protokolliert.
 */
export interface SupportAccessRequest {
  agentId: Id;
  subjectUserId: Id;
  reason: string;
  /** Freigabe durch die betroffene Person oder eine dokumentierte Eskalation. */
  approvedBySubject: boolean;
  incidentId?: Id | null;
}

export function evaluateSupportAccess(
  agent: Pick<User, 'roles'>,
  request: SupportAccessRequest,
): { allowed: boolean; reason: string; mustLog: true } {
  if (!hasPermission(agent, 'support.access.user_data')) {
    return { allowed: false, reason: 'Keine Berechtigung für Supportzugriff.', mustLog: true };
  }
  if (request.reason.trim().length < 10) {
    return { allowed: false, reason: 'Es fehlt eine nachvollziehbare Begründung.', mustLog: true };
  }
  if (!request.approvedBySubject && !request.incidentId) {
    return {
      allowed: false,
      reason:
        'Ohne Freigabe der betroffenen Person ist ein Zugriff nur bei einem dokumentierten Sicherheitsvorfall zulässig.',
      mustLog: true,
    };
  }
  return { allowed: true, reason: 'Zugriff freigegeben und protokolliert.', mustLog: true };
}

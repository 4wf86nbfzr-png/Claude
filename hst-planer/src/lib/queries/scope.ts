import 'server-only';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session';

/**
 * Sichtbarkeit je Rolle (Spec 31/79).
 *
 * Die Filter werden in JEDE Abfrage gemischt – ein Mitarbeiter darf nur
 * Events sehen, in denen er eingeteilt ist, ein Partner nur Events mit
 * eigenen Kraeften, ein Kunde nur eigene Auftraege.
 */
export function eventFilter(user: SessionUser): Prisma.EventWhereInput {
  const basis: Prisma.EventWhereInput = { deletedAt: null };
  switch (user.scope) {
    case 'ALLE':
      return basis;
    case 'KUNDE':
      return { ...basis, customerId: user.customerId ?? '__kein_kunde__' };
    case 'PARTNER':
      return { ...basis, assignments: { some: { partnerId: user.partnerId ?? '__kein_partner__', deletedAt: null } } };
    case 'EVENT':
      // Einsatz- und Teamleitung sehen Events, in denen sie selbst stehen.
      return {
        ...basis,
        OR: [
          { operationLeadId: user.employeeId ?? '__keiner__' },
          { assignments: { some: { employeeId: user.employeeId ?? '__keiner__', deletedAt: null } } },
        ],
      };
    default:
      return { ...basis, assignments: { some: { employeeId: user.employeeId ?? '__keiner__', deletedAt: null } } };
  }
}

export function employeeFilter(user: SessionUser): Prisma.EmployeeWhereInput {
  const basis: Prisma.EmployeeWhereInput = { deletedAt: null };
  switch (user.scope) {
    case 'ALLE':
      return basis;
    case 'PARTNER':
      return { ...basis, partnerId: user.partnerId ?? '__kein_partner__' };
    case 'EVENT':
      return basis; // Einsatzleitung braucht die Kontaktdaten ihres Teams
    case 'KUNDE':
      return { ...basis, id: '__keiner__' }; // Kunden sehen keine Personendaten
    default:
      return { ...basis, id: user.employeeId ?? '__keiner__' };
  }
}

/** Interne Notizen sind nie fuer Mitarbeiter, Partner oder Kunden bestimmt. */
export function darfInterneNotizenSehen(user: SessionUser): boolean {
  return ['ADMIN', 'GESCHAEFTSFUEHRUNG', 'DISPOSITION', 'EINSATZLEITUNG'].includes(user.role);
}

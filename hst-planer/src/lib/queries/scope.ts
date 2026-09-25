import 'server-only';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session';
import { can, personenfelder, type Personenfelder } from '../auth/rbac';

/**
 * Sichtbarkeit je Rolle (SecPlan 8).
 *
 * Die Filter werden in JEDE Abfrage gemischt – ein Mitarbeiter darf nur
 * Events sehen, in denen er eingeteilt ist, ein Subunternehmer nur Events
 * mit eigenen Kraeften, ein Kunde nur eigene Auftraege.
 *
 * Fehlt die Zuordnung (kein Mitarbeiterprofil, kein Partner, kein Kunde),
 * faellt der Filter bewusst auf einen unmoeglichen Wert zurueck. Lieber
 * eine leere Liste als versehentlich alles.
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
    case 'EVENT': {
      // SecPlan 8: Einsatz- und Teamleitung sehen ausschliesslich die
      // Kraefte, die auf einem ihrer eigenen Einsaetze stehen – nicht den
      // gesamten Mitarbeiterstamm.
      const ich = user.employeeId ?? '__keiner__';
      return {
        ...basis,
        OR: [
          { id: ich },
          {
            assignments: {
              some: {
                deletedAt: null,
                event: {
                  deletedAt: null,
                  OR: [
                    { operationLeadId: ich },
                    { assignments: { some: { employeeId: ich, deletedAt: null } } },
                  ],
                },
              },
            },
          },
        ],
      };
    }
    case 'KUNDE':
      return { ...basis, id: '__keiner__' }; // Kunden sehen keine Personendaten
    default:
      return { ...basis, id: user.employeeId ?? '__keiner__' };
  }
}

/**
 * Interne Personalnotizen haengen am Recht, nicht an einer Rollenliste –
 * sonst laufen die beiden Stellen irgendwann auseinander.
 */
export function darfInterneNotizenSehen(user: SessionUser): boolean {
  return can(user.role, 'employees.notes');
}

/**
 * Prisma-Auswahl fuer eine Person, die genau die Felder laedt, die diese
 * Rolle sehen darf (SecPlan 8). Was nicht freigegeben ist, wird gar nicht
 * erst aus der Datenbank geholt – nicht nur in der Anzeige versteckt.
 */
export function personenAuswahl(user: SessionUser): Prisma.EmployeeSelect {
  const f: Personenfelder = personenfelder(user.role);
  return {
    id: true,
    personnelNo: f.stammdaten,
    firstName: true,
    lastName: true,
    active: f.stammdaten,
    blocked: f.stammdaten,
    employmentType: f.stammdaten,
    phone: f.kontakt,
    mobile: f.kontakt,
    email: f.kontakt,
    street: f.anschrift,
    zip: f.anschrift,
    city: f.anschrift,
    birthDate: f.anschrift,
    drivingLicence: f.anschrift,
    hourlyRate: f.vertrag,
    blockReason: f.notizen,
    notesInternal: f.notizen,
    infoForEmployee: true,
  };
}

/**
 * Rollen- und Rechtekonzept (SecPlan 7 und 8) sowie Sichtbarkeitsgrenzen.
 *
 * Die Tests hier sind bewusst als Verbote formuliert: interessant ist nicht,
 * dass eine Rolle etwas darf, sondern dass sie das Uebrige gerade nicht darf.
 */
import { describe, expect, it } from 'vitest';
import {
  alleZiele, can, canAny, homeFor, navFor, personenfelder,
  ROLE_PERMISSIONS, ROLES, scopeOf, type Permission, type Role,
} from '@/lib/auth/rbac';
import { darfInterneNotizenSehen, employeeFilter, eventFilter, personenAuswahl } from '@/lib/queries/scope';
import type { SessionUser } from '@/lib/auth/session';

function benutzer(rolle: Role, extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u1', email: 'test@example.org', name: 'Test', role: rolle,
    employeeId: 'm1', partnerId: 'p1', customerId: 'k1', theme: 'light',
    scope: scopeOf(rolle), sessionId: 's1', ...extra,
  };
}

describe('Grundsatz DENY ALL', () => {
  it('jede Rolle ausser Superadmin hat nur ausdrücklich vergebene Rechte', () => {
    const alle = new Set<Permission>(Object.values(ROLE_PERMISSIONS).flat());
    for (const rolle of ROLES) {
      if (rolle === 'SUPERADMIN') continue;
      const eigene = new Set(ROLE_PERMISSIONS[rolle]);
      for (const recht of alle) {
        expect(can(rolle, recht), `${rolle} / ${recht}`).toBe(eigene.has(recht));
      }
    }
  });

  it('Superadmin ist die einzige Rolle mit Vollzugriff', () => {
    const alle = new Set<Permission>(Object.values(ROLE_PERMISSIONS).flat());
    for (const recht of alle) expect(can('SUPERADMIN', recht)).toBe(true);
    expect(can('SUPERADMIN', 'admin.users')).toBe(true);
    // Und niemand sonst verwaltet Benutzer.
    for (const rolle of ROLES) {
      if (rolle === 'SUPERADMIN') continue;
      expect(can(rolle, 'admin.users'), rolle).toBe(false);
    }
  });

  it('die Rechteliste des Superadmins bleibt leer, damit sie niemand kopiert', () => {
    expect(ROLE_PERMISSIONS.SUPERADMIN).toHaveLength(0);
  });
});

describe('Rechte je Rolle', () => {
  it('Disposition plant, sieht aber keine Personalakte', () => {
    expect(can('DISPOSITION', 'events.edit')).toBe(true);
    expect(can('DISPOSITION', 'dispo.assign')).toBe(true);
    expect(can('DISPOSITION', 'reconciliation.close')).toBe(true);
    expect(can('DISPOSITION', 'employees.file')).toBe(false);
    expect(can('DISPOSITION', 'employees.finance')).toBe(false);
    expect(can('DISPOSITION', 'employees.sensitive')).toBe(false);
    expect(can('DISPOSITION', 'finance.view')).toBe(false);
  });

  it('Personal führt Akten, plant aber nicht', () => {
    expect(can('PERSONAL', 'employees.file')).toBe(true);
    expect(can('PERSONAL', 'applicants.edit')).toBe(true);
    expect(can('PERSONAL', 'trainings.edit')).toBe(true);
    expect(can('PERSONAL', 'dispo.edit')).toBe(false);
    expect(can('PERSONAL', 'dispo.assign')).toBe(false);
    expect(can('PERSONAL', 'events.edit')).toBe(false);
  });

  it('Teamleitung sieht zum eigenen Einsatz nur das Nötige (SecPlan 8)', () => {
    expect(can('TEAMLEITUNG', 'events.view')).toBe(true);
    expect(can('TEAMLEITUNG', 'employees.view')).toBe(true);
    expect(can('TEAMLEITUNG', 'qualifications.view')).toBe(true);
    // Ausdrücklich verboten:
    expect(can('TEAMLEITUNG', 'employees.file')).toBe(false);
    expect(can('TEAMLEITUNG', 'employees.finance')).toBe(false);
    expect(can('TEAMLEITUNG', 'employees.notes')).toBe(false);
    expect(can('TEAMLEITUNG', 'employees.sensitive')).toBe(false);
    expect(can('TEAMLEITUNG', 'documents.view')).toBe(false);
  });

  it('besondere Kategorien nach Art. 9 DSGVO bleiben bei ganz wenigen', () => {
    const erlaubt = ROLES.filter((r) => can(r, 'employees.sensitive'));
    expect(erlaubt).toEqual(['SUPERADMIN']);
  });

  it('Mitarbeiter sieht nur den eigenen Bereich', () => {
    expect(can('MITARBEITER', 'self.shifts')).toBe(true);
    expect(can('MITARBEITER', 'employees.view')).toBe(false);
    expect(can('MITARBEITER', 'events.view')).toBe(false);
    expect(can('MITARBEITER', 'timesheets.view')).toBe(false);
  });

  it('Geschäftsführung sieht Finanzen, Compliance und Protokoll – aber keine Benutzerverwaltung', () => {
    expect(can('GESCHAEFTSFUEHRUNG', 'finance.view')).toBe(true);
    expect(can('GESCHAEFTSFUEHRUNG', 'audit.view')).toBe(true);
    expect(can('GESCHAEFTSFUEHRUNG', 'compliance.approve')).toBe(true);
    expect(can('GESCHAEFTSFUEHRUNG', 'admin.users')).toBe(false);
    expect(can('GESCHAEFTSFUEHRUNG', 'admin.api')).toBe(false);
  });

  it('Kunde und Subunternehmer dürfen nichts planen', () => {
    for (const rolle of ['KUNDE', 'SUBUNTERNEHMER'] as const) {
      expect(can(rolle, 'events.edit')).toBe(false);
      expect(can(rolle, 'employees.edit')).toBe(false);
      expect(can(rolle, 'dispo.edit')).toBe(false);
      expect(can(rolle, 'reconciliation.edit')).toBe(false);
      expect(can(rolle, 'compliance.view')).toBe(false);
      expect(can(rolle, 'audit.view')).toBe(false);
    }
  });

  it('das Audit-Log ist für niemanden ausser Superadmin und Geschäftsführung lesbar', () => {
    const erlaubt = ROLES.filter((r) => can(r, 'audit.view'));
    expect(erlaubt.sort()).toEqual(['GESCHAEFTSFUEHRUNG', 'SUPERADMIN']);
  });

  it('canAny prüft mehrere Rechte', () => {
    expect(canAny('TEAMLEITUNG', ['events.edit', 'events.view'])).toBe(true);
    expect(canAny('MITARBEITER', ['events.edit', 'employees.edit'])).toBe(false);
  });
});

describe('Navigation', () => {
  it('folgt der SecPlan-Gliederung', () => {
    const gruppen = navFor('SUPERADMIN').map((g) => g.id);
    expect(gruppen).toEqual([
      'dashboard', 'disposition', 'personal', 'einsaetze',
      'zeiterfassung', 'partner', 'kommunikation', 'compliance', 'administration',
    ]);
  });

  it('lässt keine leeren Gruppen stehen', () => {
    for (const rolle of ROLES) {
      for (const gruppe of navFor(rolle)) {
        expect(gruppe.items.length > 0 || can(rolle, gruppe.permission), `${rolle}/${gruppe.id}`).toBe(true);
      }
    }
  });

  it('zeigt Compliance und Administration nur den dafür berechtigten Rollen', () => {
    for (const rolle of ROLES) {
      const ids = navFor(rolle).map((g) => g.id);
      expect(ids.includes('compliance'), rolle).toBe(can(rolle, 'compliance.view') || can(rolle, 'audit.view'));
      if (!can(rolle, 'admin.view') && !can(rolle, 'settings.view')) {
        expect(ids.includes('administration'), rolle).toBe(false);
      }
    }
  });

  it('jedes erreichbare Ziel ist auch durch ein Recht gedeckt', () => {
    for (const rolle of ROLES) {
      for (const ziel of alleZiele(rolle)) {
        expect(can(rolle, ziel.permission), `${rolle} → ${ziel.href}`).toBe(true);
      }
    }
  });

  it('Mitarbeiter sehen praktisch nur den eigenen Bereich', () => {
    expect(navFor('MITARBEITER').map((g) => g.id)).toEqual(['kommunikation']);
  });

  it('führt Mitarbeiter direkt in die Einsatzliste', () => {
    expect(homeFor('MITARBEITER')).toBe('/meine-einsaetze');
    expect(homeFor('DISPOSITION')).toBe('/dashboard');
  });
});

describe('Feldweise Sichtbarkeit', () => {
  it('Teamleitung bekommt Vertrag, Anschrift und Notizen nicht einmal geladen', () => {
    const auswahl = personenAuswahl(benutzer('TEAMLEITUNG'));
    expect(auswahl.hourlyRate).toBe(false);
    expect(auswahl.street).toBe(false);
    expect(auswahl.birthDate).toBe(false);
    expect(auswahl.notesInternal).toBe(false);
    expect(auswahl.lastName).toBe(true);
  });

  it('Personal sieht die Akte, Disposition die Kontaktdaten', () => {
    expect(personenfelder('PERSONAL').vertrag).toBe(true);
    expect(personenfelder('PERSONAL').anschrift).toBe(true);
    expect(personenfelder('DISPOSITION').kontakt).toBe(true);
    expect(personenfelder('DISPOSITION').vertrag).toBe(false);
    expect(personenfelder('DISPOSITION').anschrift).toBe(false);
  });

  it('Gesundheitsdaten sind für keine Betriebsrolle vorgesehen', () => {
    for (const rolle of ROLES) {
      if (rolle === 'SUPERADMIN') continue;
      expect(personenfelder(rolle).gesundheit, rolle).toBe(false);
    }
  });
});

describe('Sichtbarkeit in Abfragen', () => {
  it('Disposition sieht alle Events', () => {
    expect(eventFilter(benutzer('DISPOSITION'))).toEqual({ deletedAt: null });
  });

  it('Mitarbeiter sieht nur Events mit eigener Zuweisung', () => {
    const filter = eventFilter(benutzer('MITARBEITER'));
    expect(filter.assignments).toEqual({ some: { employeeId: 'm1', deletedAt: null } });
  });

  it('Kunde sieht nur eigene Events', () => {
    expect(eventFilter(benutzer('KUNDE')).customerId).toBe('k1');
  });

  it('Subunternehmer sieht nur Events mit eigenen Kräften', () => {
    const filter = eventFilter(benutzer('SUBUNTERNEHMER'));
    expect(filter.assignments).toEqual({ some: { partnerId: 'p1', deletedAt: null } });
  });

  it('Kunden sehen keine Personendaten', () => {
    expect(employeeFilter(benutzer('KUNDE')).id).toBe('__keiner__');
  });

  it('Mitarbeiter sieht nur das eigene Profil', () => {
    expect(employeeFilter(benutzer('MITARBEITER')).id).toBe('m1');
  });

  it('Subunternehmer sieht nur eigene Kräfte', () => {
    expect(employeeFilter(benutzer('SUBUNTERNEHMER')).partnerId).toBe('p1');
  });

  it('Teamleitung sieht nur Kräfte vom eigenen Einsatz, nicht den ganzen Stamm', () => {
    const filter = employeeFilter(benutzer('TEAMLEITUNG'));
    expect(filter.OR).toBeDefined();
    expect(JSON.stringify(filter)).toContain('operationLeadId');
  });

  it('Interne Notizen bleiben Personal und Geschäftsführung vorbehalten', () => {
    expect(darfInterneNotizenSehen(benutzer('PERSONAL'))).toBe(true);
    expect(darfInterneNotizenSehen(benutzer('GESCHAEFTSFUEHRUNG'))).toBe(true);
    expect(darfInterneNotizenSehen(benutzer('DISPOSITION'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('TEAMLEITUNG'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('MITARBEITER'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('SUBUNTERNEHMER'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('KUNDE'))).toBe(false);
  });

  it('fällt ohne Profilzuordnung auf einen unmöglichen Wert zurück', () => {
    // Ohne diese Absicherung würde ein Benutzer ohne Mitarbeiterprofil alles sehen.
    const ohneProfil = benutzer('MITARBEITER', { employeeId: null });
    expect(eventFilter(ohneProfil).assignments).toEqual({ some: { employeeId: '__keiner__', deletedAt: null } });
  });
});

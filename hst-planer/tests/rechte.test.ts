/**
 * Rollen- und Rechtekonzept (Spec 31) sowie Sichtbarkeitsgrenzen (Spec 79).
 */
import { describe, expect, it } from 'vitest';
import { can, canAny, homeFor, navFor, ROLE_PERMISSIONS, scopeOf, type Role } from '@/lib/auth/rbac';
import { darfInterneNotizenSehen, employeeFilter, eventFilter } from '@/lib/queries/scope';
import type { SessionUser } from '@/lib/auth/session';

function benutzer(rolle: Role, extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'u1', email: 'test@example.org', name: 'Test', role: rolle,
    employeeId: 'm1', partnerId: 'p1', customerId: 'k1', theme: 'light',
    scope: scopeOf(rolle), sessionId: 's1', ...extra,
  };
}

describe('Rechte je Rolle', () => {
  it('Admin darf alles', () => {
    for (const recht of Object.values(ROLE_PERMISSIONS).flat()) {
      expect(can('ADMIN', recht)).toBe(true);
    }
    expect(can('ADMIN', 'admin.users')).toBe(true);
  });

  it('Disposition verwaltet Events und Mitarbeiter, aber keine Benutzer', () => {
    expect(can('DISPOSITION', 'events.edit')).toBe(true);
    expect(can('DISPOSITION', 'employees.edit')).toBe(true);
    expect(can('DISPOSITION', 'reconciliation.close')).toBe(true);
    expect(can('DISPOSITION', 'admin.users')).toBe(false);
    expect(can('DISPOSITION', 'finance.view')).toBe(false);
  });

  it('Mitarbeiter sieht nur die eigenen Einsaetze', () => {
    expect(can('MITARBEITER', 'self.shifts')).toBe(true);
    expect(can('MITARBEITER', 'employees.view')).toBe(false);
    expect(can('MITARBEITER', 'events.view')).toBe(false);
    expect(can('MITARBEITER', 'timesheets.view')).toBe(false);
  });

  it('Geschaeftsfuehrung sieht Finanzen und Protokoll', () => {
    expect(can('GESCHAEFTSFUEHRUNG', 'finance.view')).toBe(true);
    expect(can('GESCHAEFTSFUEHRUNG', 'admin.audit')).toBe(true);
    expect(can('GESCHAEFTSFUEHRUNG', 'admin.users')).toBe(false);
  });

  it('Kunde und Partner duerfen nichts bearbeiten', () => {
    for (const rolle of ['KUNDE', 'PARTNER'] as const) {
      expect(can(rolle, 'events.edit')).toBe(false);
      expect(can(rolle, 'employees.edit')).toBe(false);
      expect(can(rolle, 'dispo.edit')).toBe(false);
      expect(can(rolle, 'reconciliation.edit')).toBe(false);
    }
  });

  it('canAny prueft mehrere Rechte', () => {
    expect(canAny('TEAMLEITUNG', ['events.edit', 'events.view'])).toBe(true);
    expect(canAny('MITARBEITER', ['events.edit', 'employees.edit'])).toBe(false);
  });
});

describe('Navigation', () => {
  it('wird je Rolle gefiltert', () => {
    const dispo = navFor('DISPOSITION').map((n) => n.href);
    expect(dispo).toContain('/disposition');
    expect(dispo).toContain('/abgleiche');
    expect(dispo).not.toContain('/admin');
    expect(dispo).not.toContain('/finanzen');

    expect(navFor('MITARBEITER')).toHaveLength(1); // nur Kommunikation
    expect(navFor('ADMIN').length).toBeGreaterThan(10);
  });

  it('fuehrt Mitarbeiter direkt in die Einsatzliste', () => {
    expect(homeFor('MITARBEITER')).toBe('/meine-einsaetze');
    expect(homeFor('DISPOSITION')).toBe('/dashboard');
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

  it('Partner sieht nur Events mit eigenen Kraeften', () => {
    const filter = eventFilter(benutzer('PARTNER'));
    expect(filter.assignments).toEqual({ some: { partnerId: 'p1', deletedAt: null } });
  });

  it('Kunden sehen keine Personendaten', () => {
    expect(employeeFilter(benutzer('KUNDE')).id).toBe('__keiner__');
  });

  it('Mitarbeiter sieht nur das eigene Profil', () => {
    expect(employeeFilter(benutzer('MITARBEITER')).id).toBe('m1');
  });

  it('Partner sieht nur eigene Kraefte', () => {
    expect(employeeFilter(benutzer('PARTNER')).partnerId).toBe('p1');
  });

  it('Interne Notizen bleiben Disposition und Leitung vorbehalten', () => {
    expect(darfInterneNotizenSehen(benutzer('DISPOSITION'))).toBe(true);
    expect(darfInterneNotizenSehen(benutzer('EINSATZLEITUNG'))).toBe(true);
    expect(darfInterneNotizenSehen(benutzer('MITARBEITER'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('PARTNER'))).toBe(false);
    expect(darfInterneNotizenSehen(benutzer('KUNDE'))).toBe(false);
  });

  it('faellt ohne Profilzuordnung auf einen unmoeglichen Wert zurueck', () => {
    // Ohne diese Absicherung wuerde ein Benutzer ohne Mitarbeiterprofil alles sehen.
    const ohneProfil = benutzer('MITARBEITER', { employeeId: null });
    expect(eventFilter(ohneProfil).assignments).toEqual({ some: { employeeId: '__keiner__', deletedAt: null } });
  });
});

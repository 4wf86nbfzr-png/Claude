/**
 * Rollen- und Rechtekonzept (Spec 31).
 *
 * Rechte sind Zeichenketten der Form "<bereich>.<aktion>".
 * Zusaetzlich gibt es Sichtbarkeits-Bereiche (scope), die in den Abfragen
 * ausgewertet werden: ALLE, EIGENE (nur eigene Einsaetze), PARTNER
 * (nur freigegebene Events des eigenen Partners), KUNDE (nur eigene Auftraege).
 */

export type Role =
  | 'ADMIN' | 'GESCHAEFTSFUEHRUNG' | 'DISPOSITION' | 'EINSATZLEITUNG'
  | 'TEAMLEITUNG' | 'MITARBEITER' | 'PARTNER' | 'KUNDE';

export type Permission =
  | 'dashboard.view'
  | 'dispo.view' | 'dispo.edit'
  | 'calendar.view'
  | 'events.view' | 'events.edit' | 'events.delete'
  | 'employees.view' | 'employees.edit' | 'employees.delete'
  | 'customers.view' | 'customers.edit'
  | 'partners.view' | 'partners.edit'
  | 'requests.view' | 'requests.edit'
  | 'reconciliation.view' | 'reconciliation.edit' | 'reconciliation.close'
  | 'timesheets.view' | 'timesheets.edit' | 'timesheets.approve'
  | 'documents.view' | 'documents.edit'
  | 'communication.view' | 'communication.send'
  | 'reports.view'
  | 'finance.view' | 'finance.edit'
  | 'settings.view' | 'settings.edit'
  | 'admin.view' | 'admin.users' | 'admin.audit' | 'admin.api'
  | 'self.shifts' | 'self.availability' | 'self.documents';

const DISPO: Permission[] = [
  'dashboard.view', 'dispo.view', 'dispo.edit', 'calendar.view',
  'events.view', 'events.edit', 'events.delete',
  'employees.view', 'employees.edit',
  'customers.view', 'customers.edit',
  'partners.view', 'partners.edit',
  'requests.view', 'requests.edit',
  'reconciliation.view', 'reconciliation.edit', 'reconciliation.close',
  'timesheets.view', 'timesheets.edit', 'timesheets.approve',
  'documents.view', 'documents.edit',
  'communication.view', 'communication.send',
  'reports.view',
  'settings.view',
  'self.shifts', 'self.availability', 'self.documents',
];

const EINSATZLEITUNG: Permission[] = [
  'dashboard.view', 'dispo.view', 'calendar.view',
  'events.view', 'employees.view',
  'timesheets.view', 'timesheets.edit',
  'documents.view',
  'communication.view', 'communication.send',
  'self.shifts', 'self.availability', 'self.documents',
];

const TEAMLEITUNG: Permission[] = [
  'dashboard.view', 'calendar.view', 'events.view', 'employees.view',
  'timesheets.view', 'documents.view', 'communication.view',
  'self.shifts', 'self.availability', 'self.documents',
];

const MITARBEITER: Permission[] = ['self.shifts', 'self.availability', 'self.documents', 'communication.view'];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ['*' as unknown as Permission], // Vollzugriff, siehe `can()`
  GESCHAEFTSFUEHRUNG: [
    ...DISPO, 'finance.view', 'finance.edit', 'admin.view', 'admin.audit', 'reports.view',
  ],
  DISPOSITION: DISPO,
  EINSATZLEITUNG,
  TEAMLEITUNG,
  MITARBEITER,
  PARTNER: ['dashboard.view', 'calendar.view', 'events.view', 'employees.view', 'timesheets.view', 'documents.view', 'communication.view'],
  KUNDE: ['dashboard.view', 'events.view', 'documents.view', 'requests.view', 'communication.view'],
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administration',
  GESCHAEFTSFUEHRUNG: 'Geschaeftsfuehrung',
  DISPOSITION: 'Disposition',
  EINSATZLEITUNG: 'Einsatzleitung',
  TEAMLEITUNG: 'Teamleitung',
  MITARBEITER: 'Mitarbeiter',
  PARTNER: 'Partner',
  KUNDE: 'Kunde',
};

export type Scope = 'ALLE' | 'EIGENE' | 'PARTNER' | 'KUNDE' | 'EVENT';

/** Wie weit reicht der Blick dieser Rolle auf Events und Mitarbeiter? */
export function scopeOf(role: Role): Scope {
  switch (role) {
    case 'ADMIN':
    case 'GESCHAEFTSFUEHRUNG':
    case 'DISPOSITION':
      return 'ALLE';
    case 'EINSATZLEITUNG':
    case 'TEAMLEITUNG':
      return 'EVENT';
    case 'PARTNER':
      return 'PARTNER';
    case 'KUNDE':
      return 'KUNDE';
    default:
      return 'EIGENE';
  }
}

export function can(role: Role, permission: Permission): boolean {
  if (role === 'ADMIN') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  icon: string;
  shortcut?: string;
}

/** Hauptnavigation (Spec 6) – wird je Rolle gefiltert. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', permission: 'dashboard.view', icon: 'grid' },
  { href: '/disposition', label: 'Disposition', permission: 'dispo.view', icon: 'board' },
  { href: '/kalender', label: 'Kalender', permission: 'calendar.view', icon: 'calendar', shortcut: 'K' },
  { href: '/events', label: 'Events', permission: 'events.view', icon: 'flag' },
  { href: '/mitarbeiter', label: 'Mitarbeiter', permission: 'employees.view', icon: 'users', shortcut: 'E' },
  { href: '/kunden', label: 'Kunden', permission: 'customers.view', icon: 'briefcase' },
  { href: '/partner', label: 'Partner', permission: 'partners.view', icon: 'handshake' },
  { href: '/anfragen', label: 'Anfragen', permission: 'requests.view', icon: 'inbox' },
  { href: '/abgleiche', label: 'Abgleiche', permission: 'reconciliation.view', icon: 'compare', shortcut: 'A' },
  { href: '/zeiterfassung', label: 'Zeiterfassung', permission: 'timesheets.view', icon: 'clock' },
  { href: '/dokumente', label: 'Dokumente', permission: 'documents.view', icon: 'file' },
  { href: '/kommunikation', label: 'Kommunikation', permission: 'communication.view', icon: 'chat' },
  { href: '/auswertungen', label: 'Auswertungen', permission: 'reports.view', icon: 'chart' },
  { href: '/finanzen', label: 'Finanzen', permission: 'finance.view', icon: 'euro' },
  { href: '/einstellungen', label: 'Einstellungen', permission: 'settings.view', icon: 'settings' },
  { href: '/admin', label: 'Admin', permission: 'admin.view', icon: 'shield' },
];

/**
 * Eigener Bereich – erscheint zusaetzlich zur Hauptnavigation fuer alle, die
 * ein Mitarbeiterprofil haben. Mitarbeiter sehen praktisch nur diesen Teil.
 */
export const EIGENE_NAV: NavItem[] = [
  { href: '/meine-einsaetze', label: 'Meine Einsaetze', permission: 'self.shifts', icon: 'calendar' },
  { href: '/meine-verfuegbarkeit', label: 'Meine Verfuegbarkeit', permission: 'self.availability', icon: 'clock' },
  { href: '/meine-dokumente', label: 'Meine Dokumente', permission: 'self.documents', icon: 'file' },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => can(role, item.permission));
}

export function eigeneNavFor(role: Role, hatMitarbeiterprofil: boolean): NavItem[] {
  if (!hatMitarbeiterprofil) return [];
  return EIGENE_NAV.filter((item) => can(role, item.permission));
}

/** Startseite je Rolle – Mitarbeiter landen direkt in ihrer Einsatzliste. */
export function homeFor(role: Role): string {
  if (role === 'MITARBEITER') return '/meine-einsaetze';
  if (can(role, 'dashboard.view')) return '/dashboard';
  return '/meine-einsaetze';
}

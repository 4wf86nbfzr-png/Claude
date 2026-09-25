/**
 * Rollen- und Rechtekonzept (SecPlan 7 und 8).
 *
 * Grundsatz: DENY ALL. Eine Rolle kann nur das, was in ROLE_PERMISSIONS
 * ausdruecklich aufgezaehlt ist. Es gibt keine Vererbung und keinen
 * Platzhalter – die einzige Ausnahme ist SUPERADMIN, und die steht als
 * eigener Zweig in `can()`, damit sie beim Lesen nicht zu uebersehen ist.
 *
 * Rechte sind Zeichenketten der Form "<bereich>.<aktion>".
 * Zusaetzlich gibt es Sichtbarkeits-Bereiche (scope), die in den Abfragen
 * ausgewertet werden: ALLE, EIGENE (nur eigene Einsaetze), PARTNER
 * (nur freigegebene Events des eigenen Partners), KUNDE (nur eigene
 * Auftraege), EVENT (nur die Einsaetze, auf denen man selbst steht).
 */

export type Role =
  | 'SUPERADMIN'
  | 'GESCHAEFTSFUEHRUNG'
  | 'PERSONAL'
  | 'DISPOSITION'
  | 'EINSATZLEITUNG'
  | 'TEAMLEITUNG'
  | 'MITARBEITER'
  | 'KUNDE'
  | 'SUBUNTERNEHMER';

export const ROLES: readonly Role[] = [
  'SUPERADMIN', 'GESCHAEFTSFUEHRUNG', 'PERSONAL', 'DISPOSITION',
  'EINSATZLEITUNG', 'TEAMLEITUNG', 'MITARBEITER', 'KUNDE', 'SUBUNTERNEHMER',
] as const;

export type Permission =
  // Dashboard
  | 'dashboard.view'
  // Disposition
  | 'dispo.view' | 'dispo.edit' | 'dispo.assign'
  | 'calendar.view'
  // Personal
  | 'employees.view' | 'employees.edit' | 'employees.delete'
  | 'employees.file'            // vollstaendige Personalakte
  | 'employees.finance'         // Stundensatz, Bankdaten, Vertrag
  | 'employees.notes'           // interne Personalnotizen
  | 'employees.sensitive'       // besondere Kategorien, Art. 9 DSGVO
  | 'applicants.view' | 'applicants.edit'
  | 'qualifications.view' | 'qualifications.edit'
  | 'availability.view' | 'availability.edit'
  | 'trainings.view' | 'trainings.edit'
  // Einsaetze
  | 'events.view' | 'events.edit' | 'events.delete'
  | 'objects.view' | 'objects.edit'
  | 'customers.view' | 'customers.edit'
  | 'requests.view' | 'requests.edit'
  | 'reconciliation.view' | 'reconciliation.edit' | 'reconciliation.close'
  // Zeiterfassung
  | 'timesheets.view' | 'timesheets.edit' | 'timesheets.approve'
  // Partner
  | 'partners.view' | 'partners.edit'
  // Dokumente
  | 'documents.view' | 'documents.edit' | 'documents.download'
  // Kommunikation
  | 'communication.view' | 'communication.send'
  // Auswertung und Finanzen
  | 'reports.view'
  | 'finance.view' | 'finance.edit'
  | 'export.run'
  // Compliance
  | 'compliance.view' | 'compliance.edit' | 'compliance.approve'
  | 'compliance.requests' | 'compliance.breaches'
  | 'audit.view'
  | 'security.check'
  // Administration
  | 'settings.view' | 'settings.edit'
  | 'admin.view' | 'admin.users' | 'admin.roles' | 'admin.api' | 'admin.logs'
  // Eigener Bereich
  | 'self.shifts' | 'self.availability' | 'self.documents' | 'self.timesheets';

/** Eigener Bereich – hat jede Rolle mit Mitarbeiterprofil. */
const SELBST: Permission[] = [
  'self.shifts', 'self.availability', 'self.documents', 'self.timesheets',
];

const PERSONAL: Permission[] = [
  'dashboard.view', 'calendar.view',
  'employees.view', 'employees.edit', 'employees.file',
  'employees.finance', 'employees.notes',
  'applicants.view', 'applicants.edit',
  'qualifications.view', 'qualifications.edit',
  'availability.view', 'availability.edit',
  'trainings.view', 'trainings.edit',
  'documents.view', 'documents.edit', 'documents.download',
  'events.view', 'timesheets.view',
  'communication.view', 'communication.send',
  'reports.view', 'export.run',
  ...SELBST,
];

const DISPOSITION: Permission[] = [
  'dashboard.view', 'dispo.view', 'dispo.edit', 'dispo.assign', 'calendar.view',
  'events.view', 'events.edit', 'events.delete',
  'objects.view', 'objects.edit',
  'employees.view',
  'qualifications.view', 'availability.view', 'availability.edit',
  'trainings.view',
  'customers.view', 'customers.edit',
  'partners.view', 'partners.edit',
  'requests.view', 'requests.edit',
  'reconciliation.view', 'reconciliation.edit', 'reconciliation.close',
  'timesheets.view', 'timesheets.edit', 'timesheets.approve',
  'documents.view', 'documents.edit', 'documents.download',
  'communication.view', 'communication.send',
  'reports.view', 'export.run',
  'settings.view',
  ...SELBST,
];

const EINSATZLEITUNG: Permission[] = [
  'dashboard.view', 'dispo.view', 'dispo.assign', 'calendar.view',
  'events.view', 'events.edit',
  'objects.view',
  'employees.view', 'qualifications.view', 'availability.view',
  'timesheets.view', 'timesheets.edit',
  'documents.view', 'documents.download',
  'requests.view',
  'communication.view', 'communication.send',
  ...SELBST,
];

/**
 * Teamleitung (SecPlan 8): sieht zum eigenen Einsatz Name, Funktion,
 * Einsatzzeit, Einsatzort und die notwendige Qualifikation – sonst nichts.
 * Ausdruecklich NICHT: Bankdaten, vollstaendige Personalakte, private
 * Anschrift, Arbeitsvertrag, Gesundheitsdaten, interne Personalnotizen.
 * Deshalb fehlen hier employees.file, employees.finance, employees.notes
 * und employees.sensitive – und zwar bewusst.
 */
const TEAMLEITUNG: Permission[] = [
  'dashboard.view', 'calendar.view',
  'events.view',
  'employees.view', 'qualifications.view',
  'timesheets.view', 'timesheets.edit',
  'communication.view', 'communication.send',
  ...SELBST,
];

const MITARBEITER: Permission[] = ['communication.view', ...SELBST];

const KUNDE: Permission[] = [
  'dashboard.view', 'events.view', 'requests.view', 'requests.edit',
  'documents.view', 'communication.view', 'communication.send',
];

const SUBUNTERNEHMER: Permission[] = [
  'dashboard.view', 'calendar.view', 'events.view',
  'employees.view', 'timesheets.view', 'timesheets.edit',
  'documents.view', 'communication.view', 'communication.send',
];

const GESCHAEFTSFUEHRUNG: Permission[] = [
  ...new Set<Permission>([
    ...DISPOSITION, ...PERSONAL,
    'employees.delete',
    'finance.view', 'finance.edit',
    'compliance.view', 'compliance.edit', 'compliance.approve',
    'compliance.requests', 'compliance.breaches',
    'audit.view', 'security.check',
    'admin.view', 'admin.logs',
  ]),
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // SUPERADMIN wird in can() gesondert behandelt; die Liste bleibt leer,
  // damit niemand sie versehentlich als Vorlage kopiert.
  SUPERADMIN: [],
  GESCHAEFTSFUEHRUNG,
  PERSONAL,
  DISPOSITION,
  EINSATZLEITUNG,
  TEAMLEITUNG,
  MITARBEITER,
  KUNDE,
  SUBUNTERNEHMER,
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPERADMIN: 'Superadmin',
  GESCHAEFTSFUEHRUNG: 'Geschäftsführung',
  PERSONAL: 'Personal',
  DISPOSITION: 'Disposition',
  EINSATZLEITUNG: 'Einsatzleitung',
  TEAMLEITUNG: 'Teamleitung',
  MITARBEITER: 'Mitarbeiter',
  KUNDE: 'Kunde',
  SUBUNTERNEHMER: 'Subunternehmer',
};

export const ROLE_BESCHREIBUNG: Record<Role, string> = {
  SUPERADMIN: 'Technischer Vollzugriff einschließlich Benutzerverwaltung und Protokollen. Nur für wenige benannte Personen.',
  GESCHAEFTSFUEHRUNG: 'Gesamtsicht auf Betrieb, Auswertungen, Finanzen und die Compliance-Zentrale.',
  PERSONAL: 'Personalakten, Bewerber, Qualifikationen, Schulungen und Dokumente. Kein Zugriff auf die Disposition.',
  DISPOSITION: 'Planung: Einsätze, Objekte, Zuordnung, Zeiterfassung, Kunden und Partner. Sieht keine Personalakten.',
  EINSATZLEITUNG: 'Führt Einsätze vor Ort. Sieht die eigenen Einsätze samt Besetzung und pflegt Zeiten nach.',
  TEAMLEITUNG: 'Sieht zum eigenen Einsatz Name, Funktion, Zeit, Ort und die nötige Qualifikation. Sonst nichts.',
  MITARBEITER: 'Eigene Einsätze, eigene Verfügbarkeit, eigene Dokumente und Stunden.',
  KUNDE: 'Eigene Aufträge, eigene Anfragen und die dazu freigegebenen Unterlagen.',
  SUBUNTERNEHMER: 'Nur die freigegebenen Einsätze des eigenen Unternehmens und die dafür gemeldeten Kräfte.',
};

export type Scope = 'ALLE' | 'EIGENE' | 'PARTNER' | 'KUNDE' | 'EVENT';

/** Wie weit reicht der Blick dieser Rolle auf Events und Mitarbeiter? */
export function scopeOf(role: Role): Scope {
  switch (role) {
    case 'SUPERADMIN':
    case 'GESCHAEFTSFUEHRUNG':
    case 'PERSONAL':
    case 'DISPOSITION':
      return 'ALLE';
    case 'EINSATZLEITUNG':
    case 'TEAMLEITUNG':
      return 'EVENT';
    case 'SUBUNTERNEHMER':
      return 'PARTNER';
    case 'KUNDE':
      return 'KUNDE';
    default:
      return 'EIGENE';
  }
}

export function can(role: Role, permission: Permission): boolean {
  if (role === 'SUPERADMIN') return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAny(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function canAll(role: Role, permissions: readonly Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

// ------------------------------------------------------------------ Navigation

export interface NavItem {
  href: string;
  label: string;
  permission: Permission;
  /** Zusaetzliche Rechte – eines davon genuegt zusammen mit `permission`. */
  shortcut?: string;
}

export interface NavGruppe {
  id: string;
  label: string;
  icon: string;
  /** Ziel beim Klick auf die Gruppe selbst. */
  href: string;
  permission: Permission;
  items: NavItem[];
}

/**
 * Hauptnavigation nach SecPlan 2. Die Gruppenreihenfolge ist die
 * Arbeitsreihenfolge einer Disposition: erst der Tag, dann die Leute,
 * dann die Einsaetze, dann die Abrechnung.
 */
export const NAV_GRUPPEN: NavGruppe[] = [
  {
    id: 'dashboard', label: 'Dashboard', icon: 'grid',
    href: '/dashboard', permission: 'dashboard.view', items: [],
  },
  {
    id: 'disposition', label: 'Disposition', icon: 'board',
    href: '/disposition', permission: 'dispo.view',
    items: [
      { href: '/kalender', label: 'Kalender', permission: 'calendar.view', shortcut: 'K' },
      { href: '/disposition', label: 'Tagesplanung', permission: 'dispo.view', shortcut: 'T' },
      { href: '/disposition/woche', label: 'Wochenplanung', permission: 'dispo.view' },
      { href: '/disposition/offene-positionen', label: 'Offene Positionen', permission: 'dispo.view' },
      { href: '/disposition/unbesetzt', label: 'Unbesetzte Schichten', permission: 'dispo.view' },
      { href: '/disposition/zuordnung', label: 'Mitarbeiterzuordnung', permission: 'dispo.assign' },
    ],
  },
  {
    id: 'personal', label: 'Personal', icon: 'users',
    href: '/mitarbeiter', permission: 'employees.view',
    items: [
      { href: '/mitarbeiter', label: 'Mitarbeiter', permission: 'employees.view', shortcut: 'E' },
      { href: '/bewerber', label: 'Bewerber', permission: 'applicants.view' },
      { href: '/mitarbeiterakten', label: 'Mitarbeiterakten', permission: 'employees.file' },
      { href: '/qualifikationen', label: 'Qualifikationen', permission: 'qualifications.view' },
      { href: '/dokumente', label: 'Dokumente', permission: 'documents.view' },
      { href: '/verfuegbarkeiten', label: 'Verfügbarkeiten', permission: 'availability.view' },
      { href: '/schulungen', label: 'Schulungen', permission: 'trainings.view' },
    ],
  },
  {
    id: 'einsaetze', label: 'Einsätze', icon: 'flag',
    href: '/events', permission: 'events.view',
    items: [
      { href: '/events', label: 'Veranstaltungen', permission: 'events.view' },
      { href: '/objekte', label: 'Objekte', permission: 'objects.view' },
      { href: '/kunden', label: 'Kunden', permission: 'customers.view' },
      { href: '/einsatzorte', label: 'Einsatzorte', permission: 'events.view' },
      { href: '/teamleiter', label: 'Teamleiter', permission: 'events.view' },
      { href: '/einsatzhistorie', label: 'Einsatzhistorie', permission: 'events.view' },
    ],
  },
  {
    id: 'zeiterfassung', label: 'Zeiterfassung', icon: 'clock',
    href: '/zeiterfassung', permission: 'timesheets.view',
    items: [
      { href: '/zeiterfassung', label: 'Stundenzettel', permission: 'timesheets.view' },
      { href: '/zeiterfassung/arbeitszeiten', label: 'Arbeitszeiten', permission: 'timesheets.view' },
      { href: '/zeiterfassung/korrekturen', label: 'Korrekturen', permission: 'timesheets.edit' },
      { href: '/zeiterfassung/freigaben', label: 'Freigaben', permission: 'timesheets.approve' },
    ],
  },
  {
    id: 'partner', label: 'Partner', icon: 'handshake',
    href: '/partner', permission: 'partners.view',
    items: [
      { href: '/partner', label: 'Subunternehmer', permission: 'partners.view' },
      { href: '/partner/unternehmen', label: 'Partnerunternehmen', permission: 'partners.view' },
      { href: '/partner/mitarbeiter', label: 'Partner-Mitarbeiter', permission: 'partners.view' },
      { href: '/partner/einsaetze', label: 'Partner-Einsätze', permission: 'partners.view' },
    ],
  },
  {
    id: 'kommunikation', label: 'Kommunikation', icon: 'chat',
    href: '/kommunikation', permission: 'communication.view',
    items: [
      { href: '/kommunikation', label: 'Nachrichten', permission: 'communication.view' },
      { href: '/kommunikation/email', label: 'E-Mail', permission: 'communication.view' },
      { href: '/kommunikation/whatsapp', label: 'WhatsApp-Eingänge', permission: 'communication.view' },
      { href: '/kommunikation/intern', label: 'Interne Kommunikation', permission: 'communication.view' },
    ],
  },
  {
    id: 'compliance', label: 'Compliance', icon: 'shield',
    href: '/compliance', permission: 'compliance.view',
    items: [
      { href: '/compliance/datenschutz', label: 'Datenschutz', permission: 'compliance.view' },
      { href: '/compliance/tom', label: 'TOM', permission: 'compliance.view' },
      { href: '/compliance/avv', label: 'AVV', permission: 'compliance.view' },
      { href: '/compliance/loeschfristen', label: 'Löschfristen', permission: 'compliance.view' },
      { href: '/compliance/audit-log', label: 'Audit-Log', permission: 'audit.view' },
      { href: '/compliance/vorfaelle', label: 'Datenschutzvorfälle', permission: 'compliance.breaches' },
      { href: '/compliance/dsfa', label: 'DSFA', permission: 'compliance.view' },
      { href: '/compliance/dokumentation', label: 'Dokumentation', permission: 'compliance.view' },
    ],
  },
  {
    id: 'administration', label: 'Administration', icon: 'settings',
    href: '/admin', permission: 'admin.view',
    items: [
      { href: '/admin/benutzer', label: 'Benutzer', permission: 'admin.users' },
      { href: '/admin/rollen', label: 'Rollen', permission: 'admin.roles' },
      { href: '/admin/berechtigungen', label: 'Berechtigungen', permission: 'admin.roles' },
      { href: '/einstellungen', label: 'Systemeinstellungen', permission: 'settings.view' },
      { href: '/admin/schnittstellen', label: 'Schnittstellen', permission: 'admin.api' },
      { href: '/admin/protokoll', label: 'Protokolle', permission: 'admin.logs' },
    ],
  },
];

/**
 * Eigener Bereich – erscheint zusaetzlich fuer alle, die ein
 * Mitarbeiterprofil haben. Mitarbeiter sehen praktisch nur diesen Teil.
 */
export const EIGENE_NAV: NavItem[] = [
  { href: '/meine-einsaetze', label: 'Meine Einsätze', permission: 'self.shifts' },
  { href: '/meine-verfuegbarkeit', label: 'Meine Verfügbarkeit', permission: 'self.availability' },
  { href: '/meine-zeiten', label: 'Meine Stunden', permission: 'self.timesheets' },
  { href: '/meine-dokumente', label: 'Meine Dokumente', permission: 'self.documents' },
];

/**
 * Navigation fuer eine Rolle. Eine Gruppe faellt weg, sobald weder ihr
 * eigenes Recht noch eines ihrer Unterpunkte greift – so entstehen keine
 * leeren Ueberschriften.
 */
export function navFor(role: Role): NavGruppe[] {
  return NAV_GRUPPEN.map((gruppe) => ({
    ...gruppe,
    items: gruppe.items.filter((item) => can(role, item.permission)),
  })).filter((gruppe) => can(role, gruppe.permission) || gruppe.items.length > 0);
}

export function eigeneNavFor(role: Role, hatMitarbeiterprofil: boolean): NavItem[] {
  if (!hatMitarbeiterprofil) return [];
  return EIGENE_NAV.filter((item) => can(role, item.permission));
}

/** Flache Liste aller erreichbaren Ziele – fuer Suche und Tests. */
export function alleZiele(role: Role): NavItem[] {
  const aus: NavItem[] = [];
  for (const gruppe of navFor(role)) {
    if (gruppe.items.length === 0 && can(role, gruppe.permission)) {
      aus.push({ href: gruppe.href, label: gruppe.label, permission: gruppe.permission });
    }
    aus.push(...gruppe.items);
  }
  return aus;
}

/** Startseite je Rolle – Mitarbeiter landen direkt in ihrer Einsatzliste. */
export function homeFor(role: Role): string {
  if (role === 'MITARBEITER') return '/meine-einsaetze';
  if (can(role, 'dashboard.view')) return '/dashboard';
  return '/meine-einsaetze';
}

// ------------------------------------------------- Feldweise Sichtbarkeit

/**
 * Welche Felder einer Person darf diese Rolle sehen (SecPlan 8)?
 * Wird in den Abfragen und in der Anzeige ausgewertet. Was hier fehlt,
 * wird nicht geladen – und in der Oberflaeche als gesperrt benannt,
 * nicht stillschweigend weggelassen.
 */
export interface Personenfelder {
  stammdaten: boolean;      // Name, Funktion, Personalnummer
  einsatzdaten: boolean;    // Einsatzzeit, Einsatzort, Qualifikation
  kontakt: boolean;         // Telefon, dienstliche E-Mail
  anschrift: boolean;       // private Anschrift, Geburtsdatum
  vertrag: boolean;         // Arbeitsvertrag, Stundensatz, Bankdaten
  notizen: boolean;         // interne Personalnotizen
  gesundheit: boolean;      // besondere Kategorien, Art. 9 DSGVO
}

export function personenfelder(role: Role): Personenfelder {
  return {
    stammdaten: can(role, 'employees.view'),
    einsatzdaten: can(role, 'employees.view'),
    kontakt: can(role, 'employees.edit') || can(role, 'dispo.view'),
    anschrift: can(role, 'employees.file'),
    vertrag: can(role, 'employees.finance'),
    notizen: can(role, 'employees.notes'),
    gesundheit: can(role, 'employees.sensitive'),
  };
}

/** Kurztext fuer ein Feld, das diese Rolle nicht sehen darf. */
export const GESPERRT_TEXT = 'Für Ihre Rolle nicht freigegeben';

import type { Permission } from "@/server/auth/permissions";

export type NavItem = { href: string; label: string; permission?: Permission; anyOf?: Permission[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Disposition",
    items: [
      { href: "/dashboard", label: "Dashboard", permission: "dashboard:view" },
      { href: "/kalender", label: "Kalender", permission: "shifts:read" },
      { href: "/veranstaltungen", label: "Veranstaltungen", permission: "events:read" },
      { href: "/schichten", label: "Schichten", permission: "shifts:read" },
      { href: "/anfragen", label: "Kundenanfragen", permission: "requests:read" },
      { href: "/auftraege", label: "Aufträge", permission: "orders:read" },
    ],
  },
  {
    label: "Stammdaten",
    items: [
      { href: "/mitarbeiter", label: "Mitarbeiter", permission: "employees:read" },
      { href: "/verfuegbarkeiten", label: "Verfügbarkeiten", permission: "availability:read" },
      { href: "/qualifikationen", label: "Qualifikationen", permission: "employees:read" },
      { href: "/kunden", label: "Kunden", permission: "customers:read" },
      { href: "/partner", label: "Partner", permission: "partners:read" },
      { href: "/dokumente", label: "Dokumente", permission: "documents:read" },
    ],
  },
  {
    label: "Zeiten & Abrechnung",
    items: [
      { href: "/zeitnachweise", label: "Zeitnachweise", permission: "time:read" },
      { href: "/abgleich", label: "Soll-Ist-Abgleich", permission: "time:read" },
      { href: "/abrechnung", label: "Abrechnung", permission: "billing:read" },
      { href: "/berichte", label: "Berichte", permission: "reports:view" },
    ],
  },
  {
    label: "Portale",
    items: [
      { href: "/portal/mitarbeiter", label: "Meine Einsätze", permission: "portal:employee" },
      { href: "/portal/kunde", label: "Kundenportal", permission: "portal:customer" },
      { href: "/portal/partner", label: "Partnerportal", permission: "portal:partner" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/benachrichtigungen", label: "Benachrichtigungen" },
      { href: "/einstellungen", label: "Einstellungen", anyOf: ["settings:read", "users:read", "api_keys:manage", "webhooks:manage", "automations:manage"] },
      { href: "/protokoll", label: "Protokoll", permission: "audit:read" },
    ],
  },
];

import type { RoleKey } from "../db/schema/tenancy";

/**
 * Berechtigungskatalog: "<bereich>:<aktion>".
 * Rollen erhalten Standardprofile; Mandanten können einzelne Rechte je Rolle
 * über role_permission_overrides ab- oder zuschalten.
 */
export const PERMISSIONS = [
  "dashboard:view",
  "employees:read",
  "employees:write",
  "employees:documents",
  "employees:export",
  "employees:import",
  "customers:read",
  "customers:write",
  "requests:read",
  "requests:write",
  "requests:convert",
  "events:read",
  "events:write",
  "orders:read",
  "orders:write",
  "orders:confirm",
  "shifts:read",
  "shifts:write",
  "shifts:assign",
  "shifts:override_conflict",
  "shifts:respond_own",
  "availability:read",
  "availability:write",
  "availability:write_own",
  "partners:read",
  "partners:write",
  "partners:respond_own",
  "documents:read",
  "documents:write",
  "documents:confidential",
  "time:import",
  "time:read",
  "time:correct",
  "time:approve",
  "reports:view",
  "reports:export",
  "billing:read",
  "billing:write",
  "notifications:admin",
  "settings:read",
  "settings:write",
  "users:read",
  "users:write",
  "api_keys:manage",
  "webhooks:manage",
  "automations:manage",
  "audit:read",
  "ai:use",
  "search:use",
  "portal:customer",
  "portal:partner",
  "portal:employee",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL = new Set<Permission>(PERMISSIONS);

const dispatcher: Permission[] = [
  "dashboard:view",
  "employees:read",
  "employees:write",
  "employees:documents",
  "customers:read",
  "customers:write",
  "requests:read",
  "requests:write",
  "requests:convert",
  "events:read",
  "events:write",
  "orders:read",
  "orders:write",
  "orders:confirm",
  "shifts:read",
  "shifts:write",
  "shifts:assign",
  "shifts:override_conflict",
  "availability:read",
  "availability:write",
  "partners:read",
  "partners:write",
  "documents:read",
  "documents:write",
  "time:read",
  "time:import",
  "reports:view",
  "notifications:admin",
  "settings:read",
  "ai:use",
  "search:use",
];

export const ROLE_PERMISSIONS: Record<RoleKey, ReadonlySet<Permission>> = {
  tenant_admin: ALL,
  dispatcher: new Set(dispatcher),
  operations_lead: new Set<Permission>([
    "dashboard:view",
    "employees:read",
    "customers:read",
    "events:read",
    "events:write",
    "orders:read",
    "shifts:read",
    "shifts:write",
    "shifts:assign",
    "availability:read",
    "partners:read",
    "documents:read",
    "time:read",
    "time:correct",
    "reports:view",
    "search:use",
  ]),
  hr: new Set<Permission>([
    "dashboard:view",
    "employees:read",
    "employees:write",
    "employees:documents",
    "employees:export",
    "employees:import",
    "availability:read",
    "availability:write",
    "documents:read",
    "documents:write",
    "documents:confidential",
    "shifts:read",
    "events:read",
    "reports:view",
    "search:use",
  ]),
  accounting: new Set<Permission>([
    "dashboard:view",
    "customers:read",
    "events:read",
    "orders:read",
    "shifts:read",
    "time:read",
    "time:approve",
    "time:correct",
    "billing:read",
    "billing:write",
    "reports:view",
    "reports:export",
    "search:use",
    // bewusst KEIN employees:documents / documents:confidential
    "employees:read",
  ]),
  customer: new Set<Permission>(["portal:customer", "requests:read", "requests:write"]),
  partner: new Set<Permission>(["portal:partner", "partners:respond_own"]),
  employee: new Set<Permission>(["portal:employee", "shifts:respond_own", "availability:write_own"]),
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  tenant_admin: "Unternehmensadministrator",
  dispatcher: "Disponent",
  operations_lead: "Einsatzleiter",
  hr: "Personalverantwortlicher",
  accounting: "Buchhaltung",
  customer: "Kunde",
  partner: "Partnerunternehmen",
  employee: "Mitarbeiter",
};

/** Rollen, die im internen Backoffice arbeiten (im Gegensatz zu Portalrollen). */
export const INTERNAL_ROLES: RoleKey[] = ["tenant_admin", "dispatcher", "operations_lead", "hr", "accounting"];
export const PORTAL_ROLES: RoleKey[] = ["customer", "partner", "employee"];

export function isPermission(x: string): x is Permission {
  return ALL.has(x as Permission);
}

export function resolvePermissions(role: RoleKey, overrides: { permission: string; allowed: boolean }[] = []): Set<Permission> {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role]);
  for (const o of overrides) {
    if (!isPermission(o.permission)) continue;
    if (o.allowed) result.add(o.permission);
    else result.delete(o.permission);
  }
  return result;
}

/** Startseite je Rolle: Portalrollen landen in ihrem Portal, interne Rollen auf dem Dashboard. */
export function homeForRole(role: RoleKey | "system"): string {
  if (role === "employee") return "/portal/mitarbeiter";
  if (role === "customer") return "/portal/kunde";
  if (role === "partner") return "/portal/partner";
  return "/dashboard";
}

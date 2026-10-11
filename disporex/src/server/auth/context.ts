import type { RoleKey } from "../db/schema/tenancy";
import type { Permission } from "./permissions";
import { ForbiddenError } from "../core/errors";

/**
 * Der Aufrufkontext: wer handelt, in welchem Mandanten, mit welchen Rechten.
 * Wird von Session- oder API-Key-Auth erzeugt und durch alle Services gereicht.
 */
export type AuthContext = {
  kind: "session" | "api_key" | "system";
  tenantId: string;
  userId: string | null;
  userName: string;
  role: RoleKey | "system";
  permissions: ReadonlySet<Permission>;
  isSystemAdmin: boolean;
  /** Fachliche Bindung für Portalrollen. */
  employeeId: string | null;
  customerId: string | null;
  partnerId: string | null;
  sessionId?: string;
  apiKeyId?: string;
  requestId: string;
  ip?: string;
  /** Zeitpunkt der letzten Passwortbestätigung (für sensible Aktionen). */
  reauthAt?: Date | null;
};

export function can(ctx: AuthContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

export function requirePermission(ctx: AuthContext, ...permissions: Permission[]): void {
  for (const p of permissions) {
    if (!ctx.permissions.has(p)) throw new ForbiddenError(`Berechtigung fehlt: ${p}`);
  }
}

export function requireAny(ctx: AuthContext, ...permissions: Permission[]): void {
  if (!permissions.some((p) => ctx.permissions.has(p))) throw new ForbiddenError(`Berechtigung fehlt: ${permissions.join(" oder ")}`);
}

/** Systemkontext für Hintergrundjobs innerhalb eines Mandanten (alle Rechte, protokolliert als "system"). */
export function systemContext(tenantId: string, requestId = "system"): AuthContext {
  return {
    kind: "system",
    tenantId,
    userId: null,
    userName: "System",
    role: "system",
    permissions: new Set(ALL_PERMISSIONS),
    isSystemAdmin: false,
    employeeId: null,
    customerId: null,
    partnerId: null,
    requestId,
  };
}

import { PERMISSIONS as ALL_PERMISSIONS } from "./permissions";

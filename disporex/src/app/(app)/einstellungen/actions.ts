"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, num, optStr } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { updateTenant } from "@/server/modules/tenants/service";
import { createInvitation, reauthenticate } from "@/server/auth/service";
import { changeMemberRole, setMemberStatus, setRoleOverride, revokeUserSession } from "@/server/modules/users/service";
import { createApiKey, revokeApiKey, rotateApiKey } from "@/server/auth/api-keys";
import { requirePermission } from "@/server/auth/context";
import { ROLE_KEYS } from "@/server/db/schema";
import { z } from "zod";

export async function updateTenantAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("settings:write");
    await updateTenant(ctx, {
      name: str(fd, "name"),
      settings: {
        timezone: str(fd, "timezone"),
        responseDeadlineHours: num(fd, "responseDeadlineHours") ?? 24,
        minRestHours: num(fd, "minRestHours") ?? 11,
        maxShiftHours: num(fd, "maxShiftHours") ?? 12,
        retentionDaysInactiveEmployees: num(fd, "retentionDaysInactiveEmployees") ?? 365,
        retentionDaysAuditLogs: num(fd, "retentionDaysAuditLogs") ?? 730,
        reconciliationToleranceMinutes: num(fd, "reconciliationToleranceMinutes") ?? 5,
      },
    });
    revalidatePath("/einstellungen");
    return { ok: true, message: "Einstellungen gespeichert." };
  }, fd);
}

export async function inviteAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("users:write");
    const role = z.enum(ROLE_KEYS).parse(str(fd, "role"));
    const r = await createInvitation(ctx.tenantId, ctx.userId!, {
      email: str(fd, "email"),
      role,
      employeeId: optStr(fd, "employeeId"),
      customerId: optStr(fd, "customerId"),
      partnerId: optStr(fd, "partnerId"),
    });
    revalidatePath("/einstellungen/benutzer");
    return {
      ok: true,
      message: r.mailOk ? `Einladung an ${r.invitation.email} gesendet.` : `Einladung angelegt, E-Mail-Versand fehlgeschlagen. Link manuell weitergeben: ${r.link}`,
    };
  }, fd);
}

export async function changeRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("users:write");
    await changeMemberRole(ctx, { membershipId: str(fd, "membershipId"), role: z.enum(ROLE_KEYS).parse(str(fd, "role")) });
    revalidatePath("/einstellungen/benutzer");
    return { ok: true, message: "Rolle geändert." };
  }, fd);
}

export async function memberStatusAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("users:write");
    await setMemberStatus(ctx, str(fd, "membershipId"), str(fd, "status") === "suspended" ? "suspended" : "active");
    revalidatePath("/einstellungen/benutzer");
  }, fd);
}

export async function reauthAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const ok = await reauthenticate(ctx.userId!, ctx.sessionId!, str(fd, "password"));
    if (!ok) return { error: "Passwort falsch." };
    revalidatePath("/", "layout");
    return { ok: true, message: "Bestätigt. Sensible Aktionen sind jetzt 15 Minuten lang freigegeben." };
  }, fd);
}

export async function createApiKeyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("api_keys:manage");
    const scopes = fd.getAll("scopes").filter((s): s is string => typeof s === "string");
    const exp = optStr(fd, "expiresAt");
    const created = await createApiKey(ctx, { name: str(fd, "name"), scopes, expiresAt: exp ? new Date(exp) : null });
    revalidatePath("/einstellungen/api-schluessel");
    return { ok: true, message: `Schlüssel „${created.name}“ erstellt. Bitte jetzt kopieren – er wird nicht erneut angezeigt:\n${created.secret}` };
  }, fd);
}

export async function revokeApiKeyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("api_keys:manage");
    await revokeApiKey(ctx, str(fd, "id"));
    revalidatePath("/einstellungen/api-schluessel");
  }, fd);
}

export async function rotateApiKeyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("api_keys:manage");
    const created = await rotateApiKey(ctx, str(fd, "id"));
    revalidatePath("/einstellungen/api-schluessel");
    return { ok: true, message: `Neuer Schlüssel (alter läuft in 24 h ab). Jetzt kopieren:\n${created.secret}` };
  }, fd);
}

export async function roleOverrideAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("settings:write");
    const role = z.enum(ROLE_KEYS).parse(str(fd, "role"));
    const v = str(fd, "value");
    await setRoleOverride(ctx, role, str(fd, "permission"), v === "allow" ? true : v === "deny" ? false : null);
    revalidatePath("/einstellungen/rollen");
  }, fd);
}

export async function revokeSessionAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    requirePermission(ctx);
    await revokeUserSession(ctx, str(fd, "sessionId"));
    revalidatePath("/profil");
  }, fd);
}

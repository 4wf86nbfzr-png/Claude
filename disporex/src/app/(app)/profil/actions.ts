"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { changePassword } from "@/server/auth/service";
import { setMyPreferences } from "@/server/modules/notifications/service";

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx, user } = await requireCurrent();
    await changePassword(user.id, str(fd, "current"), str(fd, "password"), ctx.sessionId);
    revalidatePath("/profil");
  }, fd);
}

export async function savePrefsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const prefs: Record<string, { in_app?: boolean; email?: boolean }> = {};
    const kinds = new Set<string>();
    for (const key of fd.keys()) {
      const [, kind] = key.split(":");
      if (kind) kinds.add(kind);
    }
    // Alle bekannten Anlässe aus dem Formular berücksichtigen (nicht angekreuzt = aus)
    for (const key of ["shift.request", "shift.response", "shift.declined", "request.new", "document.expiring", "import.completed"]) {
      prefs[key] = { in_app: fd.get(`in_app:${key}`) === "on", email: fd.get(`email:${key}`) === "on" };
    }
    await setMyPreferences(ctx, prefs);
    revalidatePath("/profil");
  }, fd);
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr, bool } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { createQualification, deleteQualification } from "@/server/modules/qualifications/service";

export async function createQualificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await createQualification(ctx, { key: str(fd, "key"), name: str(fd, "name"), description: optStr(fd, "description"), expires: bool(fd, "expires") });
    revalidatePath("/qualifikationen");
  }, fd);
}

export async function deleteQualificationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent("employees:write");
    await deleteQualification(ctx, str(fd, "id"));
    revalidatePath("/qualifikationen");
  }, fd);
}

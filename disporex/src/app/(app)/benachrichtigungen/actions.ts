"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { markRead } from "@/server/modules/notifications/service";

export async function markReadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const id = str(fd, "id");
    await markRead(ctx, id === "all" ? "all" : id);
    revalidatePath("/benachrichtigungen");
    revalidatePath("/", "layout");
  }, fd);
}

"use server";

import { revalidatePath } from "next/cache";
import { requireCurrent } from "@/server/auth/current";
import { runAction, str, optStr } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { uploadDocument, deleteDocument, createDownloadLink } from "@/server/modules/documents/service";

export async function uploadDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine Datei auswählen." };
    const data = Buffer.from(await file.arrayBuffer());
    const doc = await uploadDocument(
      ctx,
      { entityType: str(fd, "entityType") as "employee", entityId: str(fd, "entityId"), category: (str(fd, "category") || "general") as "general", title: str(fd, "title") || file.name, confidentiality: (str(fd, "confidentiality") || "internal") as "internal", expiresAt: optStr(fd, "expiresAt"), replacesDocumentId: optStr(fd, "replacesDocumentId") },
      { filename: file.name, mimeType: file.type || "application/octet-stream", data },
    );
    revalidatePath("/dokumente");
    revalidatePath(`/dokumente/${doc.id}`);
    return { ok: true, message: `„${doc.title}“ hochgeladen (Version ${doc.version}).` };
  }, fd);
}

export async function deleteDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    await deleteDocument(ctx, str(fd, "id"), optStr(fd, "reason") ?? undefined);
    revalidatePath("/dokumente");
  }, fd);
}

export async function downloadLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireCurrent();
    const link = await createDownloadLink(ctx, str(fd, "id"));
    return { ok: true, message: `Download-Link (10 Minuten gültig, einmalig):\n${link}` };
  }, fd);
}

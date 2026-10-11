"use server";

import { redirect } from "next/navigation";
import { getCurrent } from "@/server/auth/current";
import { switchSessionTenant } from "@/server/auth/session";
import { str } from "@/server/actions";

export async function switchTenantAction(fd: FormData): Promise<void> {
  const current = await getCurrent();
  if (!current?.ctx.sessionId) redirect("/login");
  const tenantId = str(fd, "tenantId");
  if (/^[0-9a-f-]{36}$/i.test(tenantId)) await switchSessionTenant(current.ctx.sessionId, current.user.id, tenantId);
  redirect("/dashboard");
}

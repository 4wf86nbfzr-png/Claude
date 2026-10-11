"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, signupTenant, requestPasswordReset, completePasswordReset, acceptInvitation, logoutLog } from "@/server/auth/service";
import { SESSION_COOKIE, sessionCookieOptions, revokeSession, findSession } from "@/server/auth/session";
import { runAction, str } from "@/server/actions";
import type { ActionState } from "@/lib/action-result";
import { clientIp } from "@/server/auth/current";

async function meta() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") ?? undefined };
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
}

function safeNext(v: string): string {
  return v.startsWith("/") && !v.startsWith("//") ? v : "/dashboard";
}

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const next = safeNext(str(fd, "next"));
  const r = await runAction(async () => {
    const res = await login({ email: str(fd, "email"), password: str(fd, "password") }, await meta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
  }, fd);
  if (r?.ok) redirect(next);
  return r;
}

export async function signupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const res = await signupTenant({ companyName: str(fd, "companyName"), name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") }, await meta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
  }, fd);
  if (r?.ok) redirect("/dashboard?willkommen=1");
  return r;
}

export async function forgotAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await requestPasswordReset(str(fd, "email"), await meta());
    return { ok: true, message: "Falls ein Konto mit dieser Adresse existiert, wurde eine E-Mail mit einem Link versendet." };
  }, fd);
}

export async function resetAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    if (str(fd, "password") !== str(fd, "password2")) return { error: "Die Passwörter stimmen nicht überein." };
    await completePasswordReset(str(fd, "token"), str(fd, "password"));
  }, fd);
  if (r?.ok) redirect("/login?hinweis=passwort-gesetzt");
  return r;
}

export async function acceptInviteAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const res = await acceptInvitation(str(fd, "token"), { name: str(fd, "name"), password: str(fd, "password") }, await meta());
    await setSessionCookie(res.session.token, res.session.expiresAt);
  }, fd);
  if (r?.ok) redirect("/dashboard");
  return r;
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const s = await findSession(token);
    if (s) {
      await revokeSession(s.sessionId);
      await logoutLog(s.userId);
    }
  }
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

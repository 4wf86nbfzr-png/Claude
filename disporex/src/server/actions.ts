import { ZodError } from "zod";
import { isAppError } from "./core/errors";
import { logger } from "./core/logger";
import type { ActionState } from "@/lib/action-result";
import { fieldErrorsFromZod, retainValues } from "@/lib/action-result";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/** Führt eine Server Action aus und bildet Fehler auf Formularzustand ab. */
export async function runAction(fn: () => Promise<ActionState | void>, fd?: FormData): Promise<ActionState> {
  const values = fd ? retainValues(fd) : undefined;
  try {
    const r = await fn();
    if (r && !r.ok && r.error) return { ...r, values };
    return r ?? { ok: true };
  } catch (err) {
    if (isRedirectError(err)) throw err;
    if (err instanceof ZodError) return { error: "Bitte Eingaben prüfen.", fieldErrors: fieldErrorsFromZod(err.issues), values };
    if (isAppError(err)) return { error: err.message, values };
    logger.error({ err }, "Server Action fehlgeschlagen");
    return { error: "Unerwarteter Fehler. Bitte erneut versuchen.", values };
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}
export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key).trim();
  return v === "" ? null : v;
}
export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
export function num(fd: FormData, key: string): number | null {
  const v = str(fd, key).trim();
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function list(fd: FormData, key: string): string[] {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v !== "");
}

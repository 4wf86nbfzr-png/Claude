/** Einheitliches Ergebnis von Server Actions für Formulare. */
export type ActionState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string; values?: Record<string, string> } | null;

/** Formularwerte für die Wiederanzeige nach Fehlern – Passwörter werden nie zurückgegeben. */
export function retainValues(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (/pass|secret|token/i.test(k) || k.startsWith("$ACTION")) continue;
    if (k in out) continue;
    out[k] = v;
  }
  return out;
}

export function fieldErrorsFromZod(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".") || "_";
    if (!out[key]) out[key] = i.message;
  }
  return out;
}

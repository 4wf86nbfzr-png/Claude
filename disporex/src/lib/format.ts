/** Formatierung für die deutsche Oberfläche. Alle Zeiten in der Mandanten-Zeitzone (Standard Europe/Berlin). */
const TZ = "Europe/Berlin";

export function fmtDate(d: Date | string | null | undefined, tz = TZ): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d));
}
export function fmtTime(d: Date | string | null | undefined, tz = TZ): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}
export function fmtDateTime(d: Date | string | null | undefined, tz = TZ): string {
  if (!d) return "–";
  return `${fmtDate(d, tz)} ${fmtTime(d, tz)}`;
}
export function fmtRange(a: Date | string, b: Date | string, tz = TZ): string {
  const da = new Date(a);
  const db = new Date(b);
  if (fmtDate(da, tz) === fmtDate(db, tz)) return `${fmtDate(da, tz)} ${fmtTime(da, tz)}–${fmtTime(db, tz)}`;
  return `${fmtDateTime(da, tz)} – ${fmtDateTime(db, tz)}`;
}
export function fmtWeekday(d: Date | string, tz = TZ): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: tz, weekday: "short" }).format(new Date(d));
}
export function fmtMinutes(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, "0")} h`;
}
export function fmtCents(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}
export function fmtRelative(d: Date | string): string {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60_000);
  if (Math.abs(min) < 1) return "gerade eben";
  if (Math.abs(min) < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (Math.abs(h) < 24) return `vor ${h} Std.`;
  const days = Math.round(h / 24);
  return `vor ${days} Tg.`;
}
/** Für <input type="datetime-local">: lokale Darstellung in der Mandantenzeitzone. */
export function toLocalInput(d: Date | string | null | undefined, tz = TZ): string {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

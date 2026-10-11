/**
 * Umwandlung einer lokalen Zeit (Formulareingabe "YYYY-MM-DDTHH:mm") in der
 * Mandantenzeitzone in einen UTC-Zeitpunkt – ohne externe Bibliothek.
 */
export function localToUtc(local: string, tz = "Europe/Berlin"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error("Ungültiges Datumsformat");
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  // Erste Schätzung in UTC, dann Offset der Zeitzone an diesem Zeitpunkt korrigieren (zwei Iterationen für DST-Kanten).
  let guess = Date.UTC(y!, mo! - 1, d!, h!, mi!);
  for (let i = 0; i < 2; i++) {
    const offset = tzOffsetMinutes(new Date(guess), tz);
    guess = Date.UTC(y!, mo! - 1, d!, h!, mi!) - offset * 60_000;
  }
  return new Date(guess);
}

export function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/** Tagesbeginn (00:00) eines Datums "YYYY-MM-DD" in der Zeitzone als UTC-Instant. */
export function startOfDayUtc(isoDate: string, tz = "Europe/Berlin"): Date {
  return localToUtc(`${isoDate}T00:00`, tz);
}

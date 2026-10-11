/** Zeithilfen ohne externe Abhängigkeit, alles in UTC-Instanten. */

export function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 3_600_000);
}
export function addMinutes(d: Date, m: number): Date {
  return new Date(d.getTime() + m * 60_000);
}
export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

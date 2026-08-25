import { OPENING_EXCEPTIONS, OPENING_HOURS, PREORDER_ENABLED } from "@/data/config";
import { parseClock } from "@/lib/format";
import type { OpeningRange, Weekday } from "@/types/domain";

const DAY_LABELS = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rangesFor(d: Date): OpeningRange[] {
  const exception = OPENING_EXCEPTIONS[isoDate(d)];
  if (exception) return exception;
  return OPENING_HOURS[d.getDay() as Weekday] ?? [];
}

export interface OpeningState {
  open: boolean;
  /** Wann wieder geoeffnet wird (nur wenn geschlossen). */
  opensAt?: Date;
  /** Wann geschlossen wird (nur wenn offen). */
  closesAt?: Date;
  /** Vorbestellung moeglich, obwohl geschlossen. */
  preorder: boolean;
}

function withClock(base: Date, minutes: number): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/**
 * Beruecksichtigt Zeiten ueber Mitternacht: Freitag 11:00–01:00 heisst,
 * dass Samstag um 00:30 noch der Freitag-Block laeuft.
 */
export function openingState(now: Date = new Date()): OpeningState {
  const minutes = now.getHours() * 60 + now.getMinutes();

  // Gestriger Block, der ueber Mitternacht reicht
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  for (const r of rangesFor(yesterday)) {
    const from = parseClock(r.from);
    const to = parseClock(r.to);
    if (to < from && minutes < to) {
      return { open: true, closesAt: withClock(now, to), preorder: false };
    }
  }

  for (const r of rangesFor(now)) {
    const from = parseClock(r.from);
    const to = parseClock(r.to);
    const endsNextDay = to < from;
    if (minutes >= from && (endsNextDay || minutes < to)) {
      const closes = endsNextDay
        ? withClock(new Date(now.getTime() + 86400000), to)
        : withClock(now, to);
      return { open: true, closesAt: closes, preorder: false };
    }
  }

  return { open: false, opensAt: nextOpening(now), preorder: PREORDER_ENABLED };
}

export function nextOpening(now: Date = new Date()): Date | undefined {
  const minutes = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now);
    day.setDate(now.getDate() + offset);
    for (const r of rangesFor(day)) {
      const from = parseClock(r.from);
      if (offset > 0 || from > minutes) return withClock(day, from);
    }
  }
  return undefined;
}

/** Zusammengefasste Anzeige: gleiche Zeiten werden zu Spannen gebuendelt. */
export function openingSchedule(): Array<{ days: string; hours: string }> {
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  const rows: Array<{ days: string; hours: string }> = [];
  let runStart: Weekday | null = null;
  let runEnd: Weekday | null = null;
  let runHours = "";

  const label = (r: OpeningRange[]) =>
    r.length === 0 ? "geschlossen" : r.map((x) => `${x.from}–${x.to}`).join(", ");

  const flush = () => {
    if (runStart === null || runEnd === null) return;
    const days =
      runStart === runEnd
        ? DAY_LABELS[runStart]!
        : `${DAY_LABELS[runStart]!.slice(0, 2)}–${DAY_LABELS[runEnd]!.slice(0, 2)}`;
    rows.push({ days, hours: runHours });
  };

  for (const day of order) {
    const hours = label(OPENING_HOURS[day] ?? []);
    if (hours === runHours && runStart !== null) {
      runEnd = day;
    } else {
      flush();
      runStart = day;
      runEnd = day;
      runHours = hours;
    }
  }
  flush();
  return rows;
}

/** Waehlbare Zeitfenster fuer "zu bestimmter Uhrzeit". */
export function pickupSlots(now: Date = new Date(), leadMinutes = 30, count = 12): Date[] {
  const slots: Date[] = [];
  const cursor = new Date(now.getTime() + leadMinutes * 60000);
  cursor.setMinutes(Math.ceil(cursor.getMinutes() / 15) * 15, 0, 0);
  let guard = 0;
  while (slots.length < count && guard < 400) {
    guard++;
    if (openingState(cursor).open) slots.push(new Date(cursor));
    cursor.setMinutes(cursor.getMinutes() + 15);
  }
  return slots;
}

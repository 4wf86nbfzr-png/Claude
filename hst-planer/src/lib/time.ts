/**
 * Zeitberechnung fuer Einsaetze.
 *
 * Grundregel (Spec 69): Einsaetze laufen regelmaessig ueber Mitternacht.
 * 18:00 -> 02:00 sind 8 Stunden, niemals -16 Stunden. Deshalb rechnen wir
 * ausschliesslich in Minuten ab Schichtbeginn und addieren 24 h, sobald das
 * Ende vor dem Beginn liegt.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** Akzeptiert "17:00", "17.00", "1700", "17", "17:00 Uhr", "08:30:00". */
export function parseTimeToMinutes(input: unknown): number | null {
  if (input == null) return null;

  // Excel liefert Uhrzeiten haeufig als Bruchteil eines Tages (0.75 = 18:00).
  if (typeof input === 'number' && Number.isFinite(input)) {
    if (input >= 0 && input < 1) return Math.round(input * MINUTES_PER_DAY);
    if (Number.isInteger(input) && input >= 0 && input <= 2359) {
      const h = Math.floor(input / 100);
      const m = input % 100;
      if (h <= 24 && m <= 59) return h * 60 + m;
    }
    return null;
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.getUTCHours() * 60 + input.getUTCMinutes();
  }

  if (typeof input !== 'string') return null;
  const raw = input.trim().toLowerCase().replace(/uhr$/, '').trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\s*(?:[:.,]\s*(\d{1,2}))?(?:\s*[:.]\s*\d{1,2})?$/);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h > 24 || min > 59) return null;
    if (h === 24 && min > 0) return null;
    return h * 60 + min;
  }

  const compact = raw.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const h = Number(compact[1]);
    const min = Number(compact[2]);
    if (h > 24 || min > 59) return null;
    return h * 60 + min;
  }

  return null;
}

/** Minuten seit Mitternacht -> "HH:MM". */
export function formatMinutes(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Normalisiert beliebige Eingaben auf "HH:MM" oder null. */
export function normalizeTime(input: unknown): string | null {
  const minutes = parseTimeToMinutes(input);
  return minutes == null ? null : formatMinutes(minutes);
}

export interface ShiftDuration {
  /** Brutto-Minuten inklusive Pause. */
  grossMinutes: number;
  /** Netto-Minuten nach Abzug der Pause – nie negativ. */
  netMinutes: number;
  /** true, wenn die Schicht ueber Mitternacht laeuft. */
  overnight: boolean;
}

/**
 * Dauer einer Schicht. `start`/`end` sind Uhrzeiten, `breakMinutes` die Pause.
 * Ein Ende, das mit dem Beginn identisch ist, gilt als volle 24-Stunden-Schicht
 * nur dann, wenn `treatEqualAsFullDay` gesetzt ist – sonst als 0 Minuten.
 */
export function shiftDuration(
  start: unknown,
  end: unknown,
  breakMinutes = 0,
  options: { treatEqualAsFullDay?: boolean } = {},
): ShiftDuration | null {
  const s = parseTimeToMinutes(start);
  const e = parseTimeToMinutes(end);
  if (s == null || e == null) return null;

  let gross = e - s;
  if (gross < 0) gross += MINUTES_PER_DAY;
  if (gross === 0 && options.treatEqualAsFullDay) gross = MINUTES_PER_DAY;

  const pause = Number.isFinite(breakMinutes) ? Math.max(0, Math.round(breakMinutes)) : 0;
  return {
    grossMinutes: gross,
    netMinutes: Math.max(0, gross - pause),
    overnight: e < s,
  };
}

/** Netto-Minuten oder null. Kurzform fuer den haeufigsten Fall. */
export function shiftMinutes(start: unknown, end: unknown, breakMinutes = 0): number | null {
  return shiftDuration(start, end, breakMinutes)?.netMinutes ?? null;
}

/**
 * Differenz zweier Uhrzeiten in Minuten, im Fenster [-12h, +12h].
 * So wird "geplant 17:00, tatsaechlich 16:55" als -5 erkannt und nicht als +1435.
 */
export function timeDiffMinutes(planned: unknown, actual: unknown): number | null {
  const p = parseTimeToMinutes(planned);
  const a = parseTimeToMinutes(actual);
  if (p == null || a == null) return null;
  let diff = a - p;
  while (diff > MINUTES_PER_DAY / 2) diff -= MINUTES_PER_DAY;
  while (diff < -MINUTES_PER_DAY / 2) diff += MINUTES_PER_DAY;
  return diff;
}

/** "+30 Min", "-1:05 h", "0 Min" – fuer die Abgleich-Tabelle. */
export function formatDiff(minutes: number | null | undefined): string {
  if (minutes == null) return '–';
  if (minutes === 0) return '0 Min';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${abs} Min`;
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} h`;
}

/** Minuten als Dezimalstunden mit zwei Nachkommastellen (fuer Excel-Export). */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** "8:15 h" */
export function formatHours(minutes: number | null | undefined): string {
  if (minutes == null) return '–';
  const abs = Math.abs(minutes);
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')} h`;
}

/** Tagesbeginn in UTC – wir speichern Einsatztage ohne Zeitanteil. */
export function toDateOnly(value: Date | string): Date {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function sameDay(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() === toDateOnly(b).getTime();
}

const DATE_PATTERNS: RegExp[] = [
  /^(\d{4})-(\d{1,2})-(\d{1,2})$/,          // 2026-10-15
  /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/,      // 15.10.2026 / 15.10.26
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,        // 15/10/2026 (europaeisch gelesen)
];

const MONTHS: Record<string, number> = {
  januar: 1, jan: 1, februar: 2, feb: 2, maerz: 3, märz: 3, mrz: 3, mar: 3,
  april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11,
  dezember: 12, dez: 12,
};

/**
 * Deutsches Datum robust lesen. `referenceYear` ergaenzt fehlende Jahresangaben
 * ("15.10." in einer E-Mail meint das naechste Vorkommen dieses Tages).
 */
export function parseGermanDate(input: unknown, reference = new Date()): Date | null {
  if (input == null) return null;
  if (input instanceof Date && !Number.isNaN(input.getTime())) return toDateOnly(input);

  // Excel-Seriennummer (Tage seit 30.12.1899)
  if (typeof input === 'number' && Number.isFinite(input) && input > 20000 && input < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(input) * 86400000);
  }

  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  for (const pattern of DATE_PATTERNS) {
    const m = raw.match(pattern);
    if (!m) continue;
    const [a, b, c] = [m[1]!, m[2]!, m[3]!];
    let year: number, month: number, day: number;
    if (pattern === DATE_PATTERNS[0]) {
      year = Number(a); month = Number(b); day = Number(c);
    } else {
      day = Number(a); month = Number(b); year = Number(c);
      if (year < 100) year += year < 70 ? 2000 : 1900;
    }
    return buildDate(year, month, day);
  }

  // "15.10." ohne Jahr
  const short = raw.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (short) {
    const day = Number(short[1]);
    const month = Number(short[2]);
    return nextOccurrence(month, day, reference);
  }

  // "15. Oktober 2026" / "15. Oktober"
  const named = raw.toLowerCase().match(/^(\d{1,2})\.?\s+([a-zäöüß]+)\.?(?:\s+(\d{4}))?$/);
  if (named) {
    const month = MONTHS[named[2]!];
    if (month) {
      const day = Number(named[1]);
      return named[3] ? buildDate(Number(named[3]), month, day) : nextOccurrence(month, day, reference);
    }
  }

  const iso = new Date(raw);
  return Number.isNaN(iso.getTime()) ? null : toDateOnly(iso);
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

function nextOccurrence(month: number, day: number, reference: Date): Date | null {
  const today = toDateOnly(reference);
  const thisYear = buildDate(today.getUTCFullYear(), month, day);
  if (thisYear && thisYear.getTime() >= today.getTime() - 14 * 86400000) return thisYear;
  return buildDate(today.getUTCFullYear() + 1, month, day);
}

export function formatDateDE(date: Date | string | null | undefined): string {
  if (!date) return '–';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '–';
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}

export function isoDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString().slice(0, 10);
}

export const WEEKDAYS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'] as const;

export function weekdayDE(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return WEEKDAYS_DE[d.getUTCDay()] ?? '';
}

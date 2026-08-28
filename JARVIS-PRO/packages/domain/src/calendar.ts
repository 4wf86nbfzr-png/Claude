import { z } from 'zod';

export const DEFAULT_TIMEZONE = 'Europe/Berlin';

export const CalendarAttendeeSchema = z.object({
  name: z.string().max(200).nullable().default(null),
  email: z.string().max(320),
  required: z.boolean().default(true),
});
export type CalendarAttendee = z.infer<typeof CalendarAttendeeSchema>;

export const CalendarEventDraftSchema = z.object({
  calendarId: z.string().min(1).max(400).default('primary'),
  title: z.string().min(1).max(400),
  /** Lokale Zeit ohne Offset, die Zeitzone steht separat - so wie am Telefon gesprochen. */
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Format: JJJJ-MM-TTTHH:MM'),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Format: JJJJ-MM-TTTHH:MM'),
  timeZone: z.string().min(1).max(80).default(DEFAULT_TIMEZONE),
  location: z.string().max(400).nullable().default(null),
  description: z.string().max(10_000).nullable().default(null),
  attendees: z.array(CalendarAttendeeSchema).max(50).default([]),
  reminderMinutesBefore: z.number().int().min(0).max(40_320).nullable().default(15),
});
export type CalendarEventDraft = z.infer<typeof CalendarEventDraftSchema>;

export interface CalendarEvent extends CalendarEventDraft {
  readonly providerEventId: string;
  readonly providerAccount: string;
  readonly createdAt: string;
}

/**
 * Stabile Idempotency-ID fuer Kalendereintraege. Gleiche Angaben aus demselben
 * Gespraech ergeben denselben Schluessel, damit ein Retry keinen zweiten
 * Termin erzeugt.
 */
export function calendarIdempotencyKey(d: CalendarEventDraft, scope: string): string {
  const parts = [
    scope,
    d.calendarId,
    d.title.trim().toLowerCase(),
    d.start,
    d.end,
    d.timeZone,
    (d.location ?? '').trim().toLowerCase(),
    [...d.attendees].map((a) => a.email.toLowerCase()).sort().join(','),
  ];
  return parts.map((p) => `${p.length}:${p}`).join('|');
}

/**
 * Prueft, ob genug Angaben fuer eine Kalenderaktion vorliegen. Fehlt etwas,
 * muss Jarvis nachfragen statt zu raten - "morgen Nachmittag" ist bei einem
 * Geschaeftstermin keine Uhrzeit.
 */
export interface CalendarClarification {
  readonly field: string;
  readonly questionDe: string;
}

export function findCalendarClarifications(input: {
  title?: string | undefined;
  start?: string | undefined;
  end?: string | undefined;
  vagueTimePhrase?: string | undefined;
  candidateAttendeeMatches?: number | undefined;
}): CalendarClarification[] {
  const out: CalendarClarification[] = [];
  if (!input.title || input.title.trim().length === 0) {
    out.push({ field: 'title', questionDe: 'Wie soll der Termin heissen?' });
  }
  if (input.vagueTimePhrase !== undefined && input.vagueTimePhrase.trim().length > 0) {
    out.push({
      field: 'start',
      questionDe: `Du hast "${input.vagueTimePhrase}" gesagt - welche Uhrzeit genau soll ich eintragen?`,
    });
  } else if (!input.start) {
    out.push({ field: 'start', questionDe: 'Wann soll der Termin beginnen?' });
  }
  if (!input.end && input.start) {
    out.push({ field: 'end', questionDe: 'Wie lange soll der Termin dauern?' });
  }
  if ((input.candidateAttendeeMatches ?? 0) > 1) {
    out.push({
      field: 'attendees',
      questionDe: 'Es passen mehrere Kontakte. Wen genau meinst du?',
    });
  }
  return out;
}

/** Zeitangaben, die am Telefon typischerweise nicht ausreichen. */
const VAGUE_TIME_PATTERNS: readonly RegExp[] = [
  /\b(morgen|heute|übermorgen|uebermorgen)\s+(vormittag|nachmittag|abend|früh|frueh|mittag)\b/,
  /\b(irgendwann|demnächst|demnaechst|bald|gegen mittag|so gegen)\b/,
  /\bin der (früh|frueh|woche)\b/,
  /\b(anfang|mitte|ende) (der )?(woche|monat|nächster woche|naechster woche)\b/,
];

export function detectVagueTimePhrase(utterance: string): string | null {
  const t = utterance.toLowerCase().normalize('NFC');
  for (const re of VAGUE_TIME_PATTERNS) {
    const m = re.exec(t);
    if (m) return m[0];
  }
  return null;
}

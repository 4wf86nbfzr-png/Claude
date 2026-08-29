import { z } from 'zod';
import type { EventId, MemoryId, TaskId } from './ids.js';

/**
 * Offene Aufgabe. Jede Aufgabe traegt ihre Herkunft, damit Jarvis am Telefon
 * sagen kann, woher sie stammt, und nichts erfindet.
 */
export const TASK_STATES = ['open', 'in_progress', 'waiting', 'done', 'cancelled'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export interface OpenTask {
  readonly id: TaskId;
  readonly title: string;
  readonly state: TaskState;
  readonly dueAt: string | null;
  /** Woher die Aufgabe kommt - Ereignis-ID oder 'call:<id>'. */
  readonly originRef: string;
  readonly originEventId: EventId | null;
  readonly nextStep: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const TaskDraftSchema = z.object({
  title: z.string().min(1).max(300),
  dueAt: z.iso.datetime({ offset: true }).nullable().default(null),
  nextStep: z.string().max(500).default(''),
  originRef: z.string().min(1).max(200),
});

/**
 * Bestaetigtes Langzeitgedaechtnis. Gespeichert wird nur, was Noah bestaetigt
 * hat oder eindeutig als dauerhafte Information formuliert war
 * (`confirmationUtterance` haelt den Wortlaut fest, damit das nachvollziehbar
 * bleibt).
 */
export const MEMORY_SENSITIVITY = ['normal', 'sensitive'] as const;
export type MemorySensitivity = (typeof MEMORY_SENSITIVITY)[number];

export interface MemoryEntry {
  readonly id: MemoryId;
  readonly subject: string;
  readonly fact: string;
  readonly sensitivity: MemorySensitivity;
  readonly confirmedAt: string;
  readonly confirmationUtterance: string;
  readonly sourceRef: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const MemoryDraftSchema = z.object({
  subject: z.string().min(1).max(200),
  fact: z.string().min(1).max(2000),
  sensitivity: z.enum(MEMORY_SENSITIVITY).default('normal'),
  sourceRef: z.string().min(1).max(200),
});
export type MemoryDraft = z.infer<typeof MemoryDraftSchema>;

/**
 * Heuristik fuer "das will Noah dauerhaft gespeichert haben".
 * Trifft sie nicht zu, muss Jarvis nachfragen, statt still zu speichern.
 */
const PERMANENT_MARKERS: readonly RegExp[] = [
  /\bmerk dir\b/,
  /\bmerke dir\b/,
  /\bbehalte\b.*\bim kopf\b/,
  /\bspeicher(e)? (das|dir)\b/,
  /\bab (jetzt|sofort)\b/,
  /\bgrunds(ä|ae)tzlich\b/,
  /\bimmer\b.*\b(so|machen)\b/,
  /\bmein(e|er)? .* ist\b/,
];

export function looksLikePermanentFact(utterance: string): boolean {
  const t = utterance.toLowerCase().normalize('NFC');
  return PERMANENT_MARKERS.some((re) => re.test(t));
}

/**
 * Themen, bei denen Jarvis vor dem Speichern ausdruecklich nachfragen muss.
 * Bewusst grob gehalten - lieber einmal zu oft fragen.
 */
const SENSITIVE_MARKERS: readonly RegExp[] = [
  /\bpin\b/,
  /\bpasswort\b/,
  /\bkennwort\b/,
  /\biban\b/,
  /\bkonto(nummer)?\b/,
  /\bkreditkarte\b/,
  /\bgehalt\b/,
  /\blohn\b/,
  /\bkrank\b/,
  /\bdiagnose\b/,
  /\barzt\b/,
  /\banwalt\b/,
  /\bk(ü|ue)ndigung\b/,
  /\bsteuer(nummer)?\b/,
  /\bausweis\b/,
  /\bgeburtsdatum\b/,
  /\bprivatadresse\b/,
];

export function isSensitiveFact(fact: string): boolean {
  const t = fact.toLowerCase().normalize('NFC');
  return SENSITIVE_MARKERS.some((re) => re.test(t));
}

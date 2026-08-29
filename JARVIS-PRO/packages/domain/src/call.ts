import { z } from 'zod';
import type { CallId, CallJobId, EventId, E164 } from './ids.js';

/** Richtung und Lebenszyklus eines Telefongespraechs. */
export const CALL_STATES = [
  'IDLE',
  'DIALING',
  'RINGING',
  'ANSWERED',
  'AUTHENTICATED',
  'IN_CONVERSATION',
  'ENDED',
] as const;
export type CallState = (typeof CALL_STATES)[number];

const CALL_TRANSITIONS: Readonly<Record<CallState, readonly CallState[]>> = {
  IDLE: ['DIALING', 'RINGING', 'ANSWERED', 'ENDED'],
  DIALING: ['RINGING', 'ANSWERED', 'ENDED'],
  RINGING: ['ANSWERED', 'ENDED'],
  ANSWERED: ['AUTHENTICATED', 'ENDED'],
  AUTHENTICATED: ['IN_CONVERSATION', 'ENDED'],
  IN_CONVERSATION: ['ENDED'],
  ENDED: [],
};

export function canCallTransition(from: CallState, to: CallState): boolean {
  return CALL_TRANSITIONS[from].includes(to);
}

export const CallDirectionSchema = z.enum(['inbound', 'outbound']);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

export interface Call {
  readonly id: CallId;
  readonly direction: CallDirection;
  readonly peer: E164;
  readonly state: CallState;
  readonly startedAt: string;
  readonly answeredAt: string | null;
  readonly endedAt: string | null;
  readonly endReason: CallEndReason | null;
  /** Ereignisse, die in diesem Gespraech bereits genannt wurden. */
  readonly announcedEventIds: readonly EventId[];
}

export const CALL_END_REASONS = [
  'completed',
  'no_answer',
  'busy',
  'rejected',
  'network_error',
  'auth_failed',
  'not_allowlisted',
  'hangup_by_owner',
  'hangup_by_system',
] as const;
export type CallEndReason = (typeof CALL_END_REASONS)[number];

/** Endgruende, bei denen das ausloesende Ereignis offen bleiben muss. */
export const RETRYABLE_END_REASONS: ReadonlySet<CallEndReason> = new Set<CallEndReason>([
  'no_answer',
  'busy',
  'rejected',
  'network_error',
]);

/**
 * Ein persistenter Anruf-Job. Jedes neue Ereignis erzeugt genau einen davon;
 * `dedupKey` verhindert, dass mehrfache Providerzustellungen mehrere Anrufe
 * ausloesen.
 */
export interface CallJob {
  readonly id: CallJobId;
  readonly eventId: EventId;
  readonly dedupKey: string;
  readonly reason: string;
  readonly state: CallJobState;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const CALL_JOB_STATES = [
  'PENDING',
  'RUNNING',
  'DONE',
  'PAUSED',
  'DEAD_LETTER',
] as const;
export type CallJobState = (typeof CALL_JOB_STATES)[number];

import { z } from 'zod';
import type { ApprovalId, DraftId, CallId } from './ids.js';

/**
 * Der unveraenderliche Zustandsautomat der Versandfreigabe.
 *
 *   DRAFT -> READ_BACK -> AWAITING_APPROVAL -> APPROVED -> SENDING -> SENT
 *
 * Endzustaende ausserhalb des Erfolgspfads: CANCELLED, EXPIRED, FAILED.
 * UNKNOWN ist bewusst KEIN Erfolg: wenn der Provider keine belastbare Antwort
 * liefert, sagt Jarvis genau das und behauptet nichts.
 */
export const APPROVAL_STATES = [
  'DRAFT',
  'READ_BACK',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SENDING',
  'SENT',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'UNKNOWN',
] as const;

export const ApprovalStateSchema = z.enum(APPROVAL_STATES);
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;

export const TERMINAL_STATES: ReadonlySet<ApprovalState> = new Set<ApprovalState>([
  'SENT',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
  'UNKNOWN',
]);

/**
 * Erlaubte Uebergaenge. Alles, was hier nicht steht, ist verboten - es gibt
 * keine Abkuerzung von DRAFT nach SENDING und keinen Weg aus einem Endzustand
 * zurueck.
 */
const TRANSITIONS: Readonly<Record<ApprovalState, readonly ApprovalState[]>> = {
  DRAFT: ['READ_BACK', 'CANCELLED', 'EXPIRED'],
  READ_BACK: ['AWAITING_APPROVAL', 'DRAFT', 'CANCELLED', 'EXPIRED'],
  AWAITING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED', 'EXPIRED'],
  APPROVED: ['SENDING', 'CANCELLED', 'EXPIRED'],
  SENDING: ['SENT', 'FAILED', 'UNKNOWN'],
  SENT: [],
  CANCELLED: [],
  EXPIRED: [],
  FAILED: [],
  UNKNOWN: [],
};

export function canTransition(from: ApprovalState, to: ApprovalState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function isTerminal(s: ApprovalState): boolean {
  return TERMINAL_STATES.has(s);
}

export class ApprovalTransitionError extends Error {
  constructor(
    readonly from: ApprovalState,
    readonly to: ApprovalState,
  ) {
    super(`Unzulaessiger Freigabe-Uebergang: ${from} -> ${to}`);
    this.name = 'ApprovalTransitionError';
  }
}

export function assertTransition(from: ApprovalState, to: ApprovalState): void {
  if (!canTransition(from, to)) throw new ApprovalTransitionError(from, to);
}

/**
 * Ein Freigabevorgang. Die Bindung an den Inhalt laeuft ueber `payloadHash`
 * (SHA-256 der kanonischen Entwurfsserialisierung). Aendert sich am Entwurf
 * irgendetwas, passt der Hash nicht mehr und die Freigabe ist ungueltig.
 */
export interface Approval {
  readonly id: ApprovalId;
  readonly draftId: DraftId;
  readonly callId: CallId;
  readonly state: ApprovalState;
  readonly payloadHash: string;
  /** Zeitpunkt, an dem der vollstaendige Read-back abgeschlossen wurde. */
  readonly readBackAt: string | null;
  /** Hash des Textes, der tatsaechlich vorgelesen wurde. Muss zu payloadHash passen. */
  readonly readBackHash: string | null;
  readonly voiceConfirmedAt: string | null;
  readonly pinVerifiedAt: string | null;
  readonly approvedAt: string | null;
  readonly expiresAt: string;
  /** true, sobald die Freigabe genau einmal zum Versand benutzt wurde. */
  readonly consumed: boolean;
  readonly providerMessageId: string | null;
  readonly failureReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Der Wortlaut, der als Sprachbestaetigung gilt. Ein blosses "ja" reicht
 * ausdruecklich nicht. Gepruefte Varianten decken die natuerlichen deutschen
 * Formulierungen ab, verlangen aber immer das Verb "senden"/"abschicken".
 */
const CONFIRM_PATTERNS: readonly RegExp[] = [
  /^ja[,.\s]+senden$/,
  /^ja[,.\s]+bitte senden$/,
  /^ja[,.\s]+jetzt senden$/,
  /^ja[,.\s]+bitte jetzt senden$/,
  /^ja[,.\s]+abschicken$/,
  /^ja[,.\s]+bitte abschicken$/,
  /^ja[,.\s]+jetzt abschicken$/,
  /^ja[,.\s]+senden bitte$/,
];

/**
 * Prueft die gesprochene Bestaetigung.
 *
 * Absichtlich streng:
 *  - "ja", "okay", "passt", "mach das" sind ungueltig.
 *  - Nebensaetze und Hintergrundsprache ("ja, senden wir das morgen") sind
 *    ungueltig, weil der Gesamtausdruck exakt matchen muss.
 *  - Verneinungen sind ungueltig.
 */
export function isValidVoiceConfirmation(utterance: string): boolean {
  const t = utterance
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-z0-9äöüß,.\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  if (t.length === 0 || t.length > 40) return false;
  if (/\b(nicht|kein|nein|noch|spaeter|später|morgen|vielleicht)\b/.test(t)) return false;
  return CONFIRM_PATTERNS.some((re) => re.test(t));
}

export const APPROVAL_CONFIRMATION_PROMPT_DE =
  'Soll ich genau diese Version jetzt senden?';

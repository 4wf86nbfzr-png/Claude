import type { CallEndReason, E164 } from '@jarvis/domain';

/**
 * Die Telefonieschnittstelle, gegen die der Gespraechsablauf programmiert wird.
 *
 * Alles darunter - Asterisk, ARI, externalMedia, RTP - ist austauschbar. Der
 * Simulator implementiert dasselbe Interface, deshalb laesst sich der komplette
 * Ablauf einschliesslich Barge-in und DTMF ohne Hardware durchspielen.
 */
export interface TelephonyPort {
  readonly name: string;

  /** Startet die Verbindung zur Telefonanlage. */
  start(): Promise<void>;
  stop(): Promise<void>;

  /**
   * Ruft an. Es gibt bewusst KEIN `call(number)` - die Zielnummer kommt aus
   * der Konfiguration, nicht aus einem Argument.
   */
  dialOwner(reason: string): Promise<CallHandle>;

  /** Meldet einen eingehenden Anruf. */
  onIncomingCall(handler: (call: CallHandle) => void | Promise<void>): void;

  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

/** Ein aktives Gespraech. */
export interface CallHandle {
  readonly id: string;
  readonly direction: 'inbound' | 'outbound';
  /** Rufnummer der Gegenstelle, soweit vom Netz geliefert. Kann gefaelscht sein. */
  readonly callerId: string | null;

  /** Wartet, bis der Anruf angenommen wurde oder scheitert. */
  answered(): Promise<AnswerResult>;

  /** Eingehender Audiostrom als PCM16 in `inboundSampleRate`. */
  audioIn(): AsyncIterable<Int16Array>;
  readonly inboundSampleRate: number;

  /** Gibt PCM16 aus. Die Rate muss `outboundSampleRate` entsprechen. */
  playAudio(pcm: Int16Array): Promise<void>;
  readonly outboundSampleRate: number;

  /** Bricht die laufende Ausgabe sofort ab - Grundlage des Barge-in. */
  stopAudio(): Promise<void>;

  /** Sammelt DTMF-Ziffern bis zur Rautetaste oder bis zum Timeout. */
  collectDtmf(maxDigits: number, timeoutMs: number): Promise<string | null>;

  /** Einzelne DTMF-Ereignisse, z. B. um eine Ansage abzubrechen. */
  onDtmf(handler: (digit: string) => void): void;

  hangup(reason: CallEndReason): Promise<void>;
  onHangup(handler: (reason: CallEndReason) => void): void;
  readonly active: boolean;
}

export type AnswerResult =
  | { readonly answered: true }
  | { readonly answered: false; readonly reason: CallEndReason };

export interface TelephonyConfig {
  readonly ownerPhone: E164;
  readonly jarvisPhone: E164;
}

export class TelephonyError extends Error {
  constructor(
    message: string,
    readonly reason: CallEndReason,
  ) {
    super(message);
    this.name = 'TelephonyError';
  }
}

import type { Clock, E164 } from '@jarvis/domain';
import { verifyPin } from './crypto.js';

/**
 * Authentifizierung eingehender Anrufer.
 *
 * Die Caller-ID allein genuegt nicht: sie laesst sich faelschen. Sie ist der
 * erste Filter (Allowlist), der zweite ist eine per DTMF eingegebene PIN, von
 * der nur der scrypt-Hash gespeichert ist. Ein Stimmprofil wird bewusst NICHT
 * als Nachweis verwendet - Stimmen lassen sich heute synthetisieren.
 */
export type AuthOutcome =
  | { readonly ok: true; readonly peer: E164 }
  | { readonly ok: false; readonly reason: AuthFailure; readonly retriesLeft: number };

export type AuthFailure =
  | 'not_allowlisted'
  | 'pin_wrong'
  | 'pin_timeout'
  | 'too_many_attempts'
  | 'locked_out';

export interface CallerAuthConfig {
  readonly ownerPhone: E164;
  readonly loginPinHash: string;
  readonly maxAttempts: number;
  /** Sperrdauer nach zu vielen Fehlversuchen. */
  readonly lockoutSeconds: number;
}

export interface PinPrompt {
  /** Sammelt DTMF-Ziffern bis '#' oder Timeout. Gibt die Ziffernfolge zurueck. */
  collectPin(maxDigits: number, timeoutMs: number): Promise<string | null>;
}

/** Normalisiert eine Rufnummer fuer den Allowlist-Vergleich. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return `+${digits.slice(1).replace(/\D/g, '')}`;
  if (digits.startsWith('00')) return `+${digits.slice(2).replace(/\D/g, '')}`;
  return digits.replace(/\D/g, '');
}

export function isOwnerNumber(candidate: string, owner: E164): boolean {
  const a = normalizePhone(candidate);
  const b = normalizePhone(owner);
  return a.length > 0 && a === b;
}

export class CallerAuthenticator {
  private lockedUntil = 0;
  private failures = 0;

  constructor(
    private readonly config: CallerAuthConfig,
    private readonly clock: Clock,
  ) {}

  /**
   * Prueft einen eingehenden Anruf. Reihenfolge ist Absicht: erst Allowlist
   * (billig, kein Geheimnis im Spiel), dann PIN.
   */
  async authenticateInbound(callerId: string | null, prompt: PinPrompt): Promise<AuthOutcome> {
    const now = this.clock.now().getTime();
    if (now < this.lockedUntil) {
      return { ok: false, reason: 'locked_out', retriesLeft: 0 };
    }
    if (callerId === null || !isOwnerNumber(callerId, this.config.ownerPhone)) {
      return { ok: false, reason: 'not_allowlisted', retriesLeft: 0 };
    }

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt += 1) {
      const digits = await prompt.collectPin(12, 15_000);
      if (digits === null) {
        return {
          ok: false,
          reason: 'pin_timeout',
          retriesLeft: this.config.maxAttempts - attempt,
        };
      }
      if (await verifyPin(digits, this.config.loginPinHash)) {
        this.failures = 0;
        return { ok: true, peer: this.config.ownerPhone };
      }
      this.failures += 1;
    }

    this.lockedUntil = this.clock.now().getTime() + this.config.lockoutSeconds * 1000;
    return { ok: false, reason: 'too_many_attempts', retriesLeft: 0 };
  }

  get isLocked(): boolean {
    return this.clock.now().getTime() < this.lockedUntil;
  }

  get failureCount(): number {
    return this.failures;
  }
}

/**
 * Allowlist fuer ausgehende Anrufe. Es gibt bewusst kein `call(number)`:
 * die einzige waehlbare Nummer ist die des Eigentuemers, und sie kommt aus
 * der Konfiguration, nicht aus einem Modellargument.
 */
export class OutboundCallGuard {
  constructor(private readonly ownerPhone: E164) {}

  /** Die einzige Nummer, die Jarvis waehlen darf. */
  resolveTarget(): E164 {
    return this.ownerPhone;
  }

  assertAllowed(number: string): void {
    if (!isOwnerNumber(number, this.ownerPhone)) {
      throw new Error(
        'Ausgehende Anrufe sind ausschliesslich an die hinterlegte Rufnummer des Eigentuemers erlaubt.',
      );
    }
  }
}

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Clock } from '@jarvis/domain';

/**
 * Verifikation eingehender Webhooks (WhatsApp Business Cloud API).
 *
 * Meta signiert den ROH-Body mit dem App Secret und liefert die Signatur im
 * Header `X-Hub-Signature-256` als `sha256=<hex>`. Entscheidend: es muss der
 * unveraenderte Rohkoerper geprueft werden, nicht ein re-serialisiertes JSON.
 * Deshalb nimmt diese Funktion einen Buffer.
 */
export interface SignatureCheck {
  readonly valid: boolean;
  readonly reason: string | null;
}

export function verifyMetaSignature(
  rawBody: Buffer,
  headerValue: string | undefined,
  appSecret: string,
): SignatureCheck {
  if (headerValue === undefined || headerValue.length === 0) {
    return { valid: false, reason: 'signatur_fehlt' };
  }
  if (appSecret.length === 0) {
    return { valid: false, reason: 'app_secret_fehlt' };
  }
  const prefix = 'sha256=';
  if (!headerValue.startsWith(prefix)) {
    return { valid: false, reason: 'signatur_format' };
  }
  const provided = headerValue.slice(prefix.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) {
    return { valid: false, reason: 'signatur_format' };
  }
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const ok = timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  return ok ? { valid: true, reason: null } : { valid: false, reason: 'signatur_ungueltig' };
}

/**
 * Verifikation des Webhook-Handshakes (`hub.mode=subscribe`).
 * Der Vergleich des Verify-Tokens laeuft in konstanter Zeit.
 */
export function verifyMetaChallenge(
  query: { mode?: string | undefined; token?: string | undefined; challenge?: string | undefined },
  expectedToken: string,
): { ok: boolean; echo: string | null } {
  if (query.mode !== 'subscribe' || query.token === undefined || expectedToken.length === 0) {
    return { ok: false, echo: null };
  }
  const a = Buffer.from(query.token, 'utf8');
  const b = Buffer.from(expectedToken, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return { ok: false, echo: null };
  }
  if (!timingSafeEqual(a, b)) return { ok: false, echo: null };
  return { ok: true, echo: query.challenge ?? '' };
}

/**
 * Replay-Schutz. Haelt gesehene Nachrichten-IDs in einem Zeitfenster fest.
 * Bewusst im Speicher UND zusaetzlich in der Datenbank (dort ueber die
 * Ereignis-Deduplizierung) - der Speicher faengt den schnellen Doppelschlag ab,
 * die Datenbank den nach einem Neustart.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly windowMs = 10 * 60 * 1000,
    private readonly maxEntries = 10_000,
  ) {}

  /** true, wenn die ID neu ist. false = Replay/Duplikat. */
  accept(id: string): boolean {
    const now = this.clock.now().getTime();
    this.sweep(now);
    if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    return true;
  }

  /** Prueft, ob ein Zeitstempel im zulaessigen Fenster liegt (gegen Replay alter Bodies). */
  timestampFresh(isoOrEpochSeconds: string | number): boolean {
    const now = this.clock.now().getTime();
    const t =
      typeof isoOrEpochSeconds === 'number'
        ? isoOrEpochSeconds * 1000
        : Number.isFinite(Number(isoOrEpochSeconds))
          ? Number(isoOrEpochSeconds) * 1000
          : Date.parse(isoOrEpochSeconds);
    if (!Number.isFinite(t)) return false;
    return Math.abs(now - t) <= this.windowMs;
  }

  private sweep(now: number): void {
    if (this.seen.size < this.maxEntries) {
      for (const [k, t] of this.seen) {
        if (now - t > this.windowMs) this.seen.delete(k);
      }
      return;
    }
    // Notbremse: haelt die Karte begrenzt, auch wenn alles frisch ist.
    const drop = Math.ceil(this.seen.size / 2);
    let i = 0;
    for (const k of this.seen.keys()) {
      this.seen.delete(k);
      if (++i >= drop) break;
    }
  }

  get size(): number {
    return this.seen.size;
  }
}

import type { Clock, IdGenerator } from '@jarvis/domain';

/**
 * Steuerbare Uhr. Alles, was mit Fristen zu tun hat - Freigabeablauf,
 * Retry-Zeitpunkte, Anruflimit pro Stunde - laesst sich damit ohne echtes
 * Warten testen.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: string | Date = '2026-03-02T09:00:00.000Z') {
    this.current = typeof start === 'string' ? new Date(start) : new Date(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  nowIso(): string {
    return this.current.toISOString();
  }

  advanceSeconds(s: number): this {
    this.current = new Date(this.current.getTime() + s * 1000);
    return this;
  }

  advanceMs(ms: number): this {
    this.current = new Date(this.current.getTime() + ms);
    return this;
  }

  set(t: string | Date): this {
    this.current = typeof t === 'string' ? new Date(t) : new Date(t);
    return this;
  }
}

/** Aufsteigende, vorhersagbare IDs - macht Testfehler lesbar. */
export class SeqIdGenerator implements IdGenerator {
  private counters = new Map<string, number>();

  next(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}_${String(n).padStart(4, '0')}`;
  }

  reset(): void {
    this.counters.clear();
  }
}

/** Deterministische Zufallsquelle fuer Backoff-Jitter. */
export function fixedRandom(value = 0.5): () => number {
  return () => value;
}

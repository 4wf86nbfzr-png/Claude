/**
 * Healthchecks. Jede Pruefung liefert einen von drei Zustaenden und immer eine
 * deutsche Klartextmeldung - die landet spaeter im Diagnosebericht und im
 * Fehlerhandbuch.
 */
export type HealthStatus = 'ok' | 'degraded' | 'down' | 'unconfigured';

export interface HealthResult {
  readonly name: string;
  readonly status: HealthStatus;
  readonly message: string;
  readonly durationMs: number;
  readonly details?: Record<string, unknown>;
}

export interface HealthCheck {
  readonly name: string;
  /** Ohne diese Komponente kann Jarvis gar nicht arbeiten. */
  readonly critical: boolean;
  run(): Promise<Omit<HealthResult, 'name' | 'durationMs'>>;
}

export class HealthRegistry {
  private readonly checks: HealthCheck[] = [];

  register(check: HealthCheck): this {
    this.checks.push(check);
    return this;
  }

  async runAll(timeoutMs = 5000): Promise<{
    overall: HealthStatus;
    results: HealthResult[];
  }> {
    const results = await Promise.all(
      this.checks.map(async (c): Promise<HealthResult> => {
        const t0 = Date.now();
        try {
          const r = await withTimeout(c.run(), timeoutMs);
          return { name: c.name, durationMs: Date.now() - t0, ...r };
        } catch (err) {
          return {
            name: c.name,
            status: 'down',
            message: err instanceof Error ? err.message : 'unbekannter Fehler',
            durationMs: Date.now() - t0,
          };
        }
      }),
    );

    let overall: HealthStatus = 'ok';
    for (const r of results) {
      const critical = this.checks.find((c) => c.name === r.name)?.critical ?? false;
      if (r.status === 'down' && critical) overall = 'down';
      else if (r.status !== 'ok' && overall === 'ok') overall = 'degraded';
    }
    return { overall, results };
  }
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Zeitueberschreitung nach ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Baut einen Check aus einer einfachen Prueffunktion. */
export function check(
  name: string,
  critical: boolean,
  fn: () => Promise<Omit<HealthResult, 'name' | 'durationMs'>>,
): HealthCheck {
  return { name, critical, run: fn };
}

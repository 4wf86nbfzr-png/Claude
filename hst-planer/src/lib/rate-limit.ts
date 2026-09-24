/**
 * Einfache Begrenzung der Aufrufe pro Zeitfenster (Spec 71).
 *
 * Bewusst im Prozessspeicher: Der HST Planer läuft als eine Instanz hinter
 * einem Reverse Proxy. Bei mehreren Instanzen gehört hier ein gemeinsamer
 * Speicher (Redis) hin – die Schnittstelle bleibt dieselbe.
 */

interface Bucket { count: number; resetAt: number }

const buckets = new Map<string, Bucket>();

export interface LimitResult { ok: boolean; remaining: number; retryAfterSeconds: number }

export function rateLimit(key: string, limit: number, windowSeconds: number): LimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  bucket.count++;
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Aufräumen, damit die Map nicht unbegrenzt waechst. */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 60_000).unref?.();

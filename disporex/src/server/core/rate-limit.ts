import { RateLimitError } from "./errors";

/**
 * Sliding-Window-Rate-Limiter im Prozessspeicher.
 * Reicht für einen Anwendungsprozess; bei horizontaler Skalierung durch einen
 * verteilten Speicher (Redis/Postgres) ersetzen – die Schnittstelle bleibt gleich.
 */
type Bucket = { timestamps: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function checkRateLimit(key: string, limit: number, windowMs = 60_000): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) {
      b.timestamps = b.timestamps.filter((t) => now - t < windowMs);
      if (b.timestamps.length === 0) buckets.delete(k);
    }
    lastSweep = now;
  }
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: limit - bucket.timestamps.length, retryAfterSec: 0 };
}

export function enforceRateLimit(key: string, limit: number, windowMs = 60_000): void {
  const r = checkRateLimit(key, limit, windowMs);
  if (!r.allowed) throw new RateLimitError();
}

/** Nur für Tests. */
export function resetRateLimits(): void {
  buckets.clear();
}

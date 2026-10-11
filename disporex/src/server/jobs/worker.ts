import { randomUUID } from "node:crypto";
import { claimNextJob, completeJob, failJob } from "./queue";
import { handlers, scheduleMaintenance } from "./handlers";
import { logger } from "../core/logger";
import { env } from "../core/env";
import { captureError } from "../core/monitoring";

/**
 * Worker-Schleife: holt fällige Jobs, führt Handler aus, meldet Erfolg/Fehler zurück.
 * Mehrere Worker können parallel laufen (SKIP LOCKED). Wartungsjobs werden periodisch eingeplant.
 */
export async function runWorker(opts: { once?: boolean; types?: string[] } = {}): Promise<void> {
  const workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  const interval = env().WORKER_POLL_INTERVAL_MS;
  const concurrency = env().WORKER_CONCURRENCY;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  logger.info({ workerId, interval, concurrency }, "Worker gestartet");
  let lastMaintenance = 0;
  while (!stopping) {
    if (Date.now() - lastMaintenance > 60_000) {
      await scheduleMaintenance().catch((err) => logger.error({ err }, "Wartung konnte nicht eingeplant werden"));
      lastMaintenance = Date.now();
    }
    const processed = await processBatch(workerId, concurrency, opts.types);
    if (opts.once) break;
    if (processed === 0) await new Promise((r) => setTimeout(r, interval));
  }
  logger.info({ workerId }, "Worker beendet");
}

export async function processBatch(workerId: string, concurrency: number, types?: string[]): Promise<number> {
  const claimed = [];
  for (let i = 0; i < concurrency; i++) {
    const job = await claimNextJob(workerId, types);
    if (!job) break;
    claimed.push(job);
  }
  await Promise.all(
    claimed.map(async (job) => {
      const handler = handlers[job.type];
      if (!handler) {
        await failJob({ ...job, attempts: job.maxAttempts }, `Kein Handler für ${job.type}`);
        return;
      }
      try {
        await handler(job);
        await completeJob(job.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ jobId: job.id, type: job.type, attempt: job.attempts, err: msg }, "Job fehlgeschlagen");
        if (job.attempts >= job.maxAttempts) void captureError(err, { kind: `job:${job.type}`, tenantId: job.tenantId ?? undefined });
        await failJob(job, msg);
      }
    }),
  );
  return claimed.length;
}

/** Für Tests/Skripte: alle derzeit fälligen Jobs abarbeiten. */
export async function drainJobs(types?: string[], maxRounds = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxRounds; i++) {
    const n = await processBatch("drain", 10, types);
    total += n;
    if (n === 0) break;
  }
  return total;
}

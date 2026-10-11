import { and, eq, lte, sql, desc } from "drizzle-orm";
import { jobs } from "../db/schema";
import { withSystem, type Tx } from "../db/client";

export type JobInput = { tenantId?: string | null; type: string; payload?: Record<string, unknown>; runAt?: Date; priority?: number; maxAttempts?: number; dedupeKey?: string | null };

/**
 * Stellt einen Job in die datenbankgestützte Warteschlange – innerhalb der
 * aufrufenden Transaktion, damit Job und Fachdaten gemeinsam festgeschrieben werden.
 */
export async function enqueueJob(tx: Tx, input: JobInput): Promise<string | null> {
  const rows = await tx
    .insert(jobs)
    .values({
      tenantId: input.tenantId ?? null,
      type: input.type,
      payload: input.payload ?? {},
      runAt: input.runAt ?? new Date(),
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 5,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

export async function enqueue(input: JobInput): Promise<string | null> {
  return withSystem((tx) => enqueueJob(tx, input));
}

/** Holt den nächsten fälligen Job mit Zeilensperre (SKIP LOCKED) und markiert ihn als laufend. */
export async function claimNextJob(workerId: string, types?: string[]): Promise<typeof jobs.$inferSelect | null> {
  return withSystem(async (tx) => {
    const typeFilter = types && types.length > 0 ? sql`and type in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``;
    const picked = await tx.execute<{ id: string }>(sql`
      select id from jobs
      where status = 'queued' and run_at <= now() ${typeFilter}
      order by priority desc, run_at asc
      limit 1
      for update skip locked
    `);
    const id = picked.rows[0]?.id;
    if (!id) return null;
    const updated = await tx
      .update(jobs)
      .set({ status: "running", lockedAt: new Date(), lockedBy: workerId, attempts: sql`${jobs.attempts} + 1` })
      .where(eq(jobs.id, id))
      .returning();
    return updated[0] ?? null;
  });
}

export async function completeJob(id: string): Promise<void> {
  await withSystem((tx) => tx.update(jobs).set({ status: "completed", completedAt: new Date(), lockedAt: null, lockedBy: null }).where(eq(jobs.id, id)));
}

export async function failJob(job: typeof jobs.$inferSelect, error: string): Promise<void> {
  const dead = job.attempts >= job.maxAttempts;
  const backoffSec = Math.min(3600, 2 ** job.attempts * 15);
  await withSystem((tx) =>
    tx
      .update(jobs)
      .set({
        status: dead ? "dead" : "queued",
        lastError: error.slice(0, 2000),
        runAt: dead ? job.runAt : new Date(Date.now() + backoffSec * 1000),
        lockedAt: null,
        lockedBy: null,
        // dedupeKey freigeben, sobald der Job endgültig gescheitert ist, damit ein neuer Versuch eingeplant werden kann
        ...(dead ? { dedupeKey: null } : {}),
      })
      .where(eq(jobs.id, job.id)),
  );
}

/** Verwaiste "running"-Jobs (Worker abgestürzt) nach Frist wieder freigeben. */
export async function releaseStaleJobs(olderThanMs = 10 * 60_000): Promise<number> {
  const rows = await withSystem((tx) =>
    tx
      .update(jobs)
      .set({ status: "queued", lockedAt: null, lockedBy: null })
      .where(and(eq(jobs.status, "running"), lte(jobs.lockedAt, new Date(Date.now() - olderThanMs))))
      .returning({ id: jobs.id }),
  );
  return rows.length;
}

export async function listRecentJobs(tenantId: string | null, limit = 100) {
  return withSystem((tx) =>
    tx
      .select()
      .from(jobs)
      .where(tenantId ? eq(jobs.tenantId, tenantId) : sql`true`)
      .orderBy(desc(jobs.createdAt))
      .limit(limit),
  );
}

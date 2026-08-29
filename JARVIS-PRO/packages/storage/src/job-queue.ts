import type { Clock, IdGenerator, JobId } from '@jarvis/domain';
import type { Db } from './db.js';

/**
 * Persistente Jobqueue.
 *
 * Eigenschaften, die die Anforderung verlangt und die hier tatsaechlich
 * durchgesetzt werden:
 *  - persistent: alles liegt in der Datenbank, ein Neustart verliert nichts.
 *  - idempotent: `deduplication_key` ist UNIQUE. Derselbe Job wird nie zweimal
 *    eingestellt, egal wie oft der Ausloeser feuert.
 *  - exponentielles Retry mit Jitter.
 *  - Dead-Letter-Status nach `maxAttempts` statt stiller Verlust.
 *  - Sichtbarkeitssperre (`locked_until`), damit ein abgestuerzter Worker den
 *    Job nach Ablauf wieder freigibt, statt ihn fuer immer zu blockieren.
 */
export const JOB_STATES = ['PENDING', 'RUNNING', 'DONE', 'PAUSED', 'DEAD_LETTER'] as const;
export type JobState = (typeof JOB_STATES)[number];

export interface Job<P = unknown> {
  readonly id: JobId;
  readonly kind: string;
  readonly deduplicationKey: string;
  readonly payload: P;
  readonly state: JobState;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly nextAttemptAt: string;
  readonly lockedUntil: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface JobRow {
  id: string;
  kind: string;
  deduplication_key: string;
  payload_json: string;
  state: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueOptions {
  readonly kind: string;
  readonly deduplicationKey: string;
  readonly payload: unknown;
  readonly maxAttempts?: number;
  readonly runAt?: Date;
}

export interface EnqueueResult<P = unknown> {
  readonly job: Job<P>;
  readonly isNew: boolean;
}

export interface RetryPolicy {
  readonly baseSeconds: number;
  readonly factor: number;
  readonly maxSeconds: number;
  /** Anteil Zufall auf die Wartezeit, damit Retries nicht im Gleichschritt laufen. */
  readonly jitter: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  baseSeconds: 5,
  factor: 2,
  maxSeconds: 15 * 60,
  jitter: 0.2,
};

export function backoffSeconds(attempt: number, policy: RetryPolicy = DEFAULT_RETRY, rnd = Math.random): number {
  const raw = policy.baseSeconds * policy.factor ** Math.max(0, attempt - 1);
  const capped = Math.min(raw, policy.maxSeconds);
  const jitter = capped * policy.jitter * (rnd() * 2 - 1);
  return Math.max(1, Math.round(capped + jitter));
}

export class JobQueue {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly retry: RetryPolicy = DEFAULT_RETRY,
  ) {}

  enqueue<P>(opts: EnqueueOptions): EnqueueResult<P> {
    const now = this.clock.nowIso();
    const runAt = (opts.runAt ?? this.clock.now()).toISOString();
    return this.db.transaction(() => {
      const existing = this.db.get<JobRow>('SELECT * FROM jobs WHERE deduplication_key = ?', [
        opts.deduplicationKey,
      ]);
      if (existing !== undefined) {
        return { job: rowToJob<P>(existing), isNew: false };
      }
      const id = this.ids.next('job') as JobId;
      this.db.run(
        `INSERT INTO jobs (id, kind, deduplication_key, payload_json, state, attempts,
                           max_attempts, next_attempt_at, locked_until, last_error, created_at, updated_at)
         VALUES (?,?,?,?,'PENDING',0,?,?,NULL,NULL,?,?)`,
        [
          id,
          opts.kind,
          opts.deduplicationKey,
          JSON.stringify(opts.payload),
          opts.maxAttempts ?? 5,
          runAt,
          now,
          now,
        ],
      );
      const row = this.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
      if (row === undefined) throw new Error('Job konnte nicht gespeichert werden');
      return { job: rowToJob<P>(row), isNew: true };
    });
  }

  /**
   * Holt den naechsten faelligen Job und sperrt ihn. Die Auswahl und das
   * Sperren passieren in einer Transaktion - zwei Worker koennen denselben
   * Job nicht gleichzeitig ziehen.
   */
  claim<P>(kind: string, leaseSeconds = 120): Job<P> | null {
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
    return this.db.transaction(() => {
      const row = this.db.get<JobRow>(
        `SELECT * FROM jobs
          WHERE kind = ?
            AND state IN ('PENDING','RUNNING')
            AND next_attempt_at <= ?
            AND (locked_until IS NULL OR locked_until <= ?)
          ORDER BY next_attempt_at ASC
          LIMIT 1`,
        [kind, nowIso, nowIso],
      );
      if (row === undefined) return null;
      this.db.run(
        `UPDATE jobs SET state = 'RUNNING', locked_until = ?, updated_at = ? WHERE id = ?`,
        [leaseUntil, nowIso, row.id],
      );
      return rowToJob<P>({ ...row, state: 'RUNNING', locked_until: leaseUntil });
    });
  }

  complete(id: JobId): void {
    this.db.run(`UPDATE jobs SET state = 'DONE', locked_until = NULL, updated_at = ? WHERE id = ?`, [
      this.clock.nowIso(),
      id,
    ]);
  }

  /**
   * Meldet einen Fehlversuch. Nach `maxAttempts` landet der Job im
   * Dead-Letter-Status - er wird nicht geloescht, damit nichts verloren geht
   * und die Diagnose ihn zeigen kann.
   */
  fail(id: JobId, error: string, rnd = Math.random): Job | null {
    return this.db.transaction(() => {
      const row = this.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
      if (row === undefined) return null;
      const attempts = row.attempts + 1;
      const dead = attempts >= row.max_attempts;
      const nextAt = dead
        ? row.next_attempt_at
        : new Date(
            this.clock.now().getTime() + backoffSeconds(attempts, this.retry, rnd) * 1000,
          ).toISOString();
      this.db.run(
        `UPDATE jobs SET state = ?, attempts = ?, next_attempt_at = ?, locked_until = NULL,
                         last_error = ?, updated_at = ? WHERE id = ?`,
        [dead ? 'DEAD_LETTER' : 'PENDING', attempts, nextAt, error.slice(0, 2000), this.clock.nowIso(), id],
      );
      const updated = this.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
      return updated === undefined ? null : rowToJob(updated);
    });
  }

  /** Verschiebt einen Job, ohne einen Fehlversuch zu zaehlen (z. B. Leitung belegt). */
  reschedule(id: JobId, runAt: Date, note?: string): void {
    this.db.run(
      `UPDATE jobs SET state = 'PENDING', next_attempt_at = ?, locked_until = NULL,
                       last_error = COALESCE(?, last_error), updated_at = ? WHERE id = ?`,
      [runAt.toISOString(), note ?? null, this.clock.nowIso(), id],
    );
  }

  /** Pausiert alle Jobs einer Art - fuer das Anruflimit pro Stunde. */
  pauseKind(kind: string, reason: string): number {
    return this.db.run(
      `UPDATE jobs SET state = 'PAUSED', locked_until = NULL, last_error = ?, updated_at = ?
        WHERE kind = ? AND state IN ('PENDING','RUNNING')`,
      [reason, this.clock.nowIso(), kind],
    ).changes;
  }

  resumeKind(kind: string): number {
    return this.db.run(
      `UPDATE jobs SET state = 'PENDING', next_attempt_at = ?, updated_at = ?
        WHERE kind = ? AND state = 'PAUSED'`,
      [this.clock.nowIso(), this.clock.nowIso(), kind],
    ).changes;
  }

  byId<P>(id: JobId): Job<P> | null {
    const row = this.db.get<JobRow>('SELECT * FROM jobs WHERE id = ?', [id]);
    return row === undefined ? null : rowToJob<P>(row);
  }

  byDedupKey<P>(key: string): Job<P> | null {
    const row = this.db.get<JobRow>('SELECT * FROM jobs WHERE deduplication_key = ?', [key]);
    return row === undefined ? null : rowToJob<P>(row);
  }

  countByState(kind: string, state: JobState): number {
    const r = this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM jobs WHERE kind = ? AND state = ?', [
      kind,
      state,
    ]);
    return r?.n ?? 0;
  }

  list<P>(kind: string, states: readonly JobState[] = ['PENDING', 'RUNNING'], limit = 100): Job<P>[] {
    const placeholders = states.map(() => '?').join(',');
    return this.db
      .all<JobRow>(
        `SELECT * FROM jobs WHERE kind = ? AND state IN (${placeholders}) ORDER BY next_attempt_at ASC LIMIT ?`,
        [kind, ...states, limit],
      )
      .map((r) => rowToJob<P>(r));
  }

  /**
   * Gibt Jobs frei, deren Sperre abgelaufen ist. Wird beim Start aufgerufen -
   * so nimmt ein neu gestarteter Prozess die Arbeit eines abgestuerzten auf.
   */
  recoverStale(): number {
    return this.db.run(
      `UPDATE jobs SET state = 'PENDING', locked_until = NULL, updated_at = ?
        WHERE state = 'RUNNING' AND (locked_until IS NULL OR locked_until <= ?)`,
      [this.clock.nowIso(), this.clock.nowIso()],
    ).changes;
  }
}

function rowToJob<P>(r: JobRow): Job<P> {
  return {
    id: r.id as JobId,
    kind: r.kind,
    deduplicationKey: r.deduplication_key,
    payload: JSON.parse(r.payload_json) as P,
    state: r.state as JobState,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    nextAttemptAt: r.next_attempt_at,
    lockedUntil: r.locked_until,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

import type { CallJobId, Clock, E164, EventId, InboundEvent, JobId } from '@jarvis/domain';
import { RETRYABLE_END_REASONS } from '@jarvis/domain';
import type { AuditLog } from '@jarvis/security';
import { metrics, type Logger } from '@jarvis/observability';
import type { CallRepository, EventStore, JobQueue } from '@jarvis/storage';
import type { CallHandle, TelephonyPort } from '@jarvis/telephony';

/**
 * Der proaktive Anruf.
 *
 * Regeln aus Abschnitt 11, hier durchgesetzt:
 *  - Jedes neue Ereignis erzeugt genau EINEN persistenten Anruf-Job. Die
 *    Deduplizierung sitzt im `deduplication_key` der Jobqueue; mehrfache
 *    Providerzustellungen kollabieren dort.
 *  - Laeuft bereits ein Gespraech, wird kein zweites gestartet. Das Ereignis
 *    wird in das laufende Gespraech eingereiht und dort nach dem aktuellen
 *    Punkt angekuendigt.
 *  - Wird nicht abgenommen, wird nach `retrySeconds` erneut versucht. Danach
 *    bleibt das Ereignis offen und kommt beim naechsten erfolgreichen
 *    Gespraech zuerst.
 *  - `CALL_MAX_PER_HOUR` ist eine technische Notbremse gegen Fehlerschleifen.
 *    Beim Erreichen wird nichts geloescht: die Jobs werden pausiert und im
 *    Diagnosebericht markiert.
 *  - Selbst erzeugte Ereignisse loesen nie einen Anruf aus.
 */
export const CALL_JOB_KIND = 'call';

export interface CallJobPayload {
  readonly eventId: EventId;
  readonly reason: string;
}

export interface CallSchedulerConfig {
  /** Die einzige Rufnummer, die gewaehlt werden darf. */
  readonly ownerPhone: E164;
  readonly callOnEveryNewEmail: boolean;
  readonly callOnEveryNewWhatsapp: boolean;
  readonly retrySeconds: number;
  readonly maxCallsPerHour: number;
  /** Anzahl Anrufversuche, bevor das Ereignis nur noch offen bleibt. */
  readonly maxAttempts: number;
}

export interface ActiveConversation {
  enqueueEvent(event: InboundEvent): void;
  readonly pendingEventCount: number;
}

export interface CallSchedulerDeps {
  readonly jobs: JobQueue;
  readonly events: EventStore;
  readonly calls: CallRepository;
  readonly telephony: TelephonyPort;
  readonly audit: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly config: CallSchedulerConfig;
  /**
   * Fuehrt das Gespraech. Wird vom Scheduler aufgerufen, sobald der Anruf
   * angenommen wurde.
   */
  runConversation(call: CallHandle, payload: CallJobPayload, event: InboundEvent | null): Promise<void>;
  /** Liefert das laufende Gespraech, falls eines aktiv ist. */
  activeConversation(): ActiveConversation | null;
}

export type ScheduleOutcome =
  | { readonly kind: 'enqueued'; readonly jobId: JobId }
  | { readonly kind: 'duplicate'; readonly jobId: JobId }
  | { readonly kind: 'skipped'; readonly reason: string };

export class CallScheduler {
  private stopping = false;

  constructor(private readonly deps: CallSchedulerDeps) {}

  /**
   * Nimmt ein Ereignis an. Wird sowohl vom Webhook als auch vom
   * Delta-Abgleich aufgerufen - die Deduplizierung liegt darunter, also ist
   * ein Doppelaufruf hier ungefaehrlich.
   */
  scheduleForEvent(event: InboundEvent): ScheduleOutcome {
    if (event.selfOriginated) {
      this.deps.logger.info('kein_anruf_selbst_erzeugt', { eventId: event.id });
      return { kind: 'skipped', reason: 'selbst_erzeugt' };
    }
    const wanted =
      event.channel === 'email'
        ? this.deps.config.callOnEveryNewEmail
        : this.deps.config.callOnEveryNewWhatsapp;
    if (!wanted) {
      return { kind: 'skipped', reason: 'anruf_fuer_kanal_deaktiviert' };
    }

    // Laeuft ein Gespraech, wird das Ereignis dort eingereiht statt
    // ein zweiter Anruf gestartet.
    const active = this.deps.activeConversation();
    if (active !== null) {
      active.enqueueEvent(event);
      this.deps.logger.info('ereignis_in_laufendes_gespraech', { eventId: event.id });
      // Der Job wird trotzdem angelegt: bricht das Gespraech vorher ab,
      // darf das Ereignis nicht verloren gehen.
    }

    const result = this.deps.jobs.enqueue<CallJobPayload>({
      kind: CALL_JOB_KIND,
      deduplicationKey: `call:${event.id}`,
      payload: { eventId: event.id, reason: reasonFor(event) },
      maxAttempts: this.deps.config.maxAttempts,
    });

    if (!result.isNew) {
      metrics.duplicatesDropped.inc({ channel: event.channel });
      void this.deps.audit.record('event.duplicate', event.id, { channel: event.channel });
      return { kind: 'duplicate', jobId: result.job.id };
    }

    metrics.pendingCallJobs.set(this.deps.jobs.countByState(CALL_JOB_KIND, 'PENDING'));
    return { kind: 'enqueued', jobId: result.job.id };
  }

  /**
   * Arbeitet einen faelligen Anruf-Job ab. Gibt zurueck, ob etwas getan wurde -
   * damit die Schleife im Leerlauf schlafen kann.
   */
  async tick(): Promise<boolean> {
    if (this.stopping) return false;

    // Notbremse gegen Anrufschleifen.
    if (this.hourlyLimitReached()) {
      const paused = this.deps.jobs.pauseKind(CALL_JOB_KIND, 'stundenlimit_erreicht');
      if (paused > 0) {
        this.deps.logger.error('anruflimit_erreicht', {
          maxCallsPerHour: this.deps.config.maxCallsPerHour,
          pausedJobs: paused,
        });
      }
      return false;
    }

    // Ein laufendes Gespraech blockiert einen zweiten Anruf.
    if (this.deps.calls.activeCall() !== null) return false;

    const job = this.deps.jobs.claim<CallJobPayload>(CALL_JOB_KIND);
    if (job === null) return false;

    const event = this.deps.events.byId(job.payload.eventId);
    if (event === null) {
      this.deps.logger.warn('anruf_job_ohne_ereignis', { jobId: job.id });
      this.deps.jobs.complete(job.id);
      return true;
    }
    if (event.handled) {
      // Schon besprochen - z. B. weil es in ein laufendes Gespraech
      // eingereiht wurde. Kein Anruf mehr noetig.
      this.deps.jobs.complete(job.id);
      return true;
    }

    await this.placeCall(job.id as unknown as CallJobId, job.payload, event, job.attempts);
    return true;
  }

  private async placeCall(
    jobId: CallJobId,
    payload: CallJobPayload,
    event: InboundEvent,
    attempts: number,
  ): Promise<void> {
    const { telephony, calls, logger, audit } = this.deps;
    const record = calls.start('outbound', this.deps.config.ownerPhone);
    metrics.callsPlaced.inc({});
    void audit.record('call.outbound.placed', record.id, { eventId: event.id, attempt: attempts + 1 });

    let handle: CallHandle;
    try {
      handle = await telephony.dialOwner(payload.reason);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('anruf_konnte_nicht_gestartet_werden', { jobId, error: message });
      calls.end(record.id, 'network_error');
      metrics.callsFailed.inc({ reason: 'dial_failed' });
      this.deps.jobs.fail(jobId as unknown as JobId, message);
      return;
    }

    const answer = await handle.answered();
    if (!answer.answered) {
      calls.end(record.id, answer.reason);
      metrics.callsFailed.inc({ reason: answer.reason });
      void audit.record('call.ended', record.id, { reason: answer.reason });
      logger.info('anruf_nicht_zustande_gekommen', { jobId, reason: answer.reason });

      if (RETRYABLE_END_REASONS.has(answer.reason)) {
        const next = new Date(this.deps.clock.now().getTime() + this.deps.config.retrySeconds * 1000);
        // Ein nicht angenommener Anruf ist kein Fehler des Jobs, sondern ein
        // spaeterer Versuch. Der Fehlversuchszaehler steigt trotzdem, damit
        // es nicht endlos weitergeht.
        const failed = this.deps.jobs.fail(jobId as unknown as JobId, `nicht erreicht: ${answer.reason}`);
        if (failed !== null && failed.state === 'PENDING') {
          this.deps.jobs.reschedule(jobId as unknown as JobId, next, `erneuter Versuch nach ${answer.reason}`);
        } else {
          // Kein weiterer Versuch: das Ereignis bleibt offen und wird beim
          // naechsten erfolgreichen Gespraech zuerst genannt.
          logger.info('ereignis_bleibt_offen', { eventId: event.id });
        }
      }
      return;
    }

    calls.setState(record.id, 'ANSWERED');
    try {
      await this.deps.runConversation(handle, payload, event);
      this.deps.jobs.complete(jobId as unknown as JobId);
      this.deps.events.markHandled(event.id);
      calls.end(record.id, 'completed');
      void audit.record('call.ended', record.id, { reason: 'completed' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('gespraech_fehlgeschlagen', { jobId, error: message });
      this.deps.jobs.fail(jobId as unknown as JobId, message);
      calls.end(record.id, 'network_error');
    } finally {
      if (handle.active) await handle.hangup('hangup_by_system');
      metrics.pendingCallJobs.set(this.deps.jobs.countByState(CALL_JOB_KIND, 'PENDING'));
    }
  }

  private hourlyLimitReached(): boolean {
    const since = new Date(this.deps.clock.now().getTime() - 60 * 60 * 1000).toISOString();
    return this.deps.calls.countOutboundSince(since) >= this.deps.config.maxCallsPerHour;
  }

  /**
   * Gibt Jobs frei, die beim letzten Absturz in RUNNING haengen geblieben
   * sind. Wird beim Start aufgerufen - so geht nach einem Neustart nichts
   * verloren.
   */
  recoverAfterRestart(): number {
    const recovered = this.deps.jobs.recoverStale();
    if (recovered > 0) {
      this.deps.logger.info('anruf_jobs_wiederhergestellt', { count: recovered });
    }
    return recovered;
  }

  /** Nimmt pausierte Jobs wieder auf, sobald das Stundenlimit vorbei ist. */
  resumeIfPossible(): number {
    if (this.hourlyLimitReached()) return 0;
    const resumed = this.deps.jobs.resumeKind(CALL_JOB_KIND);
    if (resumed > 0) this.deps.logger.info('anruf_jobs_fortgesetzt', { count: resumed });
    return resumed;
  }

  stop(): void {
    this.stopping = true;
  }

  /** Zustand fuer den Diagnosebericht. */
  status(): {
    pending: number;
    running: number;
    paused: number;
    deadLetter: number;
    openEvents: number;
    limitReached: boolean;
  } {
    return {
      pending: this.deps.jobs.countByState(CALL_JOB_KIND, 'PENDING'),
      running: this.deps.jobs.countByState(CALL_JOB_KIND, 'RUNNING'),
      paused: this.deps.jobs.countByState(CALL_JOB_KIND, 'PAUSED'),
      deadLetter: this.deps.jobs.countByState(CALL_JOB_KIND, 'DEAD_LETTER'),
      openEvents: this.deps.events.countOpen(),
      limitReached: this.hourlyLimitReached(),
    };
  }
}

function reasonFor(event: InboundEvent): string {
  return event.channel === 'email' ? 'neue E-Mail' : 'neue WhatsApp-Nachricht';
}

import type { Clock, InboundEvent } from '@jarvis/domain';
import { metrics, type Logger } from '@jarvis/observability';
import type { EventStore, SyncStateRepository } from '@jarvis/storage';
import { ConnectorError, type MailConnector } from '@jarvis/connectors';

/**
 * Der Abgleich mit dem Postfach.
 *
 * Laeuft in einem eigenen Takt, unabhaengig vom Telefon. Wichtig ist vor
 * allem, was er NICHT tut: er verliert nichts.
 *
 *  - Nach einem Ausfall holt die Delta-Abfrage alles nach, was in der
 *    Zwischenzeit angekommen ist.
 *  - Ein Fehler stoppt die Schleife nicht, sondern verlaengert nur den
 *    Abstand bis zum naechsten Versuch.
 *  - Bei einem Authentifizierungsfehler wird nicht weitergepollt, sondern
 *    laut gemeldet: da hilft kein Warten, sondern nur eine neue Anmeldung.
 */
export interface SyncWorkerConfig {
  readonly intervalSeconds: number;
  readonly maxIntervalSeconds: number;
  readonly connectorName: string;
}

export interface SyncWorkerDeps {
  readonly mail: MailConnector;
  readonly events: EventStore;
  readonly syncState: SyncStateRepository;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly config: SyncWorkerConfig;
  readonly onEvent: (event: InboundEvent) => void;
}

export interface SyncResult {
  readonly fetched: number;
  readonly newEvents: number;
  readonly duplicates: number;
  readonly error: string | null;
  readonly authRequired: boolean;
}

export class MailSyncWorker {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private consecutiveFailures = 0;
  private authBlocked = false;

  constructor(private readonly deps: SyncWorkerDeps) {}

  /** Ein einzelner Abgleich. Wird auch von `pnpm dry-run` direkt aufgerufen. */
  async syncOnce(): Promise<SyncResult> {
    if (this.authBlocked) {
      return { fetched: 0, newEvents: 0, duplicates: 0, error: 'Anmeldung erforderlich', authRequired: true };
    }

    try {
      const drafts = await this.deps.mail.fetchNew();
      let newEvents = 0;
      let duplicates = 0;

      for (const draft of drafts) {
        const { event, isNew } = this.deps.events.ingest(draft);
        if (!isNew) {
          duplicates += 1;
          metrics.duplicatesDropped.inc({ channel: 'email', quelle: 'delta' });
          continue;
        }
        newEvents += 1;
        this.deps.onEvent(event);
      }

      this.consecutiveFailures = 0;
      if (drafts.length > 0) {
        this.deps.logger.info('postfach_abgeglichen', {
          fetched: drafts.length,
          newEvents,
          duplicates,
        });
      }
      metrics.openEvents.set(this.deps.events.countOpen());
      return { fetched: drafts.length, newEvents, duplicates, error: null, authRequired: false };
    } catch (err) {
      this.consecutiveFailures += 1;
      const message = err instanceof Error ? err.message : String(err);
      metrics.providerErrors.inc({ connector: this.deps.config.connectorName });

      if (err instanceof ConnectorError && err.kind === 'auth') {
        // Weiterpollen waere sinnlos und wuerde nur das Log fluten.
        this.authBlocked = true;
        this.deps.logger.error('postfach_anmeldung_abgelaufen', { message });
        return { fetched: 0, newEvents: 0, duplicates: 0, error: message, authRequired: true };
      }

      this.deps.logger.warn('postfach_abgleich_fehlgeschlagen', {
        message,
        consecutiveFailures: this.consecutiveFailures,
      });
      return { fetched: 0, newEvents: 0, duplicates: 0, error: message, authRequired: false };
    }
  }

  /** Wartezeit bis zum naechsten Versuch - nach Fehlern laenger. */
  private nextDelayMs(): number {
    const base = this.deps.config.intervalSeconds;
    const backoff = Math.min(
      this.deps.config.maxIntervalSeconds,
      base * 2 ** Math.min(this.consecutiveFailures, 5),
    );
    return (this.consecutiveFailures === 0 ? base : backoff) * 1000;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const loop = async (): Promise<void> => {
      if (!this.running) return;
      await this.syncOnce();
      if (!this.running) return;
      this.timer = setTimeout(() => void loop(), this.nextDelayMs());
    };
    void loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Nach erneuter Anmeldung wieder freigeben. */
  clearAuthBlock(): void {
    this.authBlocked = false;
    this.consecutiveFailures = 0;
  }

  get status(): { running: boolean; consecutiveFailures: number; authBlocked: boolean } {
    return {
      running: this.running,
      consecutiveFailures: this.consecutiveFailures,
      authBlocked: this.authBlocked,
    };
  }
}

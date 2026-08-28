import type { InboundEvent } from '@jarvis/domain';
import { MailSyncWorker, WhatsAppWebhookServer } from '@jarvis/connector-worker';
import { rootLogger } from '@jarvis/observability';
import { loadConfig, describeConfig } from './config.js';
import { buildRuntime } from './wiring.js';

/**
 * Der Einstiegspunkt.
 *
 * Reihenfolge beim Start ist Absicht:
 *  1. Konfiguration pruefen - lieber hier laut scheitern als spaeter leise.
 *  2. Verdrahten und haengengebliebene Jobs wiederherstellen.
 *  3. Healthchecks laufen lassen und das Ergebnis protokollieren.
 *  4. Erst dann Telefonie, Abgleich und Webhook starten.
 *
 * Beim Beenden wird umgekehrt abgebaut, und das Audit-Log wird
 * abgewartet - eine abgerissene Hash-Kette waere schwerer zu erklaeren als
 * ein paar Sekunden laengeres Herunterfahren.
 */
async function main(): Promise<void> {
  const logger = rootLogger.child('main');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    logger.error('konfiguration_fehlerhaft', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exitCode = 1;
    return;
  }

  logger.info('starte', describeConfig(config));

  if (config.mode !== 'live') {
    logger.warn('kein_live_betrieb', {
      mode: config.mode,
      hinweis:
        config.mode === 'simulation'
          ? 'Simulationsbetrieb: keine Telefonie, keine Provider, kein Modell.'
          : 'Trockenlauf: es wird gelesen, aber nichts gesendet.',
    });
  }

  const runtime = await buildRuntime({ config, logger });

  // Nach einem Absturz haengengebliebene Jobs wieder freigeben.
  runtime.scheduler.recoverAfterRestart();

  // Abgelaufene Freigaben aufraeumen - falls der Prozess mitten in einem
  // Freigabevorgang gestorben ist.
  const expired = runtime.engine.expireOverdue();
  if (expired > 0) logger.info('freigaben_verfallen', { count: expired });

  const health = await runtime.health.runAll();
  logger.info('healthcheck', {
    overall: health.overall,
    results: health.results.map((r) => `${r.name}=${r.status}`),
  });
  for (const r of health.results) {
    if (r.status !== 'ok') logger.warn('healthcheck_auffaellig', { name: r.name, status: r.status, message: r.message });
  }
  if (health.overall === 'down') {
    logger.error('start_abgebrochen', { grund: 'kritische Komponente nicht verfuegbar' });
    await runtime.shutdown();
    process.exitCode = 1;
    return;
  }

  await runtime.telephony.start();

  // Postfach-Abgleich.
  const sync = new MailSyncWorker({
    mail: runtime.mail,
    events: runtime.events,
    syncState: runtime.syncState,
    logger: runtime.logger.child('sync'),
    clock: runtime.clock,
    config: {
      intervalSeconds: config.behaviour.mailSyncSeconds,
      maxIntervalSeconds: 900,
      connectorName: runtime.mail.name,
    },
    onEvent: (event) => {
      melde(event);
    },
  });
  sync.start();

  // Wie ein neues Ereignis Noah erreicht, haengt am Kanal: anrufen oder
  // schreiben. Beides gleichzeitig waere zudringlich - deshalb bekommt der
  // Chat den Vorrang, wenn er eingeschaltet ist.
  const mitTelefon = config.kanal === 'telefon' || config.kanal === 'beide';
  const melde = (event: InboundEvent): void => {
    if (runtime.chat !== null) {
      void runtime.chat.notifyPending().catch((err: unknown) => {
        // Kein Datenverlust: das Ereignis bleibt ungenannt und wird
        // nachgereicht, sobald Noah das naechste Mal schreibt.
        runtime.logger.info('chat_meldung_verschoben', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      return;
    }
    if (mitTelefon) runtime.scheduler.scheduleForEvent(event);
  };

  // WhatsApp-Webhook, nur wenn eingerichtet.
  let webhook: WhatsAppWebhookServer | null = null;
  if (config.whatsapp.phoneNumberId.length > 0 && config.mode !== 'simulation') {
    webhook = new WhatsAppWebhookServer({
      config: {
        port: config.whatsapp.webhookPort,
        phoneNumberId: config.whatsapp.phoneNumberId,
        // Ohne diese Angabe landet jede Nachricht, die Noah an Jarvis
        // schreibt, als "neues Ereignis" im Speicher.
        ownerWaId: config.chat.ownerWaId,
      },
      secrets: runtime.secrets,
      events: runtime.events,
      logger: runtime.logger.child('webhook'),
      clock: runtime.clock,
      onEvent: (event) => {
        melde(event);
      },
      onOwnerMessage: (waId, text) => {
        if (runtime.chat === null) {
          runtime.logger.info('chat_nachricht_verworfen', { grund: 'Chatweg ist aus' });
          return;
        }
        void runtime.chat.handleMessage(waId, text).catch((err: unknown) => {
          runtime.logger.error('chat_zug_fehlgeschlagen', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
      onStatus: (s) => {
        runtime.logger.debug('whatsapp_zustellstatus', { status: s.status });
      },
    });
    await webhook.start();
  }

  // Anrufschleife.
  let running = true;
  const loop = async (): Promise<void> => {
    while (running) {
      let didWork = false;
      try {
        didWork = await runtime.scheduler.tick();
        runtime.scheduler.resumeIfPossible();
        runtime.engine.expireOverdue();
      } catch (err) {
        runtime.logger.error('anrufschleife_fehler', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      // Im Leerlauf ruhig warten, bei Arbeit sofort weiter.
      await new Promise((r) => setTimeout(r, didWork ? 250 : 2000));
    }
  };
  void loop();

  logger.info('bereit', {
    mode: config.mode,
    telefonie: runtime.telephony.name,
    webhook: webhook === null ? 'aus' : `Port ${config.whatsapp.webhookPort}`,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('beende', { signal });
    running = false;
    sync.stop();
    await webhook?.stop();
    await runtime.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unbehandelte_rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
    });
  });
}

void main();

import {
  cryptoIdGenerator,
  systemClock,
  type CallId,
  type Clock,
  type IdGenerator,
  type InboundEvent,
} from '@jarvis/domain';
import {
  AuditLog,
  CallerAuthenticator,
  detectSecretStore,
  SECRET_KEYS,
  type SecretStore,
} from '@jarvis/security';
import type { Logger} from '@jarvis/observability';
import { HealthRegistry, check, metricsSnapshot, rootLogger } from '@jarvis/observability';
import {
  ApprovalRepository,
  CalendarIdempotencyRepository,
  CallRepository,
  DraftRepository,
  EventStore,
  JobQueue,
  MemoryRepository,
  SendRepository,
  SqlAuditSink,
  SyncStateRepository,
  TaskRepository,
  migrate,
  openDatabase,
  schemaVersion,
  type Db,
} from '@jarvis/storage';
import { ApprovalEngine, SenderRegistry, type ChannelSender } from '@jarvis/approval-engine';
import {
  GraphCalendarConnector,
  GraphMailConnector,
  MicrosoftOAuth,
  MockCalendarConnector,
  MockMailConnector,
  MockMessagingConnector,
  WhatsAppCloudConnector,
  type CalendarConnector,
  type MailConnector,
  type MessagingConnector,
} from '@jarvis/connectors';
import {
  MockTts,
  PiperTts,
  ScriptedStt,
  WhisperCppStt,
  type SpeechToText,
  type TextToSpeech,
} from '@jarvis/speech';
import {
  AsteriskTelephony,
  SimulatedTelephony,
  VoiceSession,
  type CallHandle,
  type TelephonyPort,
} from '@jarvis/telephony';
import { ClaudeAgentBrain, ScriptedBrain, type Brain } from './brain.js';
import { CallScheduler, type CallJobPayload } from './call-scheduler.js';
import { Conversation } from './conversation.js';
import { ToolRegistry, type ToolContext } from './tools.js';
import type { Config } from './config.js';

/**
 * Die Verdrahtung.
 *
 * Eine Stelle, an der aus der Konfiguration ein lauffaehiger Jarvis wird.
 * Der Betriebsmodus entscheidet, welche Adapter eingehaengt werden:
 *
 *   simulation - nichts Echtes. Kein Telefon, keine Provider, kein Modell.
 *                Das ist die Voreinstellung und der einzige Modus, in dem
 *                nichts kaputtgehen kann.
 *   dry-run    - echte Verbindungen zum LESEN, aber der Versand geht in einen
 *                Sender, der nur protokolliert. Damit laesst sich das echte
 *                Postfach anschauen, ohne dass jemand eine Mail bekommt.
 *   live       - alles echt.
 *
 * Der Sprung von dry-run nach live ist bewusst eine Konfigurationsaenderung
 * und keine Nebenwirkung von irgendetwas anderem.
 */
export interface Runtime {
  readonly db: Db;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly logger: Logger;
  readonly secrets: SecretStore;
  readonly events: EventStore;
  readonly jobs: JobQueue;
  readonly calls: CallRepository;
  readonly tasks: TaskRepository;
  readonly memories: MemoryRepository;
  readonly syncState: SyncStateRepository;
  readonly calendarIdempotency: CalendarIdempotencyRepository;
  readonly audit: AuditLog;
  readonly engine: ApprovalEngine;
  readonly telephony: TelephonyPort;
  readonly stt: SpeechToText;
  readonly tts: TextToSpeech;
  readonly mail: MailConnector;
  readonly whatsapp: MessagingConnector;
  readonly calendar: CalendarConnector;
  readonly registry: ToolRegistry;
  readonly scheduler: CallScheduler;
  readonly health: HealthRegistry;
  readonly config: Config;
  activeConversation(): Conversation | null;
  shutdown(): Promise<void>;
}

/** Sender, der einen Connector an die Approval Engine haengt. */
class ConnectorSender implements ChannelSender {
  constructor(
    readonly channel: 'email' | 'whatsapp',
    private readonly inner: MailConnector | MessagingConnector,
  ) {}

  async send(
    draft: Parameters<ChannelSender['send']>[0],
    idempotencyKey: string,
  ): ReturnType<ChannelSender['send']> {
    return this.inner.send(draft, idempotencyKey);
  }
}

/**
 * Sender fuer den Dry-Run. Protokolliert, was gesendet WUERDE, und laesst
 * nichts hinaus. Der Rueckgabewert ist bewusst 'sent' - so laeuft der
 * Freigabeablauf vollstaendig durch und laesst sich pruefen; im Log und im
 * Audit steht trotzdem klar, dass es ein Trockenlauf war.
 */
class DryRunConnectorSender implements ChannelSender {
  readonly attempts: { recipient: string; idempotencyKey: string }[] = [];

  constructor(
    readonly channel: 'email' | 'whatsapp',
    private readonly logger: Logger,
  ) {}

  async send(
    draft: Parameters<ChannelSender['send']>[0],
    idempotencyKey: string,
  ): ReturnType<ChannelSender['send']> {
    this.attempts.push({ recipient: draft.recipient, idempotencyKey });
    this.logger.warn('trockenlauf_kein_versand', {
      channel: this.channel,
      recipient: draft.recipient,
      bodyLength: draft.body.length,
    });
    return { status: 'sent', providerMessageId: `dry-run:${idempotencyKey.slice(0, 16)}`, error: null };
  }
}

export interface BuildOptions {
  readonly config: Config;
  readonly logger?: Logger;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  /** Gehirn ersetzen - fuer Simulation und Tests. */
  readonly brain?: Brain;
}

export async function buildRuntime(opts: BuildOptions): Promise<Runtime> {
  const { config } = opts;
  const clock = opts.clock ?? systemClock;
  const ids = opts.ids ?? cryptoIdGenerator;
  const logger = opts.logger ?? rootLogger.child('jarvis', { mode: config.mode });
  const secrets = await detectSecretStore();

  // ---- Persistenz ---------------------------------------------------------
  const encryptionKey = config.db.cipher ? await secrets.get(SECRET_KEYS.dbEncryptionKey) : null;
  if (config.db.cipher && encryptionKey === null) {
    throw new Error(
      'Datenbankverschluesselung ist eingeschaltet, aber im Schluesselbund liegt kein Schluessel. ' +
        'Bitte "pnpm setup" ausfuehren.',
    );
  }
  const db = openDatabase({
    path: config.db.path,
    ...(encryptionKey === null ? {} : { encryptionKey }),
  });
  const applied = migrate(db);
  logger.info('datenbank_bereit', { schemaVersion: schemaVersion(db), migrationsApplied: applied });

  const events = new EventStore(db, clock, ids);
  const jobs = new JobQueue(db, clock, ids);
  const drafts = new DraftRepository(db, clock, ids);
  const approvals = new ApprovalRepository(db, clock, ids);
  const sends = new SendRepository(db, clock, ids);
  const tasks = new TaskRepository(db, clock, ids);
  const memories = new MemoryRepository(db, clock, ids);
  const calls = new CallRepository(db, clock, ids);
  const syncState = new SyncStateRepository(db, clock);
  const calendarIdempotency = new CalendarIdempotencyRepository(db, clock);
  const audit = new AuditLog(new SqlAuditSink(db), clock);

  // ---- Provider -----------------------------------------------------------
  const oauth =
    config.mode === 'simulation'
      ? null
      : new MicrosoftOAuth(
          {
            tenantId: config.microsoft.tenantId,
            clientId: config.microsoft.clientId,
            redirectUri: config.microsoft.redirectUri,
          },
          { secrets, logger: logger.child('ms-oauth'), clock },
        );

  const mail: MailConnector =
    config.mode === 'simulation' || oauth === null
      ? new MockMailConnector(config.microsoft.account || 'noah@hermserviceteam.com')
      : new GraphMailConnector({
          oauth,
          logger: logger.child('graph-mail'),
          clock,
          account: config.microsoft.account,
          loadDeltaLink: () => syncState.get('microsoft-mail')?.deltaLink ?? null,
          saveDeltaLink: (link) => syncState.set('microsoft-mail', { deltaLink: link }),
        });

  const calendar: CalendarConnector =
    config.mode === 'simulation' || oauth === null
      ? new MockCalendarConnector(config.microsoft.account || 'noah@hermserviceteam.com', clock)
      : new GraphCalendarConnector({
          oauth,
          logger: logger.child('graph-calendar'),
          clock,
          account: config.microsoft.account,
        });

  const whatsapp: MessagingConnector =
    config.mode === 'simulation'
      ? new MockMessagingConnector(config.whatsapp.phoneNumberId || '4915199998888')
      : new WhatsAppCloudConnector({
          config: {
            phoneNumberId: config.whatsapp.phoneNumberId,
            wabaId: config.whatsapp.wabaId,
            graphVersion: config.whatsapp.graphVersion,
            serviceWindowHours: config.whatsapp.serviceWindowHours,
          },
          secrets,
          logger: logger.child('whatsapp'),
          clock,
          lastInboundAt: (waId) => {
            const history = events.threadHistory('whatsapp', waId, 1);
            return history.at(-1)?.receivedAt ?? null;
          },
        });

  // ---- Approval Engine ----------------------------------------------------
  const senders = new SenderRegistry();
  if (config.mode === 'live') {
    senders.register(new ConnectorSender('email', mail));
    senders.register(new ConnectorSender('whatsapp', whatsapp));
  } else {
    senders.register(new DryRunConnectorSender('email', logger.child('dry-run')));
    senders.register(new DryRunConnectorSender('whatsapp', logger.child('dry-run')));
  }

  const approvalPinHash = (await secrets.get(SECRET_KEYS.approvalPinHash)) ?? '';
  if (config.mode !== 'simulation' && approvalPinHash.length === 0) {
    throw new Error(
      'Es ist keine Freigabe-PIN hinterlegt. Ohne sie kann nichts gesendet werden. ' +
        'Bitte "pnpm setup" ausfuehren.',
    );
  }

  const engine = new ApprovalEngine({
    drafts,
    approvals,
    sends,
    senders,
    audit,
    clock,
    logger: logger.child('approval'),
    config: {
      expiresSeconds: config.behaviour.approvalExpiresSeconds,
      approvalPinHash,
    },
  });

  // ---- Sprache ------------------------------------------------------------
  const stt: SpeechToText =
    config.mode === 'simulation' || config.speech.whisperBin.length === 0
      ? new ScriptedStt([])
      : new WhisperCppStt({
          binPath: config.speech.whisperBin,
          modelPath: config.speech.whisperModel,
          language: 'de',
        });

  const tts: TextToSpeech =
    config.mode === 'simulation' || config.speech.piperBin.length === 0
      ? new MockTts()
      : new PiperTts({
          binPath: config.speech.piperBin,
          voicePath: config.speech.piperVoice,
        });

  // ---- Telefonie ----------------------------------------------------------
  const ariPassword = (await secrets.get(SECRET_KEYS.ariPassword)) ?? '';
  const telephony: TelephonyPort =
    config.mode === 'simulation'
      ? new SimulatedTelephony({
          ownerPhone: config.ownerPhone,
          jarvisPhone: config.jarvisPhone,
          clock,
        })
      : new AsteriskTelephony({
          ownerPhone: config.ownerPhone,
          jarvisPhone: config.jarvisPhone,
          ariUrl: config.ari.url,
          ariUser: config.ari.user,
          ariPassword,
          appName: config.ari.app,
          trunkEndpoint: config.ari.trunkEndpoint,
          audioSocketBind: { host: config.ari.audioSocketHost, port: config.ari.audioSocketPort },
          codec: config.ari.codec,
          logger: logger.child('asterisk'),
          clock,
        });

  // ---- Gehirn -------------------------------------------------------------
  const registry = new ToolRegistry();
  const brain: Brain =
    opts.brain ??
    (config.mode === 'simulation'
      ? new ScriptedBrain([], registry, 'Ich bin im Simulationsbetrieb und habe kein Modell dahinter.')
      : new ClaudeAgentBrain({
          model: config.anthropic.model,
          logger: logger.child('brain'),
          registry,
          runQuery: () => {
            throw new Error(
              'Das Claude-Gehirn ist noch nicht verdrahtet. ' +
                'Der Adapter braucht einen API-Schluessel und ist als unverified markiert.',
            );
          },
        }));

  // ---- Gespraech und Scheduler -------------------------------------------
  let current: Conversation | null = null;

  const buildToolContext = (callId: CallId): Omit<ToolContext, 'onApprovalRequested' | 'onSensitiveMemory'> => ({
    callId,
    events,
    tasks,
    memories,
    engine,
    calendar,
    calendarIdempotency,
    audit,
    logger: logger.child('tools'),
    clock,
    providerAccounts: { email: mail.account, whatsapp: whatsapp.account },
  });

  const loginPinHash = (await secrets.get(SECRET_KEYS.loginPinHash)) ?? '';

  const runConversation = async (
    call: CallHandle,
    payload: CallJobPayload,
    event: InboundEvent | null,
  ): Promise<void> => {
    const callId = ids.next('cal') as CallId;
    const session = new VoiceSession({
      call,
      stt,
      tts,
      logger: logger.child('voice'),
      clock,
    });

    const conversation = new Conversation({
      call,
      session,
      brain,
      engine,
      audit,
      logger: logger.child('conversation'),
      clock,
      callId,
      timezone: config.behaviour.timezone,
      toolContext: buildToolContext(callId),
      ...(call.direction === 'inbound' && loginPinHash.length > 0
        ? {
            authenticator: new CallerAuthenticator(
              {
                ownerPhone: config.ownerPhone,
                loginPinHash,
                maxAttempts: 3,
                lockoutSeconds: 900,
              },
              clock,
            ),
          }
        : {}),
      ...(payload.reason === '' ? {} : { callReason: payload.reason }),
      ...(event === null ? {} : { initialEvents: [event] }),
    });

    current = conversation;
    try {
      await conversation.run();
    } finally {
      current = null;
      brain.reset();
    }
  };

  const scheduler = new CallScheduler({
    jobs,
    events,
    calls,
    telephony,
    audit,
    logger: logger.child('scheduler'),
    clock,
    config: {
      ownerPhone: config.ownerPhone,
      callOnEveryNewEmail: config.behaviour.callOnEveryNewEmail,
      callOnEveryNewWhatsapp: config.behaviour.callOnEveryNewWhatsapp,
      retrySeconds: config.behaviour.callRetrySeconds,
      maxCallsPerHour: config.behaviour.callMaxPerHour,
      maxAttempts: 2,
    },
    runConversation,
    activeConversation: () => current,
  });

  // Eingehende Anrufe.
  telephony.onIncomingCall(async (call) => {
    if (current !== null) {
      logger.warn('eingehender_anruf_waehrend_gespraech', {});
      await call.hangup('hangup_by_system');
      return;
    }
    const record = calls.start('inbound', config.ownerPhone);
    try {
      await runConversation(call, { eventId: '' as never, reason: '' }, null);
      calls.end(record.id, 'completed');
    } catch (err) {
      logger.error('eingehendes_gespraech_fehlgeschlagen', {
        error: err instanceof Error ? err.message : String(err),
      });
      calls.end(record.id, 'network_error');
    }
  });

  // ---- Healthchecks -------------------------------------------------------
  const health = buildHealthRegistry({
    db,
    jobs,
    events,
    telephony,
    stt,
    tts,
    mail,
    whatsapp,
    calendar,
    config,
  });

  return {
    db,
    clock,
    ids,
    logger,
    secrets,
    events,
    jobs,
    calls,
    tasks,
    memories,
    syncState,
    calendarIdempotency,
    audit,
    engine,
    telephony,
    stt,
    tts,
    mail,
    whatsapp,
    calendar,
    registry,
    scheduler,
    health,
    config,
    activeConversation: () => current,
    shutdown: async () => {
      scheduler.stop();
      await telephony.stop();
      // Audit-Eintraege werden nebenbei geschrieben - vor dem Schliessen
      // muessen sie durch sein, sonst reisst die Kette.
      await audit.flush();
      db.close();
      logger.info('beendet', { metrics: metricsSnapshot() });
    },
  };
}

/* -------------------------------------------------------------------------- */

function buildHealthRegistry(parts: {
  db: Db;
  jobs: JobQueue;
  events: EventStore;
  telephony: TelephonyPort;
  stt: SpeechToText;
  tts: TextToSpeech;
  mail: MailConnector;
  whatsapp: MessagingConnector;
  calendar: CalendarConnector;
  config: Config;
}): HealthRegistry {
  const registry = new HealthRegistry();

  registry.register(
    check('datenbank', true, async () => {
      try {
        parts.db.get('SELECT 1');
        return { status: 'ok', message: `Schema-Version ${schemaVersion(parts.db)}` };
      } catch (err) {
        return { status: 'down', message: err instanceof Error ? err.message : 'unbekannt' };
      }
    }),
  );

  registry.register(
    check('jobqueue', true, async () => {
      const dead = parts.jobs.countByState('call', 'DEAD_LETTER');
      const paused = parts.jobs.countByState('call', 'PAUSED');
      if (paused > 0) {
        return { status: 'degraded', message: `${paused} Anruf-Jobs sind pausiert (Stundenlimit?)` };
      }
      if (dead > 0) {
        return { status: 'degraded', message: `${dead} Anruf-Jobs im Dead-Letter-Status` };
      }
      return { status: 'ok', message: `${parts.jobs.countByState('call', 'PENDING')} Jobs warten` };
    }),
  );

  registry.register(
    check('offene_ereignisse', false, async () => {
      const n = parts.events.countOpen();
      return { status: 'ok', message: `${n} unbesprochene Nachrichten` };
    }),
  );

  registry.register(
    check('telefonie', true, async () => {
      const r = await parts.telephony.healthCheck();
      return { status: r.ok ? 'ok' : 'down', message: r.message };
    }),
  );

  registry.register(
    check('spracherkennung', true, async () => {
      const r = await parts.stt.healthCheck();
      return { status: r.ok ? 'ok' : 'down', message: r.message };
    }),
  );

  registry.register(
    check('sprachausgabe', true, async () => {
      const r = await parts.tts.healthCheck();
      return { status: r.ok ? 'ok' : 'down', message: r.message };
    }),
  );

  registry.register(
    check('postfach', true, async () => {
      const r = await parts.mail.healthCheck();
      return { status: r.ok ? 'ok' : 'down', message: r.message };
    }),
  );

  registry.register(
    check('whatsapp', false, async () => {
      const r = await parts.whatsapp.healthCheck();
      return { status: r.ok ? 'ok' : 'degraded', message: r.message };
    }),
  );

  registry.register(
    check('kalender', false, async () => {
      const r = await parts.calendar.healthCheck();
      return { status: r.ok ? 'ok' : 'degraded', message: r.message };
    }),
  );

  registry.register(
    check('speicherplatz', false, async () => {
      const { statfsSync } = await import('node:fs');
      try {
        const s = statfsSync('.');
        const freeGb = (s.bavail * s.bsize) / 1024 ** 3;
        if (freeGb < 0.5) return { status: 'down', message: `Nur noch ${freeGb.toFixed(1)} GB frei` };
        if (freeGb < 2) return { status: 'degraded', message: `Nur noch ${freeGb.toFixed(1)} GB frei` };
        return { status: 'ok', message: `${freeGb.toFixed(1)} GB frei` };
      } catch {
        return { status: 'degraded', message: 'Speicherplatz nicht ermittelbar' };
      }
    }),
  );

  registry.register(
    check('systemzeit', false, async () => {
      // Eine falsch gehende Uhr laesst Freigaben zu frueh verfallen und
      // Termine an der falschen Stelle landen.
      const drift = Math.abs(Date.now() - new Date().getTime());
      return drift < 1000
        ? { status: 'ok', message: `Zeitzone ${Intl.DateTimeFormat().resolvedOptions().timeZone}` }
        : { status: 'degraded', message: 'Systemzeit wirkt unplausibel' };
    }),
  );

  return registry;
}

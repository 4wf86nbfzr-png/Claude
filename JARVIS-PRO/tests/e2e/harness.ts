import type { CallId, InboundEvent } from '@jarvis/domain';
import { CallerAuthenticator, hashPin } from '@jarvis/security';
import { Logger, MemoryLogWriter } from '@jarvis/observability';
import { MockCalendarConnector, MockMailConnector, MockMessagingConnector } from '@jarvis/connectors';
import { MockTts, ScriptedStt } from '@jarvis/speech';
import {
  SimulatedCall,
  SimulatedTelephony,
  VoiceSession,
  silenceFrames,
  speechLike,
  toFrames,
} from '@jarvis/telephony';
import {
  ChatConversation,
  Conversation,
  ScriptedBrain,
  ToolRegistry,
  type ChatTurnOutcome,
  type ConversationOutcome,
  type ScriptedStep,
} from '@jarvis/orchestrator';
import {
  createHarness,
  type HarnessOptions,
  TEST_APPROVAL_PIN,
  TEST_LOGIN_PIN,
  TEST_OWNER_PHONE,
  type Harness,
} from '@jarvis/testkit';
import type { ChannelSender } from '@jarvis/approval-engine';

/**
 * End-to-End-Aufbau: ein vollstaendiger Jarvis mit simulierter Telefonie,
 * simulierten Sprachdiensten und nachgebauten Providern - aber mit der
 * echten Approval Engine, dem echten Eventstore, der echten Jobqueue und
 * dem echten Gespraechsablauf.
 *
 * Alles, was hier gruen ist, ist damit an der realen Verdrahtung geprueft
 * und nicht an einer Nachbildung davon.
 */
export interface E2eSetup {
  readonly base: Harness;
  readonly telephony: SimulatedTelephony;
  readonly mail: MockMailConnector;
  readonly whatsapp: MockMessagingConnector;
  readonly calendar: MockCalendarConnector;
  readonly logs: MemoryLogWriter;
  readonly logger: Logger;
  readonly registry: ToolRegistry;
  close(): Promise<void>;
}

/** Verdrahtet die nachgebauten Provider als Sender der Approval Engine. */
class ConnectorSender implements ChannelSender {
  constructor(
    readonly channel: 'email' | 'whatsapp',
    private readonly inner: { send(d: never, k: string): Promise<{ status: 'sent' | 'failed' | 'unknown'; providerMessageId: string | null; error: string | null }> },
  ) {}

  async send(
    draft: never,
    idempotencyKey: string,
  ): Promise<{ status: 'sent' | 'failed' | 'unknown'; providerMessageId: string | null; error: string | null }> {
    return this.inner.send(draft, idempotencyKey);
  }
}

export async function setupE2e(opts: HarnessOptions = {}): Promise<E2eSetup> {
  const base = await createHarness(opts);
  const logs = new MemoryLogWriter();
  const logger = new Logger({ writer: logs, level: 'debug', component: 'e2e' });

  const mail = new MockMailConnector();
  const whatsapp = new MockMessagingConnector();
  const calendar = new MockCalendarConnector('noah@hermserviceteam.com', base.clock);

  // Die echten Provider-Sender ersetzen die Aufzeichnungssender des
  // Basis-Harness - so laeuft der Versand durch dieselbe Kette wie spaeter live.
  base.senders.register(new ConnectorSender('email', mail));
  base.senders.register(new ConnectorSender('whatsapp', whatsapp));

  const telephony = new SimulatedTelephony({
    ownerPhone: TEST_OWNER_PHONE,
    jarvisPhone: '+4915199998888',
    clock: base.clock,
  });
  await telephony.start();

  return {
    base,
    telephony,
    mail,
    whatsapp,
    calendar,
    logs,
    logger,
    registry: new ToolRegistry(),
    close: async () => {
      await telephony.stop();
      await base.close();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Gespraech durchspielen                                                      */
/* -------------------------------------------------------------------------- */

export interface DialogueTurn {
  /** Was Noah sagt. */
  readonly say?: string;
  /** Was Noah per Tastatur eingibt. */
  readonly dtmf?: string;
  /** Schweigen statt Antwort. */
  readonly silent?: boolean;
}

export interface RunDialogueOptions {
  readonly setup: E2eSetup;
  readonly turns: readonly DialogueTurn[];
  readonly steps: readonly ScriptedStep[];
  readonly direction?: 'inbound' | 'outbound';
  readonly withAuth?: boolean;
  readonly loginPin?: string;
  readonly callReason?: string;
  readonly initialEvents?: readonly InboundEvent[];
  readonly silenceTimeoutMs?: number;
}

export interface DialogueResult {
  readonly outcome: ConversationOutcome;
  /** Alles, was Jarvis gesagt hat, in der Reihenfolge der Ausgabe. */
  readonly spoken: readonly string[];
  readonly call: SimulatedCall;
  readonly brain: ScriptedBrain;
}

/**
 * Spielt ein Gespraech durch. Noahs Beitraege werden als echtes Audio in den
 * Anruf geschoben; die Erkennung liefert die vorgegebenen Saetze. Damit
 * durchlaeuft der Test dieselbe Kette wie ein echtes Gespraech - VAD,
 * Aufnahme, Erkennung, Gehirn, Ausgabe.
 */
export async function runDialogue(opts: RunDialogueOptions): Promise<DialogueResult> {
  const { setup } = opts;
  const direction = opts.direction ?? 'outbound';

  const utterances = opts.turns.filter((t) => t.say !== undefined).map((t) => t.say ?? '');
  const stt = new ScriptedStt(utterances);
  const tts = new MockTts();

  const call = new SimulatedCall(
    `e2e-${direction}`,
    direction,
    direction === 'inbound' ? TEST_OWNER_PHONE : TEST_OWNER_PHONE,
    {},
  );
  call.settleAnswer({ answered: true });

  const session = new VoiceSession({
    call,
    stt,
    tts,
    logger: setup.logger,
    clock: setup.base.clock,
    preRollMs: 200,
    postRollMs: 100,
    bargeInMs: 120,
  });

  const brain = new ScriptedBrain(opts.steps, setup.registry);
  const callId = `cal_e2e_${direction}` as CallId;

  const authenticator =
    opts.withAuth === true
      ? new CallerAuthenticator(
          {
            ownerPhone: TEST_OWNER_PHONE,
            loginPinHash: await hashPin(TEST_LOGIN_PIN),
            maxAttempts: 3,
            lockoutSeconds: 300,
          },
          setup.base.clock,
        )
      : undefined;

  const conversation = new Conversation({
    call,
    session,
    brain,
    engine: setup.base.engine,
    audit: setup.base.audit,
    logger: setup.logger,
    clock: setup.base.clock,
    callId,
    timezone: 'Europe/Berlin',
    // Kurze Fristen: der Ablauf ist ereignisgesteuert, die Timeouts sind hier
    // nur die Notbremse gegen ein haengendes Gespraech.
    silenceTimeoutMs: opts.silenceTimeoutMs ?? 400,
    dtmfTimeoutMs: 2000,
    toolContext: {
      callId,
      events: setup.base.events,
      tasks: setup.base.tasks,
      memories: setup.base.memories,
      engine: setup.base.engine,
      calendar: setup.calendar,
      calendarIdempotency: setup.base.calendarIdempotency,
      audit: setup.base.audit,
      logger: setup.logger,
      clock: setup.base.clock,
      providerAccounts: { email: setup.mail.account, whatsapp: setup.whatsapp.account },
    },
    ...(authenticator === undefined ? {} : { authenticator }),
    ...(opts.callReason === undefined ? {} : { callReason: opts.callReason }),
    ...(opts.initialEvents === undefined ? {} : { initialEvents: opts.initialEvents }),
  });

  /**
   * Noahs Beitraege einspielen.
   *
   * Bewusst nicht nach Wanduhrzeit, sondern an `session.awaitingUtterance`
   * aufgehaengt: Noah antwortet, wenn Jarvis fertig gesprochen hat und auf
   * eine Antwort wartet. Ein Feeder nach Stoppuhr wuerde entweder in die
   * laufende Ansage hineinreden (und Barge-in ausloesen, wo keiner gemeint
   * ist) oder zu spaet kommen - beides macht den Test wackelig statt aussagekraeftig.
   */
  const feeder = (async (): Promise<void> => {
    for (const turn of opts.turns) {
      if (!call.active) return;

      if (turn.dtmf !== undefined) {
        // DTMF darf vorab in der Warteschlange liegen - collectDtmf holt es ab,
        // sobald der Ablauf danach fragt.
        call.pressDtmf(turn.dtmf);
        continue;
      }

      if (turn.silent === true) {
        // Nichts einspielen: der Ablauf laeuft in seinen Stille-Timeout.
        await delay(600);
        continue;
      }

      if (!(await waitFor(() => session.awaitingUtterance, 5000))) return;

      // Der Fortschritt haengt an der VERBRAUCHTEN Aeusserung, nicht daran, ob
      // gerade jemand zuhoert: der Ablauf registriert nach dem Annehmen einer
      // Antwort sofort den naechsten Warteschritt, sodass `awaitingUtterance`
      // faktisch nie auf false faellt. Der Zaehler der Erkennung ist das
      // eindeutige Signal.
      const remainingBefore = stt.remaining;
      await feedFrames(call, toFrames(speechLike(600)));
      await feedFrames(call, silenceFrames(1000));
      if (!(await waitFor(() => stt.remaining < remainingBefore, 5000))) return;
    }
  })();

  const outcome = await conversation.run();
  await call.hangup('completed');
  await feeder.catch(() => undefined);
  session.close();

  return { outcome, spoken: [...tts.spoken], call, brain };
}

/**
 * Wartet, bis eine Bedingung eintritt. `abortIf` bricht vorzeitig ab - fuer
 * den Fall, dass gar nicht mehr auf eine Antwort gewartet wird.
 */
async function waitFor(
  cond: () => boolean,
  timeoutMs: number,
  abortIf?: () => boolean,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    if (abortIf?.() === true) return true;
    await delay(2);
  }
  return false;
}

async function feedFrames(call: SimulatedCall, frames: Int16Array[]): Promise<void> {
  for (const f of frames) {
    if (!call.active) return;
    call.pushInboundAudio(f);
    await Promise.resolve();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export { TEST_APPROVAL_PIN, TEST_LOGIN_PIN, TEST_OWNER_PHONE };

/* -------------------------------------------------------------------------- */
/* Chat durchspielen                                                           */
/* -------------------------------------------------------------------------- */

/** Noahs WhatsApp-Nummer im Test - ohne Plus, so wie Meta sie liefert. */
export const TEST_OWNER_WA_ID = '4915112345678';

export interface ChatRun {
  readonly chat: ChatConversation;
  /** Alles, was Jarvis an Noah geschickt hat, in der Reihenfolge des Versands. */
  readonly sent: string[];
  readonly brain: ScriptedBrain;
  /** Schickt eine Nachricht von Noah und gibt zurueck, was dabei herauskam. */
  send(text: string): Promise<ChatTurnOutcome>;
}

export interface MakeChatOptions {
  readonly setup: E2eSetup;
  readonly steps: readonly ScriptedStep[];
  readonly requireLoginPin?: boolean;
  readonly loginPinHash?: string;
  /** Laesst den Versand an Noah scheitern - fuer den Fall "Fenster zu". */
  readonly deliveryFails?: () => boolean;
}

/**
 * Baut einen Jarvis, der ueber den Chat bedient wird.
 *
 * Anders als beim Telefon gibt es hier keinen Feeder und keine Stoppuhr: eine
 * Nachricht geht hinein, die Antworten kommen heraus. Genau das ist der Punkt
 * des Entwurfs - der Ablauf haelt nichts im Speicher, also laesst er sich
 * Nachricht fuer Nachricht pruefen.
 */
export function makeChat(opts: MakeChatOptions): ChatRun {
  const { setup } = opts;
  const sent: string[] = [];
  const brain = new ScriptedBrain(opts.steps, setup.registry);

  const chat = new ChatConversation({
    brain,
    engine: setup.base.engine,
    approvals: setup.base.approvals,
    sessions: setup.base.chatSessions,
    audit: setup.base.audit,
    logger: setup.logger,
    clock: setup.base.clock,
    deliver: async (text: string) => {
      if (opts.deliveryFails?.() === true) {
        throw new Error('Antwortfenster ist zu - freier Text nicht zulaessig');
      }
      sent.push(text);
    },
    ownerWaId: TEST_OWNER_WA_ID,
    timezone: 'Europe/Berlin',
    config: {
      idleMinutes: 60,
      requireLoginPin: opts.requireLoginPin ?? false,
      ...(opts.loginPinHash === undefined ? {} : { loginPinHash: opts.loginPinHash }),
      maxAnnouncementsPerTurn: 3,
      secondFactorLabel: 'deine Freigabe-PIN',
    },
    toolContext: {
      events: setup.base.events,
      tasks: setup.base.tasks,
      memories: setup.base.memories,
      engine: setup.base.engine,
      calendar: setup.calendar,
      calendarIdempotency: setup.base.calendarIdempotency,
      audit: setup.base.audit,
      logger: setup.logger,
      clock: setup.base.clock,
      providerAccounts: { email: setup.mail.account, whatsapp: setup.whatsapp.account },
    },
  });

  return {
    chat,
    sent,
    brain,
    send: (text: string) => chat.handleMessage(TEST_OWNER_WA_ID, text),
  };
}

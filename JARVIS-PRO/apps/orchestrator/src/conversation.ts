import {
  unwrapForDisplay,
  type CallId,
  type Clock,
  type DraftId,
  type EventId,
  type InboundEvent,
} from '@jarvis/domain';
import { AuditLog, CallerAuthenticator, type PinPrompt } from '@jarvis/security';
import { metrics, type Logger } from '@jarvis/observability';
import type { CallHandle, VoiceSession } from '@jarvis/telephony';
import { ApprovalError, type ApprovalEngine } from '@jarvis/approval-engine';
import type { Brain } from './brain.js';
import { FIRST_UTTERANCE_DE, buildEventAnnouncement, type PromptContext } from './prompt.js';
import type { ToolContext } from './tools.js';

/**
 * Der Gespraechsablauf.
 *
 * Diese Klasse - nicht das Sprachmodell - treibt alles, was verbindlich ist:
 * den ersten Satz, die Authentifizierung, die Ansage neuer Ereignisse und vor
 * allem den Freigabeablauf. Das Modell darf im Rahmen dieses Ablaufs frei
 * formulieren, aber es kann ihn nicht abkuerzen: `request_approval` setzt nur
 * ein Flag, den Rest macht `runApprovalSequence()`.
 */
export interface ConversationDeps {
  readonly call: CallHandle;
  readonly session: VoiceSession;
  readonly brain: Brain;
  readonly engine: ApprovalEngine;
  readonly audit: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly callId: CallId;
  readonly toolContext: Omit<ToolContext, 'onApprovalRequested' | 'onSensitiveMemory'>;
  readonly authenticator?: CallerAuthenticator;
  /** Anlass eines proaktiven Anrufs. */
  readonly callReason?: string;
  /** Ereignisse, die in diesem Gespraech genannt werden sollen. */
  readonly initialEvents?: readonly InboundEvent[];
  readonly timezone: string;
  /** Wie lange auf eine Antwort gewartet wird, bevor nachgehakt wird. */
  readonly silenceTimeoutMs?: number;
  /** Wie lange auf die DTMF-Eingabe gewartet wird. */
  readonly dtmfTimeoutMs?: number;
}

export interface ConversationOutcome {
  readonly authenticated: boolean;
  readonly turns: number;
  readonly announcedEventIds: readonly EventId[];
  readonly approvalsRun: number;
  readonly sendsExecuted: number;
  readonly endedBecause: 'hangup' | 'silence' | 'auth_failed' | 'error' | 'completed';
}

const DEFAULT_SILENCE_TIMEOUT_MS = 25_000;
const DEFAULT_DTMF_TIMEOUT_MS = 20_000;
const MAX_TURNS = 200;

export class Conversation {
  private readonly pendingApprovals: DraftId[] = [];
  private readonly pendingSensitiveMemory: { subject: string; fact: string }[] = [];
  private readonly announced: EventId[] = [];
  private readonly queuedEvents: InboundEvent[] = [];
  private approvalsRun = 0;
  private sendsExecuted = 0;
  private turns = 0;
  private ended = false;

  private readonly silenceTimeoutMs: number;
  private readonly dtmfTimeoutMs: number;

  constructor(private readonly deps: ConversationDeps) {
    this.queuedEvents.push(...(deps.initialEvents ?? []));
    this.silenceTimeoutMs = deps.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS;
    this.dtmfTimeoutMs = deps.dtmfTimeoutMs ?? DEFAULT_DTMF_TIMEOUT_MS;
  }

  /**
   * Reiht ein Ereignis in das laufende Gespraech ein. Wird vom Scheduler
   * genutzt: waehrend eines Gespraechs wird kein zweiter Anruf gestartet,
   * das neue Ereignis kommt hier hinein und wird nach dem aktuellen
   * Gespraechspunkt angekuendigt.
   */
  enqueueEvent(event: InboundEvent): void {
    if (this.announced.includes(event.id)) return;
    if (this.queuedEvents.some((e) => e.id === event.id)) return;
    this.queuedEvents.push(event);
    this.deps.logger.info('ereignis_ins_gespraech_eingereiht', { eventId: event.id });
  }

  get pendingEventCount(): number {
    return this.queuedEvents.length;
  }

  async run(): Promise<ConversationOutcome> {
    const { call, session, logger } = this.deps;
    call.onHangup(() => {
      this.ended = true;
    });

    // ---- Authentifizierung -------------------------------------------------
    if (this.deps.authenticator !== undefined && call.direction === 'inbound') {
      const authed = await this.authenticate();
      if (!authed) {
        return this.outcome(false, 'auth_failed');
      }
    }

    session.start();

    // ---- Erster Satz, wortgetreu ------------------------------------------
    await session.speak(FIRST_UTTERANCE_DE);

    // Die Antwort auf die Pflichtfrage wird abgewartet, bevor der Anlass
    // genannt wird. Das ist die geforderte Reihenfolge.
    const firstAnswer = await session.nextUtterance(this.silenceTimeoutMs);
    if (firstAnswer === null) {
      if (!call.active) return this.outcome(true, 'hangup');
      await session.speak('Ich hoere dich nicht. Ich melde mich spaeter noch einmal.');
      await call.hangup('completed');
      return this.outcome(true, 'silence');
    }
    this.turns += 1;

    await this.handleUtterance(firstAnswer.text);

    // ---- Hauptschleife -----------------------------------------------------
    while (!this.ended && call.active && this.turns < MAX_TURNS) {
      // Erst offene Pflichtablaeufe abarbeiten, dann weiterreden.
      if (this.pendingApprovals.length > 0) {
        const draftId = this.pendingApprovals.shift();
        if (draftId !== undefined) await this.runApprovalSequence(draftId);
        continue;
      }
      if (this.pendingSensitiveMemory.length > 0) {
        const item = this.pendingSensitiveMemory.shift();
        if (item !== undefined) await this.confirmSensitiveMemory(item);
        continue;
      }
      if (this.queuedEvents.length > 0) {
        const event = this.queuedEvents.shift();
        if (event !== undefined) await this.announceEvent(event);
        continue;
      }

      const utterance = await session.nextUtterance(this.silenceTimeoutMs);
      if (utterance === null) {
        if (!call.active) break;
        await session.speak('Sonst noch was?');
        const second = await session.nextUtterance(this.silenceTimeoutMs);
        if (second === null) {
          await session.speak('Alles klar. Bis dann, mein Achi.');
          await call.hangup('completed');
          break;
        }
        this.turns += 1;
        await this.handleUtterance(second.text);
        continue;
      }

      this.turns += 1;
      if (isGoodbye(utterance.text)) {
        await session.speak('Alles klar. Bis dann, mein Achi.');
        await call.hangup('completed');
        break;
      }
      await this.handleUtterance(utterance.text);
    }

    logger.info('gespraech_beendet', {
      callId: this.deps.callId,
      turns: this.turns,
      approvals: this.approvalsRun,
      sends: this.sendsExecuted,
    });
    return this.outcome(true, this.ended ? 'hangup' : 'completed');
  }

  /* --------------------------------------------------------------------- */
  /* Authentifizierung                                                      */
  /* --------------------------------------------------------------------- */

  private async authenticate(): Promise<boolean> {
    const { call, deps } = { call: this.deps.call, deps: this.deps };
    const prompt: PinPrompt = {
      collectPin: async (maxDigits, timeoutMs) => {
        await this.speakRaw('Moin. Bitte gib deine PIN ein und bestaetige mit der Rautetaste.');
        return call.collectDtmf(maxDigits, timeoutMs);
      },
    };

    const result = await deps.authenticator?.authenticateInbound(call.callerId, prompt);
    if (result === undefined) return false;

    if (result.ok) {
      void deps.audit.record('auth.pin.ok', deps.callId, { direction: 'inbound' });
      void deps.audit.record('call.inbound.accepted', deps.callId, {});
      metrics.callsReceived.inc({});
      return true;
    }

    void deps.audit.record(
      result.reason === 'not_allowlisted' ? 'call.inbound.rejected' : 'auth.pin.failed',
      deps.callId,
      { reason: result.reason },
    );
    deps.logger.warn('anruf_abgewiesen', { callId: deps.callId, reason: result.reason });

    // Bei einer nicht zugelassenen Nummer wird nichts verraten - kein Hinweis
    // darauf, dass es hier ueberhaupt etwas zu erreichen gibt.
    await this.speakRaw('Kein Anschluss unter dieser Nummer.');
    await call.hangup(result.reason === 'not_allowlisted' ? 'not_allowlisted' : 'auth_failed');
    return false;
  }

  /**
   * Sprechen vor dem Start der Sprachsitzung (waehrend der PIN-Abfrage laeuft
   * die Erkennung noch nicht).
   */
  private async speakRaw(text: string): Promise<void> {
    await this.deps.session.speak(text);
  }

  /* --------------------------------------------------------------------- */
  /* Gespraechszug                                                          */
  /* --------------------------------------------------------------------- */

  private async handleUtterance(text: string): Promise<void> {
    const t0 = Date.now();
    const result = await this.deps.brain.turn({
      utterance: text,
      promptContext: this.promptContext(),
      toolContext: this.toolContext(),
    });
    metrics.turnLatencyMs.observe(Date.now() - t0);

    this.deps.logger.info('gespraechszug', {
      callId: this.deps.callId,
      tools: result.toolsUsed,
      turnMs: Date.now() - t0,
    });

    if (result.speech.trim().length > 0) {
      await this.deps.session.speak(result.speech);
    }
  }

  private promptContext(): PromptContext {
    return {
      nowIso: this.deps.clock.nowIso(),
      timezone: this.deps.timezone,
      openEventCount: this.deps.toolContext.events.countOpen(),
      openTaskCount: this.deps.toolContext.tasks.open().length,
      callReason: this.deps.callReason ?? null,
      memorySummary: this.deps.toolContext.memories
        .all()
        .slice(-8)
        .map((m) => `${m.subject}: ${m.fact}`),
    };
  }

  private toolContext(): ToolContext {
    return {
      ...this.deps.toolContext,
      onApprovalRequested: (draftId) => {
        this.pendingApprovals.push(draftId);
      },
      onSensitiveMemory: (subject, fact) => {
        this.pendingSensitiveMemory.push({ subject, fact });
      },
    };
  }

  /* --------------------------------------------------------------------- */
  /* Ereignisansage                                                         */
  /* --------------------------------------------------------------------- */

  private async announceEvent(event: InboundEvent): Promise<void> {
    const { session, toolContext } = this.deps;

    const summary = shortSummary(event);
    await session.speak(
      buildEventAnnouncement({
        channel: event.channel,
        sender: unwrapForDisplay(event.senderDisplay),
        subject: event.subject === null ? null : unwrapForDisplay(event.subject),
        urgency: event.urgency,
        summary,
      }),
    );
    this.announced.push(event.id);
    toolContext.events.markAnnounced(event.id);

    const answer = await session.nextUtterance(this.silenceTimeoutMs);
    if (answer === null) return;
    this.turns += 1;

    if (isYes(answer.text)) {
      // Der volle Text laeuft ueber das Gehirn, damit die Isolation greift
      // und der Inhalt nie ungeprueft in die Ausgabe faellt.
      await this.handleUtterance(`Lies mir die Nachricht ${event.id} vollstaendig vor.`);
    } else {
      await this.handleUtterance(answer.text);
    }
    toolContext.events.markHandled(event.id);
  }

  /* --------------------------------------------------------------------- */
  /* Freigabeablauf - der verbindliche Teil                                 */
  /* --------------------------------------------------------------------- */

  /**
   * Der Freigabeablauf. Er laeuft immer vollstaendig und immer in dieser
   * Reihenfolge. Kein Zweig fuehrt an einem Schritt vorbei; jeder Ausstieg
   * endet damit, dass NICHTS gesendet wurde.
   */
  private async runApprovalSequence(draftId: DraftId): Promise<void> {
    const { session, engine, logger } = this.deps;
    this.approvalsRun += 1;

    let approvalId;
    let script;
    try {
      const requested = engine.requestApproval(draftId, this.deps.callId);
      approvalId = requested.approval.id;
      script = requested.script;
    } catch (err) {
      await session.speak(spokenError(err));
      return;
    }

    // 1. Vollstaendig vorlesen. Wird dabei unterbrochen, gilt der Read-back
    //    NICHT als erfolgt - und ohne Read-back gibt es keine Freigabe.
    const readBack = await session.speak(script.full);
    if (!readBack.completed) {
      logger.info('read_back_unterbrochen', { approvalId });
      engine.cancel(approvalId, 'read_back_unterbrochen');
      await session.speak('Ich habe dich unterbrochen gehoert. Es wurde nichts gesendet. Was moechtest du aendern?');
      const correction = await session.nextUtterance(this.silenceTimeoutMs);
      if (correction !== null) {
        this.turns += 1;
        await this.handleUtterance(correction.text);
      }
      return;
    }

    try {
      engine.markReadBackComplete(approvalId, script.full);
      engine.awaitApproval(approvalId);
    } catch (err) {
      await session.speak(spokenError(err));
      return;
    }

    // 2. Die Frage - wortgetreu.
    await session.speak(script.question);

    const answer = await session.nextUtterance(this.silenceTimeoutMs);
    if (answer === null) {
      engine.cancel(approvalId, 'keine_antwort');
      await session.speak('Ich habe keine Antwort gehoert. Es wurde nichts gesendet.');
      return;
    }
    this.turns += 1;

    // 3. Sprachbestaetigung. Ein blosses "ja" reicht nicht.
    let voiceOk = false;
    try {
      voiceOk = engine.confirmVoice(approvalId, answer.text).accepted;
    } catch (err) {
      await session.speak(spokenError(err));
      return;
    }

    if (!voiceOk) {
      engine.cancel(approvalId, 'keine_gueltige_bestaetigung');
      await session.speak(
        'Das war keine gueltige Bestaetigung. Zum Senden brauche ich ausdruecklich "Ja, senden". ' +
          'Es wurde nichts gesendet.',
      );
      // Noah darf jetzt korrigieren oder etwas anderes wollen.
      await this.handleUtterance(answer.text);
      return;
    }

    // 4. Freigabe-PIN.
    await session.speak('Gib bitte deine Freigabe-PIN ein und bestaetige mit der Rautetaste.');
    const digits = await this.deps.call.collectDtmf(12, this.dtmfTimeoutMs);

    let pinOk = false;
    try {
      pinOk = (await engine.confirmPin(approvalId, digits)).accepted;
    } catch (err) {
      await session.speak(spokenError(err));
      return;
    }

    if (!pinOk) {
      engine.cancel(approvalId, 'pin_falsch');
      await session.speak('Die PIN war nicht richtig. Es wurde nichts gesendet.');
      return;
    }

    // 5. Versand.
    try {
      const result = await engine.execute(approvalId);
      if (result.status === 'sent') this.sendsExecuted += 1;
      await session.speak(result.spokenDe);
    } catch (err) {
      await session.speak(spokenError(err));
    }
  }

  /* --------------------------------------------------------------------- */
  /* Heikle Erinnerungen                                                    */
  /* --------------------------------------------------------------------- */

  private async confirmSensitiveMemory(item: { subject: string; fact: string }): Promise<void> {
    const { session, toolContext, audit } = this.deps;
    await session.speak(
      `Das ist eine heikle Information. Soll ich mir dauerhaft merken: ${item.subject}, ${item.fact}? ` +
        'Sag ja oder nein.',
    );
    const answer = await session.nextUtterance(this.silenceTimeoutMs);
    if (answer === null) {
      await session.speak('Ich habe nichts gespeichert.');
      return;
    }
    this.turns += 1;

    if (!isYes(answer.text)) {
      await session.speak('Alles klar, ich speichere das nicht.');
      return;
    }
    const stored = toolContext.memories.store(
      {
        subject: item.subject,
        fact: item.fact,
        sensitivity: 'sensitive',
        sourceRef: `call:${this.deps.callId}`,
      },
      answer.text,
    );
    void audit.record('memory.stored', stored.id, { subject: stored.subject, sensitivity: 'sensitive' });
    await session.speak('Gespeichert.');
  }

  /* --------------------------------------------------------------------- */

  private outcome(authenticated: boolean, endedBecause: ConversationOutcome['endedBecause']): ConversationOutcome {
    return {
      authenticated,
      turns: this.turns,
      announcedEventIds: this.announced,
      approvalsRun: this.approvalsRun,
      sendsExecuted: this.sendsExecuted,
      endedBecause,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Hilfsmittel                                                                 */
/* -------------------------------------------------------------------------- */

function spokenError(err: unknown): string {
  if (err instanceof ApprovalError) return err.spokenDe;
  return 'Da ist technisch etwas schiefgegangen. Es wurde nichts gesendet.';
}

const YES = /^(ja|jo|jau|klar|gerne|bitte|mach das|unbedingt|ja bitte|ja gerne|jepp|genau)\b/i;
const GOODBYE = /\b(tschuess|tschau|ciao|bis dann|bis spaeter|bis später|auf wiederhoeren|auf wiederhören|danke das wars|das war.?s|leg auf|auflegen)\b/i;

export function isYes(text: string): boolean {
  return YES.test(text.trim());
}

export function isGoodbye(text: string): boolean {
  return GOODBYE.test(text.trim());
}

/** Sehr kurze Zusammenfassung fuer die Ansage. Nur aus der Vorschau, nie erfunden. */
function shortSummary(event: InboundEvent): string {
  const preview = unwrapForDisplay(event.preview).replace(/\s+/g, ' ').trim();
  if (preview.length === 0) return 'Inhalt liegt mir noch nicht vor.';
  const cut = preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
  return `Kurz gesagt: ${cut}`;
}

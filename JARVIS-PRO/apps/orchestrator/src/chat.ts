import {
  unwrapForDisplay,
  type ApprovalId,
  type CallId,
  type Clock,
  type DraftId,
  type EventId,
  type InboundEvent,
} from '@jarvis/domain';
import type { AuditLog } from '@jarvis/security';
import { verifyPin } from '@jarvis/security';
import { metrics, type Logger } from '@jarvis/observability';
import type { ApprovalRepository, ChatSessionRepository } from '@jarvis/storage';
import { ApprovalError, type ApprovalEngine } from '@jarvis/approval-engine';
import type { Brain } from './brain.js';
import { FIRST_UTTERANCE_DE, buildEventAnnouncement, type PromptContext } from './prompt.js';
import type { ToolContext } from './tools.js';

/**
 * Der Gespraechsablauf im Chat.
 *
 * Das Gegenstueck zu `Conversation`, aber mit einem grundlegend anderen
 * Lebenslauf: ein Anruf ist ein laufender Prozess, ein Chat ist eine Folge
 * einzelner HTTP-Anfragen. Zwischen zwei Nachrichten kann eine Stunde liegen,
 * ein Neustart, ein Umzug auf einen anderen Rechner.
 *
 * Daraus folgt die wichtigste Entwurfsentscheidung: **dieser Ablauf haelt
 * keinen Zustand im Speicher.** Wo eine Freigabe steht, steht in der
 * Datenbank; was Noah noch nicht weiss, ergibt sich aus den offenen
 * Ereignissen. Ein Neustart mitten im Freigabeablauf verliert deshalb nichts
 * und - wichtiger - erlaubt auch nichts: eine halb bestaetigte Freigabe
 * bleibt halb bestaetigt und laeuft ab, statt in einem unklaren Zustand
 * weiterzugelten.
 *
 * Die fuenf Bedingungen fuer einen Versand sind dieselben wie am Telefon.
 * Nur zwei Dinge sehen anders aus:
 *
 *   - Der Read-back wird geschrieben statt vorgelesen. Er gilt als erfolgt,
 *     wenn die Nachricht nachweislich rausgegangen ist; scheitert der
 *     Versand, wird die Freigabe verworfen. Was Noah nicht gelesen hat, kann
 *     er nicht freigegeben haben.
 *   - Der zweite Faktor wird getippt statt gewaehlt. Dass eine getippte PIN
 *     im Verlauf stehen bleibt, ist eine echte Schwaeche - deshalb laesst
 *     sich stattdessen ein Einmalcode einstellen (siehe
 *     `ApprovalEngineConfig.approvalTotpSecret`).
 */
export interface ChatDeps {
  readonly brain: Brain;
  readonly engine: ApprovalEngine;
  readonly approvals: ApprovalRepository;
  readonly sessions: ChatSessionRepository;
  readonly audit: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly toolContext: Omit<ToolContext, 'callId' | 'onApprovalRequested' | 'onSensitiveMemory'>;
  /**
   * Sendet eine Nachricht an Noah. Wirft, wenn nichts rausging - der Ablauf
   * verlaesst sich darauf, dass ein erfolgreicher Aufruf bedeutet: die
   * Nachricht ist beim Provider angenommen.
   */
  readonly deliver: (text: string) => Promise<void>;
  /** WhatsApp-Nummer von Noah. Nur von dieser Nummer werden Befehle angenommen. */
  readonly ownerWaId: string;
  readonly timezone: string;
  readonly config: ChatConfig;
}

export interface ChatConfig {
  /** Nach dieser Pause beginnt ein neuer Gespraechsabschnitt. */
  readonly idleMinutes: number;
  /**
   * Anmelde-PIN auch im Chat verlangen.
   *
   * Standard aus: eine WhatsApp-Identitaet ist deutlich schwerer zu faelschen
   * als eine Rufnummernanzeige, gegen die die PIN am Telefon schuetzt. Wer
   * das Konto uebernommen hat, liest die PIN ohnehin im Verlauf mit - sie
   * wuerde dann Aufwand erzeugen, ohne etwas abzuwehren.
   */
  readonly requireLoginPin: boolean;
  /** Hash der Anmelde-PIN. Nur noetig, wenn `requireLoginPin` gesetzt ist. */
  readonly loginPinHash?: string;
  /** Wie viele Ereignisse hoechstens auf einmal angekuendigt werden. */
  readonly maxAnnouncementsPerTurn: number;
  /** Wie der zweite Faktor gegenueber Noah genannt wird. */
  readonly secondFactorLabel: string;
}

export interface ChatTurnOutcome {
  readonly handled: boolean;
  readonly sessionRef: CallId;
  readonly repliesSent: number;
  readonly announcedEventIds: readonly EventId[];
  readonly approvalStep:
    | 'keiner'
    | 'read_back_gesendet'
    | 'bestaetigung_akzeptiert'
    | 'bestaetigung_abgelehnt'
    | 'faktor_akzeptiert'
    | 'faktor_abgelehnt'
    | 'abgebrochen'
    | 'gesendet'
    | 'versand_fehlgeschlagen';
  readonly rejected: 'fremde_nummer' | 'pin_falsch' | null;
}

const MAX_FAILED_LOGINS = 5;

export class ChatConversation {
  constructor(private readonly deps: ChatDeps) {}

  /* --------------------------------------------------------------------- */
  /* Eingehende Nachricht                                                   */
  /* --------------------------------------------------------------------- */

  /**
   * Verarbeitet genau eine eingehende Nachricht von Noah.
   *
   * Der ganze Ablauf steckt in dieser Methode, weil es im Chat keine
   * Schleife gibt: eine Nachricht kommt herein, etwas geht hinaus, fertig.
   * Alles, was ueber diesen Moment hinaus gilt, liegt in der Datenbank.
   */
  async handleMessage(fromWaId: string, text: string): Promise<ChatTurnOutcome> {
    const { sessions, logger, config } = this.deps;

    if (!sameNumber(fromWaId, this.deps.ownerWaId)) {
      // Kein Hinweis darauf, dass es hier ueberhaupt etwas zu erreichen gibt.
      void this.deps.audit.record('chat.session.rejected', fromWaId, { grund: 'fremde_nummer' });
      logger.warn('chat_fremde_nummer', {});
      return this.outcome(asChatRef(fromWaId), 0, [], 'keiner', 'fremde_nummer');
    }

    const { session, isNew } = sessions.openOrContinue(fromWaId, config.idleMinutes);
    void this.deps.audit.record('chat.message.received', session.sessionRef, {
      laenge: text.length,
      neuerAbschnitt: isNew,
    });

    let replies = 0;

    if (isNew) {
      void this.deps.audit.record('chat.session.opened', session.sessionRef, {});
      // Der Pflichtsatz steht am Anfang jedes Abschnitts, wortgetreu -
      // genauso wie am Telefon am Anfang jedes Anrufs.
      replies += await this.say(fromWaId, FIRST_UTTERANCE_DE);
    }

    // ---- Anmeldung -------------------------------------------------------
    if (config.requireLoginPin && session.authenticatedAt === null) {
      const angemeldet = await this.tryLogin(fromWaId, text);
      if (!angemeldet.ok) {
        replies += angemeldet.replies;
        return this.outcome(session.sessionRef, replies, [], 'keiner', 'pin_falsch');
      }
      replies += angemeldet.replies;
      // Die PIN war die Nachricht - es gibt nichts weiter zu verarbeiten.
      return this.outcome(session.sessionRef, replies, [], 'keiner', null);
    }

    // ---- Laufende Freigabe hat Vorrang ------------------------------------
    const live = this.deps.approvals.liveForCall(session.sessionRef);
    if (live !== null) {
      const schritt = await this.continueApproval(fromWaId, live.id, text);
      return this.outcome(session.sessionRef, replies + schritt.replies, [], schritt.step, null);
    }

    if (isAbort(text)) {
      replies += await this.say(fromWaId, 'Es lief gerade nichts, was ich haette abbrechen koennen.');
      return this.outcome(session.sessionRef, replies, [], 'keiner', null);
    }

    // ---- Normaler Gespraechszug -------------------------------------------
    const angefordert: DraftId[] = [];
    const heikel: { subject: string; fact: string }[] = [];
    const t0 = Date.now();

    const result = await this.deps.brain.turn({
      utterance: text,
      promptContext: this.promptContext(),
      toolContext: {
        ...this.deps.toolContext,
        callId: session.sessionRef,
        onApprovalRequested: (draftId) => angefordert.push(draftId),
        onSensitiveMemory: (subject, fact) => heikel.push({ subject, fact }),
      },
    });
    metrics.turnLatencyMs.observe(Date.now() - t0);
    logger.info('chat_zug', { sessionRef: session.sessionRef, tools: result.toolsUsed });

    if (result.speech.trim().length > 0) {
      replies += await this.say(fromWaId, result.speech);
    }

    // Heikle Erinnerungen werden im Chat nicht stillschweigend gespeichert.
    // Der Chat kennt keine Rueckfrage im laufenden Zug, also wird gar nicht
    // gespeichert und stattdessen gesagt, was zu tun ist.
    for (const item of heikel) {
      replies += await this.say(
        fromWaId,
        `Das halte ich fuer heikel: "${item.subject}: ${item.fact}". Ich habe es NICHT gespeichert. ` +
          'Wenn ich es mir merken soll, schreib mir das ausdruecklich.',
      );
    }

    // ---- Freigabe beginnen -------------------------------------------------
    const ersterEntwurf = angefordert[0];
    if (ersterEntwurf !== undefined) {
      const start = await this.startApproval(fromWaId, session.sessionRef, ersterEntwurf);
      return this.outcome(session.sessionRef, replies + start.replies, [], start.step, null);
    }

    // ---- Rueckstau nachreichen ---------------------------------------------
    const angekuendigt = await this.announceOpenEvents(fromWaId);
    return this.outcome(
      session.sessionRef,
      replies + angekuendigt.replies,
      angekuendigt.eventIds,
      'keiner',
      null,
    );
  }

  /* --------------------------------------------------------------------- */
  /* Proaktive Meldung                                                      */
  /* --------------------------------------------------------------------- */

  /**
   * Meldet offene Ereignisse von sich aus.
   *
   * Wird vom Worker gerufen, wenn etwas hereinkommt. Schlaegt der Versand
   * fehl - typischerweise, weil das Antwortfenster von WhatsApp zu ist -,
   * passiert nichts weiter: die Ereignisse bleiben offen und werden
   * nachgereicht, sobald Noah das naechste Mal schreibt. Genau deshalb
   * braucht dieser Weg keine genehmigte Meta-Vorlage, um ueberhaupt zu
   * funktionieren.
   */
  async notifyPending(): Promise<{ delivered: boolean; eventIds: readonly EventId[]; reason: string | null }> {
    const offen = this.deps.toolContext.events.unannouncedEvents(this.deps.config.maxAnnouncementsPerTurn);
    if (offen.length === 0) return { delivered: false, eventIds: [], reason: 'nichts offen' };

    // Waehrend einer laufenden Freigabe wird nicht dazwischengefunkt - sonst
    // steht die Ankuendigung zwischen Read-back und Bestaetigung.
    const session = this.deps.sessions.get(this.deps.ownerWaId);
    if (session !== null && this.deps.approvals.liveForCall(session.sessionRef) !== null) {
      return { delivered: false, eventIds: [], reason: 'Freigabe laeuft' };
    }

    try {
      const angekuendigt = await this.announceOpenEvents(this.deps.ownerWaId, true);
      return { delivered: angekuendigt.replies > 0, eventIds: angekuendigt.eventIds, reason: null };
    } catch (err) {
      // Kein Drama und kein Datenverlust: die Ereignisse bleiben offen.
      const grund = err instanceof Error ? err.message : 'unbekannt';
      this.deps.logger.info('chat_meldung_verschoben', { grund });
      return { delivered: false, eventIds: [], reason: grund };
    }
  }

  /* --------------------------------------------------------------------- */
  /* Freigabeablauf                                                         */
  /* --------------------------------------------------------------------- */

  /**
   * Beginnt eine Freigabe: Read-back schreiben, binden, Frage stellen.
   *
   * Die Reihenfolge ist entscheidend. Erst wenn die Nachricht mit dem
   * vollstaendigen Text nachweislich rausgegangen ist, wird sie als
   * Read-back gebunden. Scheitert der Versand, wird die Freigabe verworfen -
   * ein Read-back, den niemand gelesen hat, ist keiner.
   */
  private async startApproval(
    waId: string,
    sessionRef: CallId,
    draftId: DraftId,
  ): Promise<{ replies: number; step: ChatTurnOutcome['approvalStep'] }> {
    const { engine } = this.deps;

    let approvalId;
    let script;
    try {
      const angefordert = engine.requestApproval(draftId, sessionRef, 'text');
      approvalId = angefordert.approval.id;
      script = angefordert.script;
    } catch (err) {
      return { replies: await this.say(waId, textError(err)), step: 'keiner' };
    }

    let replies = 0;
    try {
      replies += await this.say(waId, script.full);
    } catch (err) {
      engine.cancel(approvalId, 'read_back_nicht_zugestellt');
      this.deps.logger.warn('chat_read_back_nicht_zugestellt', { approvalId });
      throw err;
    }

    try {
      engine.markReadBackComplete(approvalId, script.full, 'text');
      engine.awaitApproval(approvalId);
    } catch (err) {
      engine.cancel(approvalId, 'read_back_ungueltig');
      return { replies: replies + (await this.say(waId, textError(err))), step: 'keiner' };
    }

    replies += await this.say(waId, script.question);
    return { replies, step: 'read_back_gesendet' };
  }

  /**
   * Setzt eine laufende Freigabe mit der naechsten Nachricht fort.
   *
   * Welcher Schritt ansteht, wird nicht gemerkt, sondern aus dem
   * gespeicherten Zustand abgelesen. Das ist der Grund, warum ein Neustart
   * hier nichts kaputt macht.
   */
  private async continueApproval(
    waId: string,
    id: ApprovalId,
    text: string,
  ): Promise<{ replies: number; step: ChatTurnOutcome['approvalStep'] }> {
    const { engine, approvals } = this.deps;
    const approval = approvals.byId(id);
    if (approval === null) {
      return { replies: await this.say(waId, 'Der Vorgang ist nicht mehr da. Es wurde nichts gesendet.'), step: 'keiner' };
    }

    if (isAbort(text)) {
      engine.cancel(id, 'abbruch_durch_noah');
      return { replies: await this.say(waId, 'Abgebrochen. Es wurde nichts gesendet.'), step: 'abgebrochen' };
    }

    // Ein Zustand, der auf eine Aktion von Jarvis wartet und nicht auf eine
    // Antwort, darf nicht liegen bleiben. Lieber verwerfen als raten.
    if (approval.state !== 'AWAITING_APPROVAL') {
      engine.cancel(id, `unerwarteter_zustand_${approval.state}`);
      return {
        replies: await this.say(
          waId,
          'Der Freigabevorgang stand in einem Zustand, aus dem ich nicht sicher weitermachen kann. ' +
            'Ich habe ihn verworfen - es wurde nichts gesendet. Sag mir noch einmal, was du senden willst.',
        ),
        step: 'abgebrochen',
      };
    }

    // ---- Schritt 1: die ausdrueckliche Bestaetigung ------------------------
    if (approval.voiceConfirmedAt === null) {
      let akzeptiert = false;
      try {
        akzeptiert = engine.confirmVoice(id, text).accepted;
      } catch (err) {
        return { replies: await this.say(waId, textError(err)), step: 'bestaetigung_abgelehnt' };
      }

      if (!akzeptiert) {
        engine.cancel(id, 'keine_gueltige_bestaetigung');
        return {
          replies: await this.say(
            waId,
            'Das war keine gueltige Bestaetigung. Zum Senden brauche ich ausdruecklich "Ja, senden". ' +
              'Es wurde nichts gesendet - sag mir, was ich aendern soll.',
          ),
          step: 'bestaetigung_abgelehnt',
        };
      }

      return {
        replies: await this.say(
          waId,
          `Gut. Jetzt brauche ich noch ${this.deps.config.secondFactorLabel}.`,
        ),
        step: 'bestaetigung_akzeptiert',
      };
    }

    // ---- Schritt 2: der zweite Faktor --------------------------------------
    const ziffern = text.replace(/\D/g, '');
    let faktorOk = false;
    try {
      faktorOk = (await engine.confirmPin(id, ziffern.length === 0 ? null : ziffern)).accepted;
    } catch (err) {
      return { replies: await this.say(waId, textError(err)), step: 'faktor_abgelehnt' };
    }

    if (!faktorOk) {
      engine.cancel(id, 'zweiter_faktor_falsch');
      return {
        replies: await this.say(waId, 'Das war nicht richtig. Es wurde nichts gesendet.'),
        step: 'faktor_abgelehnt',
      };
    }

    // ---- Schritt 3: Versand -------------------------------------------------
    try {
      const ergebnis = await this.deps.engine.execute(id);
      return {
        replies: await this.say(waId, ergebnis.spokenDe),
        step: ergebnis.status === 'sent' ? 'gesendet' : 'versand_fehlgeschlagen',
      };
    } catch (err) {
      return { replies: await this.say(waId, textError(err)), step: 'versand_fehlgeschlagen' };
    }
  }

  /* --------------------------------------------------------------------- */
  /* Anmeldung                                                              */
  /* --------------------------------------------------------------------- */

  private async tryLogin(waId: string, text: string): Promise<{ ok: boolean; replies: number }> {
    const { sessions, config } = this.deps;
    const session = sessions.get(waId);

    if (session !== null && session.failedLogins >= MAX_FAILED_LOGINS) {
      void this.deps.audit.record('chat.session.rejected', waId, { grund: 'zu_viele_fehlversuche' });
      return { ok: false, replies: await this.say(waId, 'Zu viele Fehlversuche. Der Abschnitt ist gesperrt.') };
    }

    const ziffern = text.replace(/\D/g, '');
    if (ziffern.length === 0 || config.loginPinHash === undefined) {
      return { ok: false, replies: await this.say(waId, 'Bitte zuerst deine Anmelde-PIN schicken.') };
    }

    if (!(await verifyPin(ziffern, config.loginPinHash))) {
      const fehlversuche = sessions.countFailedLogin(waId);
      void this.deps.audit.record('auth.pin.failed', waId, { fehlversuche });
      return { ok: false, replies: await this.say(waId, 'Die PIN war nicht richtig.') };
    }

    sessions.markAuthenticated(waId);
    void this.deps.audit.record('auth.pin.ok', waId, { kanal: 'chat' });
    return { ok: true, replies: await this.say(waId, 'Angemeldet. Was liegt an?') };
  }

  /* --------------------------------------------------------------------- */
  /* Ereignisse ankuendigen                                                 */
  /* --------------------------------------------------------------------- */

  private async announceOpenEvents(
    waId: string,
    mitVorspann = false,
  ): Promise<{ replies: number; eventIds: EventId[] }> {
    const { toolContext, config } = this.deps;
    // Nicht `openEvents`: was einmal genannt wurde, wird nicht bei jeder
    // weiteren Nachricht erneut genannt, auch wenn es noch unerledigt ist.
    const offen = toolContext.events.unannouncedEvents(config.maxAnnouncementsPerTurn);
    if (offen.length === 0) return { replies: 0, eventIds: [] };

    let replies = 0;
    if (mitVorspann) {
      replies += await this.say(
        waId,
        offen.length === 1
          ? 'Es ist etwas hereingekommen.'
          : `Es sind ${offen.length} Sachen hereingekommen.`,
      );
    }

    const ids: EventId[] = [];
    for (const event of offen) {
      replies += await this.say(waId, this.announcementFor(event));
      toolContext.events.markAnnounced(event.id);
      ids.push(event.id);
    }
    return { replies, eventIds: ids };
  }

  private announcementFor(event: InboundEvent): string {
    return buildEventAnnouncement({
      channel: event.channel,
      sender: unwrapForDisplay(event.senderDisplay),
      subject: event.subject === null ? null : unwrapForDisplay(event.subject),
      urgency: event.urgency,
      summary: shortSummary(event),
    });
  }

  /* --------------------------------------------------------------------- */

  private async say(waId: string, text: string): Promise<number> {
    await this.deps.deliver(text);
    this.deps.sessions.markOutbound(waId);
    void this.deps.audit.record('chat.message.sent', asChatRef(waId), { laenge: text.length });
    return 1;
  }

  private promptContext(): PromptContext {
    return {
      nowIso: this.deps.clock.nowIso(),
      timezone: this.deps.timezone,
      openEventCount: this.deps.toolContext.events.countOpen(),
      openTaskCount: this.deps.toolContext.tasks.open().length,
      callReason: null,
      memorySummary: this.deps.toolContext.memories
        .all()
        .slice(-8)
        .map((m) => `${m.subject}: ${m.fact}`),
    };
  }

  private outcome(
    sessionRef: CallId,
    repliesSent: number,
    announcedEventIds: readonly EventId[],
    approvalStep: ChatTurnOutcome['approvalStep'],
    rejected: ChatTurnOutcome['rejected'],
  ): ChatTurnOutcome {
    return {
      handled: rejected === null,
      sessionRef,
      repliesSent,
      announcedEventIds,
      approvalStep,
      rejected,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Hilfsmittel                                                                 */
/* -------------------------------------------------------------------------- */

function textError(err: unknown): string {
  if (err instanceof ApprovalError) return err.spokenDe;
  return 'Da ist technisch etwas schiefgegangen. Es wurde nichts gesendet.';
}

const ABORT =
  /^\s*(abbrechen|abbruch|stopp?|halt|nicht senden|doch nicht|vergiss es|lass stecken|cancel)\b/i;

export function isAbort(text: string): boolean {
  return ABORT.test(text);
}

/** Nummernvergleich ohne Plus, Leerzeichen und Bindestriche. */
export function sameNumber(a: string, b: string): boolean {
  return a.replace(/\D/g, '') === b.replace(/\D/g, '') && a.replace(/\D/g, '').length > 0;
}

function asChatRef(waId: string): CallId {
  return `chat:${waId}` as CallId;
}

/** Sehr kurze Zusammenfassung. Nur aus der Vorschau, nie erfunden. */
function shortSummary(event: InboundEvent): string {
  const preview = unwrapForDisplay(event.preview).replace(/\s+/g, ' ').trim();
  if (preview.length === 0) return 'Inhalt liegt mir noch nicht vor.';
  const cut = preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
  return `Kurz gesagt: ${cut}`;
}

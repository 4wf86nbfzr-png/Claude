import type { CallEndReason, Clock, E164 } from '@jarvis/domain';
import { FRAME_SAMPLES_8K, TELEPHONY_SAMPLE_RATE, silence, tone } from '@jarvis/speech';
import type { AnswerResult, CallHandle, TelephonyConfig, TelephonyPort } from './port.js';

/**
 * Vollstaendiger Telefonie-Simulator.
 *
 * Er bildet alles nach, was die reale Strecke an Verhalten zeigt und was der
 * Gespraechsablauf beherrschen muss: Klingeln, Nichtannahme, Besetzt,
 * Netzfehler, DTMF, gesprochene Antworten mit echtem Audio, Auflegen mitten
 * in der Ansage und Barge-in.
 *
 * Ohne diesen Simulator laesse sich nichts davon vor dem Kauf des Gateways
 * pruefen - und danach nur mit einem Telefon in der Hand.
 */
export interface SimulatedCallScript {
  /** Wie der Anruf ausgeht, wenn Jarvis waehlt. */
  readonly answerBehaviour?: 'answer' | 'no_answer' | 'busy' | 'network_error' | 'rejected';
  /** Verzoegerung bis zur Annahme. */
  readonly answerDelayMs?: number;
  /** Was Noah der Reihe nach sagt bzw. eingibt. */
  readonly turns?: readonly SimulatedTurn[];
}

export type SimulatedTurn =
  | { readonly kind: 'speak'; readonly durationMs?: number; readonly afterMs?: number }
  | { readonly kind: 'dtmf'; readonly digits: string; readonly afterMs?: number }
  | { readonly kind: 'silence'; readonly durationMs: number }
  | { readonly kind: 'hangup'; readonly afterMs?: number }
  /** Noah unterbricht Jarvis mitten in der Ausgabe. */
  | { readonly kind: 'barge_in'; readonly durationMs?: number };

export class SimulatedCall implements CallHandle {
  readonly inboundSampleRate = TELEPHONY_SAMPLE_RATE;
  readonly outboundSampleRate = TELEPHONY_SAMPLE_RATE;

  /** Alles, was Jarvis ausgegeben hat - Grundlage der Pruefung auf Read-back. */
  readonly playedSamples: number[] = [];
  /** Wie oft die Ausgabe hart abgebrochen wurde. */
  stopAudioCount = 0;

  private readonly dtmfHandlers: ((d: string) => void)[] = [];
  private readonly hangupHandlers: ((r: CallEndReason) => void)[] = [];
  private readonly dtmfQueue: string[] = [];
  private readonly audioQueue: Int16Array[] = [];
  private audioResolvers: ((v: IteratorResult<Int16Array>) => void)[] = [];
  private playing = false;
  private ended = false;
  private endReason: CallEndReason | null = null;
  private answerResult: AnswerResult | null = null;
  private answerWaiters: ((r: AnswerResult) => void)[] = [];
  private dtmfWaiting = false;

  constructor(
    readonly id: string,
    readonly direction: 'inbound' | 'outbound',
    readonly callerId: string | null,
    private readonly script: SimulatedCallScript,
  ) {}

  get active(): boolean {
    return !this.ended;
  }

  /* ----------------------------------------------------------------- */
  /* Annahme                                                            */
  /* ----------------------------------------------------------------- */

  async answered(): Promise<AnswerResult> {
    if (this.answerResult !== null) return this.answerResult;
    return new Promise<AnswerResult>((resolve) => {
      this.answerWaiters.push(resolve);
    });
  }

  /** Wird vom Port aufgerufen, sobald das simulierte Netz geantwortet hat. */
  settleAnswer(result: AnswerResult): void {
    this.answerResult = result;
    for (const w of this.answerWaiters) w(result);
    this.answerWaiters = [];
    if (!result.answered) {
      this.ended = true;
      this.endReason = result.reason;
    }
  }

  /* ----------------------------------------------------------------- */
  /* Audio                                                              */
  /* ----------------------------------------------------------------- */

  async *audioIn(): AsyncIterable<Int16Array> {
    while (!this.ended) {
      const queued = this.audioQueue.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      const next = await new Promise<IteratorResult<Int16Array>>((resolve) => {
        this.audioResolvers.push(resolve);
      });
      if (next.done === true) return;
      yield next.value;
    }
  }

  /** Schiebt einen Frame in den eingehenden Strom. */
  pushInboundAudio(frame: Int16Array): void {
    const waiter = this.audioResolvers.shift();
    if (waiter !== undefined) {
      waiter({ value: frame, done: false });
      return;
    }
    this.audioQueue.push(frame);
  }

  private closeAudioIn(): void {
    for (const r of this.audioResolvers) r({ value: undefined as never, done: true });
    this.audioResolvers = [];
  }

  async playAudio(pcm: Int16Array): Promise<void> {
    if (this.ended) return;
    this.playing = true;
    this.playedSamples.push(pcm.length);
    // Ausgabe in Echtzeit zu simulieren wuerde Tests unnoetig langsam machen.
    // Was zaehlt, ist die Reihenfolge und ob ein Abbruch greift.
    await Promise.resolve();
    this.playing = false;
  }

  async stopAudio(): Promise<void> {
    this.stopAudioCount += 1;
    this.playing = false;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /* ----------------------------------------------------------------- */
  /* DTMF                                                               */
  /* ----------------------------------------------------------------- */

  /**
   * Sammelt DTMF-Ziffern. Wartet bis zum Timeout, statt sofort aufzugeben -
   * genau wie die echte Strecke: der Ablauf fragt nach der PIN, und erst
   * DANACH tippt Noah. Ein Simulator, der hier sofort null liefert, meldet
   * eine fehlende PIN, wo in Wirklichkeit nur noch niemand getippt hat.
   */
  async collectDtmf(maxDigits: number, timeoutMs: number): Promise<string | null> {
    const take = (): string | null => {
      const queued = this.dtmfQueue.shift();
      return queued === undefined ? null : queued.replace(/#$/, '').slice(0, maxDigits);
    };

    const immediate = take();
    if (immediate !== null) return immediate;

    this.dtmfWaiting = true;
    return new Promise<string | null>((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const done = (v: string | null): void => {
        this.dtmfWaiting = false;
        resolve(v);
      };
      const poll = (): void => {
        if (this.ended) {
          done(null);
          return;
        }
        const got = take();
        if (got !== null) {
          done(got);
          return;
        }
        if (Date.now() >= deadline) {
          done(null);
          return;
        }
        setTimeout(poll, 5);
      };
      setTimeout(poll, 5);
    });
  }

  /**
   * true, solange auf eine Tastatureingabe gewartet wird. Der
   * Gespraechssimulator braucht das, um zu erkennen, dass jetzt die PIN
   * dran ist und keine gesprochene Antwort.
   */
  get awaitingDtmf(): boolean {
    return this.dtmfWaiting;
  }

  onDtmf(handler: (digit: string) => void): void {
    this.dtmfHandlers.push(handler);
  }

  /** Simuliert eine DTMF-Eingabe von Noah. */
  pressDtmf(digits: string): void {
    this.dtmfQueue.push(digits);
    for (const d of digits) {
      for (const h of this.dtmfHandlers) h(d);
    }
  }

  /* ----------------------------------------------------------------- */
  /* Ende                                                               */
  /* ----------------------------------------------------------------- */

  async hangup(reason: CallEndReason): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    this.closeAudioIn();
    for (const h of this.hangupHandlers) h(reason);
  }

  onHangup(handler: (reason: CallEndReason) => void): void {
    this.hangupHandlers.push(handler);
    if (this.ended && this.endReason !== null) handler(this.endReason);
  }

  get reason(): CallEndReason | null {
    return this.endReason;
  }

  get plannedTurns(): readonly SimulatedTurn[] {
    return this.script.turns ?? [];
  }
}

/* -------------------------------------------------------------------------- */
/* Port                                                                        */
/* -------------------------------------------------------------------------- */

export interface SimulatorOptions extends TelephonyConfig {
  readonly clock: Clock;
  /** Standardverhalten fuer ausgehende Anrufe. */
  readonly defaultScript?: SimulatedCallScript;
}

export class SimulatedTelephony implements TelephonyPort {
  readonly name = 'simulator';

  /** Alle bisher gestarteten Gespraeche - fuer Pruefungen im Test. */
  readonly calls: SimulatedCall[] = [];
  /** Skripte, die der Reihe nach fuer ausgehende Anrufe verwendet werden. */
  private readonly scriptQueue: SimulatedCallScript[] = [];
  private incomingHandler: ((c: CallHandle) => void | Promise<void>) | null = null;
  private seq = 0;
  private started = false;

  constructor(private readonly opts: SimulatorOptions) {}

  async start(): Promise<void> {
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    for (const c of this.calls) {
      if (c.active) await c.hangup('hangup_by_system');
    }
  }

  /** Legt fest, wie der naechste ausgehende Anruf verlaeuft. */
  queueScript(...scripts: SimulatedCallScript[]): void {
    this.scriptQueue.push(...scripts);
  }

  async dialOwner(reason: string): Promise<CallHandle> {
    void reason;
    if (!this.started) throw new Error('Simulator wurde nicht gestartet');
    const script = this.scriptQueue.shift() ?? this.opts.defaultScript ?? { answerBehaviour: 'answer' };
    this.seq += 1;
    const call = new SimulatedCall(`sim-out-${this.seq}`, 'outbound', this.opts.ownerPhone, script);
    this.calls.push(call);

    const behaviour = script.answerBehaviour ?? 'answer';
    const settle = (): void => {
      switch (behaviour) {
        case 'answer':
          call.settleAnswer({ answered: true });
          break;
        case 'no_answer':
          call.settleAnswer({ answered: false, reason: 'no_answer' });
          break;
        case 'busy':
          call.settleAnswer({ answered: false, reason: 'busy' });
          break;
        case 'rejected':
          call.settleAnswer({ answered: false, reason: 'rejected' });
          break;
        case 'network_error':
          call.settleAnswer({ answered: false, reason: 'network_error' });
          break;
      }
    };

    if ((script.answerDelayMs ?? 0) > 0) {
      setTimeout(settle, script.answerDelayMs);
    } else {
      // Erst zurueckgeben, dann aufloesen - sonst verpasst der Aufrufer das Ergebnis.
      queueMicrotask(settle);
    }
    return call;
  }

  /** Simuliert, dass jemand die Jarvis-Nummer anruft. */
  async simulateIncoming(callerId: string | null, script: SimulatedCallScript = {}): Promise<SimulatedCall> {
    if (this.incomingHandler === null) throw new Error('Kein Handler fuer eingehende Anrufe registriert');
    this.seq += 1;
    const call = new SimulatedCall(`sim-in-${this.seq}`, 'inbound', callerId, script);
    this.calls.push(call);
    call.settleAnswer({ answered: true });
    await this.incomingHandler(call);
    return call;
  }

  onIncomingCall(handler: (call: CallHandle) => void | Promise<void>): void {
    this.incomingHandler = handler;
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: this.started,
      message: this.started
        ? 'Simulator laeuft - es besteht KEINE Verbindung zum Telefonnetz'
        : 'Simulator nicht gestartet',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Audio-Fixtures                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Erzeugt sprachaehnliches Audio: mehrere Formanten plus etwas Rauschen.
 * Reicht, damit der VAD zuverlaessig anschlaegt - fuer die Erkennung selbst
 * ist im Simulator ohnehin `ScriptedStt` zustaendig.
 */
export function speechLike(durationMs: number, sampleRate = TELEPHONY_SAMPLE_RATE, seed = 1): Int16Array {
  const samples = Math.round((durationMs / 1000) * sampleRate);
  const out = new Int16Array(samples);
  const f1 = tone(samples, 300, sampleRate, 6000);
  const f2 = tone(samples, 850, sampleRate, 3500);
  const f3 = tone(samples, 1600, sampleRate, 1500);
  let rnd = seed;
  for (let i = 0; i < samples; i += 1) {
    rnd = (rnd * 1103515245 + 12345) & 0x7fffffff;
    const noise = ((rnd % 2000) - 1000) * 0.5;
    // Silbenrhythmus mit Bodensatz. Echte Sprache faellt zwischen den Silben
    // nicht auf null - ein Fixture, das das tut, testet den VAD gegen ein
    // Signal, das so nie auf der Leitung liegt.
    const env = 0.35 + 0.65 * Math.abs(Math.sin((2 * Math.PI * 3 * i) / sampleRate));
    const v = ((f1[i] ?? 0) + (f2[i] ?? 0) + (f3[i] ?? 0)) * env + noise;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v)));
  }
  return out;
}

/** Zerlegt Audio in 20-ms-Frames, wie sie aus dem Netz kommen. */
export function toFrames(pcm: Int16Array, frameSamples = FRAME_SAMPLES_8K): Int16Array[] {
  const frames: Int16Array[] = [];
  for (let i = 0; i < pcm.length; i += frameSamples) {
    const f = new Int16Array(frameSamples);
    f.set(pcm.subarray(i, Math.min(i + frameSamples, pcm.length)));
    frames.push(f);
  }
  return frames;
}

export function silenceFrames(durationMs: number, sampleRate = TELEPHONY_SAMPLE_RATE): Int16Array[] {
  return toFrames(silence(Math.round((durationMs / 1000) * sampleRate)));
}

export type { E164 };

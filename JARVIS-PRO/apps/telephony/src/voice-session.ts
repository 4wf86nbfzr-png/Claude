import type { Clock } from '@jarvis/domain';
import type { Logger } from '@jarvis/observability';
import { metrics } from '@jarvis/observability';
import {
  EnergyVad,
  RingBuffer,
  normalize,
  resampleLinear,
  STT_SAMPLE_RATE,
  type SpeechToText,
  type TextToSpeech,
  type Vad,
} from '@jarvis/speech';
import type { CallHandle } from './port.js';

/**
 * Die Sprachsitzung: Audio rein, Text raus, Text rein, Audio raus.
 *
 * Hier sitzt der Teil, der ueber "wirkt wie ein Mensch" oder "wirkt wie ein
 * Sprachmenue" entscheidet:
 *
 *  - Barge-in. Waehrend Jarvis spricht, laeuft die Erkennung weiter. Sobald
 *    Noah anfaengt, wird die Ausgabe SOFORT gestoppt - nicht am Satzende -
 *    und das Gesagte wird als naechste Aeusserung behandelt. Das ist der
 *    Unterschied zwischen einem Gespraech und einer Ansage.
 *  - Vorlauf im Ringpuffer. Der Puffer haelt Audio VOR dem erkannten
 *    Sprachbeginn vor. Ohne das faellt regelmaessig die erste Silbe weg,
 *    weil der VAD immer ein Stueck hinterherlaeuft.
 *  - Nachlauf nach dem erkannten Sprachende, damit das letzte Wort nicht
 *    abgeschnitten wird.
 *
 * Roh-Audio bleibt in dieser Klasse. Nach draussen geht nur Text.
 */
export interface VoiceSessionOptions {
  readonly call: CallHandle;
  readonly stt: SpeechToText;
  readonly tts: TextToSpeech;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly vad?: Vad;
  /** Audio vor dem erkannten Sprachbeginn, das mit erkannt wird. */
  readonly preRollMs?: number;
  /** Audio nach dem erkannten Sprachende. */
  readonly postRollMs?: number;
  /** Wie lange Sprache anliegen muss, bis die Ausgabe abgebrochen wird. */
  readonly bargeInMs?: number;
  /** Obergrenze fuer eine einzelne Aeusserung. */
  readonly maxUtteranceMs?: number;
}

export interface Utterance {
  readonly text: string;
  /** true, wenn diese Aeusserung eine laufende Ausgabe unterbrochen hat. */
  readonly interrupted: boolean;
  readonly durationMs: number;
  /** VAD-Ende bis fertiges Transkript. */
  readonly sttLatencyMs: number;
}

export interface SpeakResult {
  /** true, wenn der Text vollstaendig ausgegeben wurde. */
  readonly completed: boolean;
  /** true, wenn Noah unterbrochen hat. */
  readonly interrupted: boolean;
  readonly ttsTimeToFirstAudioMs: number | null;
  readonly spokenText: string;
}

const DEFAULTS = {
  preRollMs: 400,
  postRollMs: 300,
  bargeInMs: 160,
  maxUtteranceMs: 30_000,
} as const;

export class VoiceSession {
  private readonly call: CallHandle;
  private readonly stt: SpeechToText;
  private readonly tts: TextToSpeech;
  private readonly logger: Logger;
  private readonly vad: Vad;
  private readonly preRollSamples: number;
  private readonly postRollMs: number;
  private readonly bargeInMs: number;
  private readonly maxUtteranceMs: number;

  private readonly ring: RingBuffer;
  private collecting: Int16Array[] = [];
  private capturing = false;
  private elapsedMs = 0;
  private voiceRunMs = 0;
  private lastVoiceMs = 0;

  /** Gesetzt, solange Jarvis spricht - traegt den Abbruch beim Barge-in. */
  private speakingAbort: AbortController | null = null;
  private bargeInDetected = false;

  private pendingUtterances: Utterance[] = [];
  private utteranceWaiters: ((u: Utterance | null) => void)[] = [];
  private closed = false;
  private pumpPromise: Promise<void> | null = null;

  constructor(opts: VoiceSessionOptions) {
    this.call = opts.call;
    this.stt = opts.stt;
    this.tts = opts.tts;
    this.logger = opts.logger;
    this.postRollMs = opts.postRollMs ?? DEFAULTS.postRollMs;
    this.bargeInMs = opts.bargeInMs ?? DEFAULTS.bargeInMs;
    this.maxUtteranceMs = opts.maxUtteranceMs ?? DEFAULTS.maxUtteranceMs;
    this.vad =
      opts.vad ??
      new EnergyVad({
        sampleRate: this.call.inboundSampleRate,
        silenceMs: 700,
        minSpeechMs: 180,
      });

    const preRollMs = opts.preRollMs ?? DEFAULTS.preRollMs;
    this.preRollSamples = Math.round((preRollMs / 1000) * this.call.inboundSampleRate);
    // Der Ring haelt Vorlauf plus etwas Reserve.
    this.ring = new RingBuffer(this.preRollSamples * 3);
  }

  /** Startet die Audioverarbeitung. Laeuft, bis der Anruf endet. */
  start(): void {
    if (this.pumpPromise !== null) return;
    this.pumpPromise = this.pump().catch((err: unknown) => {
      this.logger.error('audio_pumpe_abgebrochen', {
        error: err instanceof Error ? err.message : String(err),
      });
      this.close();
    });
    this.call.onHangup(() => this.close());
  }

  private async pump(): Promise<void> {
    const frameMsOf = (f: Int16Array): number => (f.length / this.call.inboundSampleRate) * 1000;

    for await (const frame of this.call.audioIn()) {
      if (this.closed) return;
      const frameMs = frameMsOf(frame);
      this.elapsedMs += frameMs;
      this.ring.write(frame);

      // ---- Barge-in ------------------------------------------------------
      // Wird VOR der eigentlichen VAD-Auswertung geprueft: die Ausgabe muss
      // abbrechen, sobald Sprache da ist, nicht erst wenn der VAD ein
      // vollstaendiges Sprachereignis gebildet hat.
      if (this.speakingAbort !== null && !this.bargeInDetected) {
        if (this.vad.isLikelySpeech(frame)) {
          this.voiceRunMs += frameMs;
          if (this.voiceRunMs >= this.bargeInMs) {
            this.bargeInDetected = true;
            this.logger.info('barge_in', { afterMs: this.voiceRunMs });
            this.speakingAbort.abort();
            await this.call.stopAudio();
          }
        } else {
          this.voiceRunMs = 0;
        }
      }

      // ---- Aufnahme ------------------------------------------------------
      const event = this.vad.push(frame, this.elapsedMs);

      if (event?.type === 'speech_start' && !this.capturing) {
        this.capturing = true;
        // Vorlauf mitnehmen, damit die erste Silbe nicht fehlt.
        this.collecting = [this.ring.peekLast(this.preRollSamples)];
        this.lastVoiceMs = this.elapsedMs;
      } else if (this.capturing) {
        this.collecting.push(frame);
        if (this.vad.isSpeaking) this.lastVoiceMs = this.elapsedMs;
      }

      if (this.capturing && event?.type === 'speech_end') {
        // Nachlauf: die Frames nach dem erkannten Ende sind schon im Ring.
        const postRollSamples = Math.round((this.postRollMs / 1000) * this.call.inboundSampleRate);
        this.collecting.push(this.ring.peekLast(postRollSamples));
        await this.finishUtterance();
      } else if (this.capturing && this.elapsedMs - this.lastVoiceMs > this.maxUtteranceMs) {
        this.logger.warn('aeusserung_zu_lang', { maxUtteranceMs: this.maxUtteranceMs });
        await this.finishUtterance();
      }
    }
    this.close();
  }

  private async finishUtterance(): Promise<void> {
    this.capturing = false;
    const frames = this.collecting;
    this.collecting = [];
    if (frames.length === 0) return;

    const total = frames.reduce((n, f) => n + f.length, 0);
    const pcm = new Int16Array(total);
    let off = 0;
    for (const f of frames) {
      pcm.set(f, off);
      off += f.length;
    }

    const durationMs = (pcm.length / this.call.inboundSampleRate) * 1000;
    const t0 = Date.now();

    // Auf die Rate der Erkennung bringen und den Pegel angleichen.
    const resampled =
      this.call.inboundSampleRate === STT_SAMPLE_RATE
        ? pcm
        : resampleLinear(pcm, this.call.inboundSampleRate, STT_SAMPLE_RATE);
    const prepared = normalize(resampled, -20);

    let text = '';
    try {
      const result = await this.stt.transcribe(prepared, STT_SAMPLE_RATE);
      text = result.text.trim();
    } catch (err) {
      this.logger.error('spracherkennung_fehlgeschlagen', {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const sttLatencyMs = Date.now() - t0;
    metrics.sttLatencyMs.observe(sttLatencyMs);

    if (text.length === 0) return;

    const utterance: Utterance = {
      text,
      interrupted: this.bargeInDetected,
      durationMs,
      sttLatencyMs,
    };
    this.bargeInDetected = false;
    this.voiceRunMs = 0;

    const waiter = this.utteranceWaiters.shift();
    if (waiter !== undefined) waiter(utterance);
    else this.pendingUtterances.push(utterance);
  }

  /**
   * Wartet auf die naechste Aeusserung. `null` bedeutet: das Gespraech ist
   * beendet.
   */
  async nextUtterance(timeoutMs?: number): Promise<Utterance | null> {
    const queued = this.pendingUtterances.shift();
    if (queued !== undefined) return queued;
    if (this.closed) return null;

    return new Promise<Utterance | null>((resolve) => {
      let timer: NodeJS.Timeout | null = null;
      const wrapped = (u: Utterance | null): void => {
        if (timer !== null) clearTimeout(timer);
        resolve(u);
      };
      this.utteranceWaiters.push(wrapped);
      if (timeoutMs !== undefined) {
        timer = setTimeout(() => {
          const idx = this.utteranceWaiters.indexOf(wrapped);
          if (idx >= 0) this.utteranceWaiters.splice(idx, 1);
          resolve(null);
        }, timeoutMs);
      }
    });
  }

  /**
   * Spricht einen Text. Bricht ab, sobald Noah zu reden anfaengt.
   * Der erste Satz geht auf die Leitung, waehrend die folgenden noch
   * erzeugt werden.
   */
  async speak(text: string): Promise<SpeakResult> {
    if (this.closed || !this.call.active) {
      return { completed: false, interrupted: false, ttsTimeToFirstAudioMs: null, spokenText: '' };
    }

    const controller = new AbortController();
    this.speakingAbort = controller;
    this.bargeInDetected = false;
    this.voiceRunMs = 0;

    const t0 = Date.now();
    let firstAudioMs: number | null = null;
    const spokenParts: string[] = [];
    let completed = true;

    try {
      for await (const chunk of this.tts.synthesize(text, controller.signal)) {
        if (controller.signal.aborted || !this.call.active) {
          completed = false;
          break;
        }
        if (firstAudioMs === null) {
          firstAudioMs = Date.now() - t0;
          metrics.ttsTtfaMs.observe(firstAudioMs);
        }
        const pcm =
          chunk.sampleRate === this.call.outboundSampleRate
            ? chunk.pcm
            : resampleLinear(chunk.pcm, chunk.sampleRate, this.call.outboundSampleRate);
        await this.call.playAudio(pcm);
        if (controller.signal.aborted) {
          completed = false;
          break;
        }
        spokenParts.push(chunk.text);
      }
    } catch (err) {
      this.logger.error('sprachausgabe_fehlgeschlagen', {
        error: err instanceof Error ? err.message : String(err),
      });
      completed = false;
    } finally {
      this.speakingAbort = null;
    }

    return {
      completed: completed && !controller.signal.aborted,
      interrupted: controller.signal.aborted,
      ttsTimeToFirstAudioMs: firstAudioMs,
      spokenText: spokenParts.join(' '),
    };
  }

  /** true, solange Jarvis spricht. */
  get isSpeaking(): boolean {
    return this.speakingAbort !== null;
  }

  /**
   * true, wenn gerade auf eine Aeusserung gewartet wird - also der Moment, in
   * dem ein Mensch antworten wuerde. Der Gespraechssimulator haengt daran
   * seine Eingaben auf, statt auf Wanduhrzeit zu setzen.
   */
  get awaitingUtterance(): boolean {
    return this.utteranceWaiters.length > 0;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.speakingAbort?.abort();
    this.speakingAbort = null;
    for (const w of this.utteranceWaiters) w(null);
    this.utteranceWaiters = [];
    this.ring.clear();
    this.collecting = [];
  }
}

import { rms } from './audio.js';

/**
 * Sprachaktivitaetserkennung.
 *
 * Zwei Aufgaben, die oft verwechselt werden:
 *  1. Satzende erkennen, damit die Erkennung abschliessen kann.
 *  2. Barge-in erkennen, also dass Noah anfaengt zu sprechen, waehrend Jarvis
 *     noch redet. Dafuer muss die Erkennung SCHNELL sein und darf ruhig
 *     gelegentlich falsch anschlagen - die Sprachausgabe laesst sich neu
 *     starten, ein verpasstes Wort nicht.
 *
 * Der Standardadapter arbeitet mit Energie und Nulldurchgangsrate. Das
 * genuegt fuer die schmalbandige, bereits rauschunterdrueckte Telefonstrecke
 * und braucht kein Modell. Silero laesst sich ueber dasselbe Interface
 * einhaengen, sobald es lokal vorliegt (siehe `SileroVadAdapter`).
 */
export type VadEvent =
  | { readonly type: 'speech_start'; readonly atMs: number }
  | { readonly type: 'speech_end'; readonly atMs: number; readonly durationMs: number };

export interface VadOptions {
  readonly sampleRate: number;
  /** Schwelle in RMS. Wird beim Start an das Grundrauschen angepasst. */
  readonly energyThreshold?: number;
  /** Wie lange Stille anhalten muss, bis ein Satzende gilt. */
  readonly silenceMs?: number;
  /** Mindestdauer, damit ein Huster nicht als Sprache zaehlt. */
  readonly minSpeechMs?: number;
  /** Schnellerer Schwellwert fuer Barge-in. */
  readonly bargeInMs?: number;
  /** Automatische Anpassung an das Grundrauschen der Leitung. */
  readonly adaptNoiseFloor?: boolean;
}

export interface Vad {
  /** Fuettert einen Frame und liefert ggf. ein Ereignis. */
  push(frame: Int16Array, atMs: number): VadEvent | null;
  /** true, solange Sprache laeuft. */
  readonly isSpeaking: boolean;
  /**
   * Schnelle Pruefung fuer Barge-in: hat der Frame genug Energie, um als
   * beginnende Sprache zu gelten? Bewusst ohne Zustand.
   */
  isLikelySpeech(frame: Int16Array): boolean;
  reset(): void;
}

const DEFAULTS = {
  energyThreshold: 900,
  silenceMs: 700,
  minSpeechMs: 200,
  bargeInMs: 120,
  adaptNoiseFloor: true,
} as const;

export class EnergyVad implements Vad {
  private speaking = false;
  private speechStartMs = 0;
  private lastVoiceMs = 0;
  private noiseFloor = 0;
  private noiseSamples = 0;
  private consecutiveVoiceMs = 0;

  private readonly sampleRate: number;
  private readonly baseThreshold: number;
  private readonly silenceMs: number;
  private readonly minSpeechMs: number;
  private readonly bargeInMs: number;
  private readonly adapt: boolean;

  constructor(opts: VadOptions) {
    this.sampleRate = opts.sampleRate;
    this.baseThreshold = opts.energyThreshold ?? DEFAULTS.energyThreshold;
    this.silenceMs = opts.silenceMs ?? DEFAULTS.silenceMs;
    this.minSpeechMs = opts.minSpeechMs ?? DEFAULTS.minSpeechMs;
    this.bargeInMs = opts.bargeInMs ?? DEFAULTS.bargeInMs;
    this.adapt = opts.adaptNoiseFloor ?? DEFAULTS.adaptNoiseFloor;
  }

  private get threshold(): number {
    if (!this.adapt || this.noiseSamples < 10) return this.baseThreshold;
    // Deutlich ueber dem Grundrauschen, aber nie unter dem Basiswert.
    return Math.max(this.baseThreshold, this.noiseFloor * 3.5);
  }

  push(frame: Int16Array, atMs: number): VadEvent | null {
    const frameMs = (frame.length / this.sampleRate) * 1000;
    const energy = rms(frame);
    const zcr = zeroCrossingRate(frame);

    // Sprache hat Energie UND eine plausible Nulldurchgangsrate.
    // Reines Brummen (sehr niedrige ZCR) und Zischen (sehr hohe) fallen raus.
    const isVoice = energy > this.threshold && zcr > 0.01 && zcr < 0.35;

    if (!isVoice && !this.speaking && this.adapt) {
      this.noiseFloor = this.noiseFloor === 0 ? energy : this.noiseFloor * 0.95 + energy * 0.05;
      this.noiseSamples += 1;
    }

    if (isVoice) {
      this.consecutiveVoiceMs += frameMs;
      this.lastVoiceMs = atMs;
      if (!this.speaking && this.consecutiveVoiceMs >= this.minSpeechMs) {
        this.speaking = true;
        this.speechStartMs = atMs - this.consecutiveVoiceMs;
        return { type: 'speech_start', atMs: this.speechStartMs };
      }
      return null;
    }

    // Kein harter Reset, sondern Abbau.
    //
    // Deutsche Sprache ist voller Verschlusslaute: bei "Punkt" oder "Achi"
    // faellt der Pegel fuer 30 bis 60 ms auf null. Ein Zaehler, der bei jedem
    // leisen Frame auf 0 springt, erreicht die Mindestdauer dann nie und der
    // Sprachbeginn wird gar nicht erkannt - genau das ist beim ersten
    // Testlauf passiert. Der Abbau ueberbrueckt kurze Luecken und laesst
    // echte Stille trotzdem zuverlaessig auf 0 laufen.
    this.consecutiveVoiceMs = Math.max(0, this.consecutiveVoiceMs - frameMs);
    if (this.speaking && atMs - this.lastVoiceMs >= this.silenceMs) {
      this.speaking = false;
      const durationMs = this.lastVoiceMs - this.speechStartMs;
      return { type: 'speech_end', atMs, durationMs };
    }
    return null;
  }

  isLikelySpeech(frame: Int16Array): boolean {
    const energy = rms(frame);
    const zcr = zeroCrossingRate(frame);
    return energy > this.threshold && zcr > 0.01 && zcr < 0.35;
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Wie lange am Stueck Sprache erkannt wurde - Grundlage der Barge-in-Entscheidung. */
  get voiceRunMs(): number {
    return this.consecutiveVoiceMs;
  }

  get bargeInThresholdMs(): number {
    return this.bargeInMs;
  }

  reset(): void {
    this.speaking = false;
    this.consecutiveVoiceMs = 0;
    this.lastVoiceMs = 0;
    this.speechStartMs = 0;
  }
}

export function zeroCrossingRate(frame: Int16Array): number {
  if (frame.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < frame.length; i += 1) {
    const a = frame[i - 1] ?? 0;
    const b = frame[i] ?? 0;
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) crossings += 1;
  }
  return crossings / (frame.length - 1);
}

/**
 * Platzhalter fuer Silero VAD.
 *
 * Bewusst noch nicht implementiert: Silero kommt als ONNX-Modell und braucht
 * eine Laufzeit, die auf Apple Silicon und auf dem Linux-Host jeweils gebaut
 * werden muss. Solange das nicht durch `pnpm setup` abgesichert ist, waere ein
 * halbfertiger Adapter schlechter als der Energie-VAD, der nachweislich
 * funktioniert. Das Interface steht - der Austausch ist eine Zeile in der
 * Verdrahtung.
 */
export interface SileroLoader {
  load(modelPath: string): Promise<(frame: Float32Array) => Promise<number>>;
}

export class SileroVadAdapter implements Vad {
  private readonly inner: EnergyVad;
  /** Wird vom Diagnosebericht gelesen: false heisst "faellt auf Energie-VAD zurueck". */
  readonly implemented = false;
  readonly loaderAvailable: boolean;

  constructor(opts: VadOptions, loader?: SileroLoader) {
    // Bis das Modell verdrahtet ist, arbeitet der Energie-VAD - und das steht
    // auch so im Diagnosebericht, statt eine Faehigkeit vorzutaeuschen.
    this.loaderAvailable = loader !== undefined;
    this.inner = new EnergyVad(opts);
  }

  push(frame: Int16Array, atMs: number): VadEvent | null {
    return this.inner.push(frame, atMs);
  }
  isLikelySpeech(frame: Int16Array): boolean {
    return this.inner.isLikelySpeech(frame);
  }
  get isSpeaking(): boolean {
    return this.inner.isSpeaking;
  }
  reset(): void {
    this.inner.reset();
  }
}

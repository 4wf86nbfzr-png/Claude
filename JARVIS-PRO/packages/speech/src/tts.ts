import { spawn } from 'node:child_process';
import { resampleLinear, TELEPHONY_SAMPLE_RATE } from './audio.js';
import { applyLexicon } from './lexicon.js';

/**
 * Sprachausgabe.
 *
 * Zwei Dinge entscheiden darueber, ob sich das Gespraech natuerlich anfuehlt:
 *
 *  1. Satzweises Streaming. Der erste Satz geht auf die Leitung, waehrend die
 *     folgenden noch erzeugt werden. Sonst wartet Noah bei einer laengeren
 *     Antwort sekundenlang auf Stille.
 *  2. Abbrechbarkeit. Sobald Noah spricht, muss die laufende Ausgabe SOFORT
 *     enden - nicht am Satzende. Deshalb liefert `synthesize` einen
 *     AsyncIterable und respektiert ein AbortSignal.
 */
export interface TtsChunk {
  readonly pcm: Int16Array;
  readonly sampleRate: number;
  readonly sentenceIndex: number;
  readonly text: string;
  /** Zeit vom Aufruf bis zu diesem Stueck Audio. */
  readonly elapsedMs: number;
}

export interface TextToSpeech {
  readonly name: string;
  readonly sampleRate: number;
  synthesize(text: string, signal?: AbortSignal): AsyncIterable<TtsChunk>;
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

/**
 * Teilt Text in sprechbare Einheiten.
 *
 * Der Trick: gesucht wird auf einer MASKIERTEN Kopie, geschnitten wird im
 * Original. So loesen Abkuerzungen, Ordinalzahlen, Uhrzeiten und Betraege
 * keinen Satzumbruch aus ("am 9. Mai" bleibt ein Satz), aber der gesprochene
 * Text behaelt seine Punkte - ohne sie klingt Piper monoton.
 */
const ABBREVIATIONS =
  /\b(z\.\s?B|u\.\s?a|d\.\s?h|ca|bzw|evtl|inkl|exkl|Nr|Abs|Str|Hr|Fr|Dr|St|ggf|max|min|Tel|Mio|Mrd)\./gi;

export function splitSentences(text: string): string[] {
  const chars = [...text];
  const masked = [...text];
  const mask = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) {
      if (masked[i] === '.') masked[i] = '_';
    }
  };

  for (const m of text.matchAll(ABBREVIATIONS)) {
    if (m.index !== undefined) mask(m.index, m.index + m[0].length);
  }
  // Ordinalzahl vor Wort: "9. Mai", "1. Etage"
  for (const m of text.matchAll(/\d\.(?=\s+\p{Lu})/gu)) {
    if (m.index !== undefined) mask(m.index, m.index + m[0].length);
  }
  // Zahl.Zahl: Uhrzeiten, Betraege, Versionsnummern
  for (const m of text.matchAll(/\d\.\d/g)) {
    if (m.index !== undefined) mask(m.index, m.index + m[0].length);
  }

  const maskedText = masked.join('');
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < maskedText.length; i += 1) {
    const c = maskedText[i];
    if (c !== '.' && c !== '!' && c !== '?' && c !== ':') continue;
    // Satzende nur, wenn danach Leerraum oder Textende folgt.
    let j = i + 1;
    while (j < maskedText.length && (maskedText[j] === '"' || maskedText[j] === "'" || maskedText[j] === ')')) j += 1;
    if (j < maskedText.length && !/\s/.test(maskedText[j] ?? '')) continue;
    const piece = chars.slice(start, j).join('').trim();
    if (piece.length > 0) out.push(piece);
    start = j;
  }
  const rest = chars.slice(start).join('').trim();
  if (rest.length > 0) out.push(rest);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Piper                                                                       */
/* -------------------------------------------------------------------------- */

export interface PiperOptions {
  readonly binPath: string;
  /** Pfad zur .onnx-Stimme, z. B. de_DE-thorsten-high.onnx */
  readonly voicePath: string;
  /** Ausgaberate der Stimme. Thorsten-high liefert 22050 Hz. */
  readonly voiceSampleRate?: number;
  /** Zielrate. Fuer die Telefonstrecke 8000 Hz. */
  readonly targetSampleRate?: number;
  readonly lengthScale?: number;
  readonly timeoutMs?: number;
}

/**
 * Adapter fuer Piper.
 *
 * Pro Satz ein Prozess: das klingt nach Verschwendung, ist aber der einzige
 * Weg, eine laufende Ausgabe hart abzubrechen, ohne den Zustand eines
 * langlebigen Prozesses zu zerstoeren. Piper startet in wenigen Millisekunden;
 * gemessen wird das in `scripts/bench-speech.ts`.
 */
export class PiperTts implements TextToSpeech {
  readonly name = 'piper';
  readonly sampleRate: number;

  constructor(private readonly opts: PiperOptions) {
    this.sampleRate = opts.targetSampleRate ?? TELEPHONY_SAMPLE_RATE;
  }

  async *synthesize(text: string, signal?: AbortSignal): AsyncIterable<TtsChunk> {
    const t0 = Date.now();
    const sentences = splitSentences(applyLexicon(text));
    const voiceRate = this.opts.voiceSampleRate ?? 22050;
    // Muss bei jedem Durchlauf neu gelesen werden - das Signal kippt waehrend
    // der Synthese, genau darum geht es beim Barge-in.
    const aborted = (): boolean => signal !== undefined && signal.aborted;

    for (let i = 0; i < sentences.length; i += 1) {
      if (aborted()) return;
      const sentence = sentences[i];
      if (sentence === undefined || sentence.length === 0) continue;

      const raw = await this.runPiper(sentence, signal);
      if (aborted()) return;

      const pcm = resampleLinear(raw, voiceRate, this.sampleRate);
      yield {
        pcm,
        sampleRate: this.sampleRate,
        sentenceIndex: i,
        text: sentence,
        elapsedMs: Date.now() - t0,
      };
    }
  }

  private runPiper(sentence: string, signal?: AbortSignal): Promise<Int16Array> {
    return new Promise((resolve, reject) => {
      const args = ['--model', this.opts.voicePath, '--output_raw'];
      if (this.opts.lengthScale !== undefined) args.push('--length_scale', String(this.opts.lengthScale));

      const child = spawn(this.opts.binPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          settled = true;
          reject(new Error('Piper: Zeitueberschreitung'));
        }
      }, this.opts.timeoutMs ?? 15_000);

      const onAbort = (): void => {
        child.kill('SIGKILL');
      };
      signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout.on('data', (c: Buffer) => chunks.push(c));
      child.stderr.on('data', (c: Buffer) => {
        stderr += c.toString();
      });
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
      child.on('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (signal?.aborted === true) {
          resolve(new Int16Array(0));
          return;
        }
        const buf = Buffer.concat(chunks);
        if (buf.length === 0) {
          reject(new Error(`Piper lieferte kein Audio${stderr ? `: ${stderr.slice(0, 300)}` : ''}`));
          return;
        }
        const n = Math.floor(buf.length / 2);
        const pcm = new Int16Array(n);
        for (let i = 0; i < n; i += 1) pcm[i] = buf.readInt16LE(i * 2);
        resolve(pcm);
      });

      child.stdin.end(sentence);
    });
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      const chunks: TtsChunk[] = [];
      for await (const c of this.synthesize('Test.')) chunks.push(c);
      return chunks.length > 0
        ? { ok: true, message: `Piper erreichbar, Stimme ${this.opts.voicePath}` }
        : { ok: false, message: 'Piper lieferte kein Audio' };
    } catch (err) {
      return { ok: false, message: `Piper nicht ausfuehrbar: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Mock                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Sprachausgabe fuer Simulation und Tests. Erzeugt Stille passender Laenge
 * und schreibt mit, was gesprochen wurde - so laesst sich pruefen, ob der
 * Read-back wirklich vollstaendig war und ob ein Abbruch gegriffen hat.
 */
export class MockTts implements TextToSpeech {
  readonly name = 'mock';
  readonly sampleRate: number;
  readonly spoken: string[] = [];
  /** Saetze, die tatsaechlich vollstaendig ausgegeben wurden (Abbruch beruecksichtigt). */
  readonly completedSentences: string[] = [];
  /** Verzoegerung pro Satz - fuer Barge-in-Tests. */
  msPerSentence = 0;
  /** Simulierte Sprechgeschwindigkeit fuer die Laenge des erzeugten Audios. */
  msPerCharacter = 60;

  constructor(sampleRate: number = TELEPHONY_SAMPLE_RATE) {
    this.sampleRate = sampleRate;
  }

  async *synthesize(text: string, signal?: AbortSignal): AsyncIterable<TtsChunk> {
    const t0 = Date.now();
    this.spoken.push(text);
    const sentences = splitSentences(applyLexicon(text));
    const aborted = (): boolean => signal !== undefined && signal.aborted;
    for (let i = 0; i < sentences.length; i += 1) {
      if (aborted()) return;
      const sentence = sentences[i];
      if (sentence === undefined) continue;
      if (this.msPerSentence > 0) await new Promise((r) => setTimeout(r, this.msPerSentence));
      if (aborted()) return;
      const samples = Math.max(
        1,
        Math.round((sentence.length * this.msPerCharacter * this.sampleRate) / 1000),
      );
      this.completedSentences.push(sentence);
      yield {
        pcm: new Int16Array(samples),
        sampleRate: this.sampleRate,
        sentenceIndex: i,
        text: sentence,
        elapsedMs: Date.now() - t0,
      };
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Simulierte Sprachausgabe' };
  }

  reset(): void {
    this.spoken.length = 0;
    this.completedSentences.length = 0;
  }
}

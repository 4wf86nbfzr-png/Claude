import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STT_SAMPLE_RATE } from './audio.js';
import { applyCorrections, buildInitialPrompt, DEFAULT_HINTS, type HintList } from './hints.js';

/**
 * Spracherkennung.
 *
 * Laeuft ausschliesslich lokal. Roh-Audio verlaesst das System nie - weder an
 * Anthropic noch an sonst jemanden. Was hinausgeht, ist der erkannte Text.
 */
export interface TranscriptionResult {
  readonly text: string;
  readonly language: string;
  /** Zeit vom Uebergeben des Audios bis zum fertigen Text. */
  readonly latencyMs: number;
  /** Verhaeltnis Rechenzeit zu Audiodauer. Unter 1 heisst schneller als Echtzeit. */
  readonly realTimeFactor: number;
  readonly durationMs: number;
}

export interface SpeechToText {
  readonly name: string;
  transcribe(pcm16: Int16Array, sampleRate: number): Promise<TranscriptionResult>;
  /** Prueft, ob der Adapter einsatzbereit ist. */
  healthCheck(): Promise<{ ok: boolean; message: string }>;
}

/* -------------------------------------------------------------------------- */
/* whisper.cpp                                                                 */
/* -------------------------------------------------------------------------- */

export interface WhisperOptions {
  /** Pfad zur Binary (`whisper-cli` bzw. `main` aus dem offiziellen Repository). */
  readonly binPath: string;
  readonly modelPath: string;
  readonly threads?: number;
  readonly language?: string;
  readonly hints?: HintList;
  readonly extraNames?: readonly string[];
  /** Metal auf Apple Silicon. Wird beim Bauen entschieden, hier nur protokolliert. */
  readonly useMetal?: boolean;
  readonly timeoutMs?: number;
}

/**
 * Adapter fuer whisper.cpp.
 *
 * Der Aufruf laeuft ueber die Kommandozeile mit einer temporaeren WAV-Datei.
 * Das ist bewusst so: eine native Bindung muesste auf Apple Silicon und auf
 * dem Linux-Host jeweils passend gebaut werden, und ein Absturz im Modell
 * wuerde den Telefonprozess mitreissen. Ein eigener Prozess ist hier die
 * robustere Wahl; die WAV-Datei liegt im temporaeren Verzeichnis und wird
 * unmittelbar nach der Erkennung geloescht (STORE_RAW_AUDIO=false).
 */
export class WhisperCppStt implements SpeechToText {
  readonly name = 'whisper.cpp';

  constructor(private readonly opts: WhisperOptions) {}

  async transcribe(pcm16: Int16Array, sampleRate: number): Promise<TranscriptionResult> {
    const t0 = Date.now();
    const durationMs = (pcm16.length / sampleRate) * 1000;
    const dir = await mkdtemp(join(tmpdir(), 'jarvis-stt-'));
    const wavPath = join(dir, 'in.wav');

    try {
      await writeFile(wavPath, wavFromPcm16(pcm16, sampleRate));

      const args = [
        '-m',
        this.opts.modelPath,
        '-f',
        wavPath,
        '-l',
        this.opts.language ?? 'de',
        '-t',
        String(this.opts.threads ?? 4),
        '--output-txt',
        '--output-file',
        join(dir, 'out'),
        '--no-timestamps',
        '--prompt',
        buildInitialPrompt(this.opts.hints ?? DEFAULT_HINTS, this.opts.extraNames ?? []),
      ];

      await runProcess(this.opts.binPath, args, this.opts.timeoutMs ?? 30_000);
      const raw = await readFile(join(dir, 'out.txt'), 'utf8');
      const text = applyCorrections(cleanTranscript(raw), this.opts.hints ?? DEFAULT_HINTS);
      const latencyMs = Date.now() - t0;

      return {
        text,
        language: this.opts.language ?? 'de',
        latencyMs,
        realTimeFactor: durationMs > 0 ? latencyMs / durationMs : 0,
        durationMs,
      };
    } finally {
      // Roh-Audio wird sofort und unabhaengig vom Ausgang verworfen.
      await rm(dir, { recursive: true, force: true });
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await runProcess(this.opts.binPath, ['-h'], 5000);
      return { ok: true, message: `whisper.cpp erreichbar, Modell ${this.opts.modelPath}` };
    } catch (err) {
      return {
        ok: false,
        message: `whisper.cpp nicht ausfuehrbar (${this.opts.binPath}): ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/** Entfernt die Marker, die whisper.cpp bei Stille oder Musik ausgibt. */
export function cleanTranscript(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Mock                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Erkenner fuer Simulation und Tests. Liefert vorher festgelegte Texte,
 * damit ein Gespraechsablauf ohne Mikrofon und ohne Modell durchgespielt
 * werden kann.
 */
export class ScriptedStt implements SpeechToText {
  readonly name = 'scripted';
  private queue: string[];
  readonly transcribed: { samples: number; sampleRate: number }[] = [];
  /** Kuenstliche Verzoegerung, um Latenzverhalten zu testen. */
  latencyMs = 0;

  constructor(utterances: readonly string[] = []) {
    this.queue = [...utterances];
  }

  push(...utterances: string[]): void {
    this.queue.push(...utterances);
  }

  get remaining(): number {
    return this.queue.length;
  }

  async transcribe(pcm16: Int16Array, sampleRate: number): Promise<TranscriptionResult> {
    this.transcribed.push({ samples: pcm16.length, sampleRate });
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const text = this.queue.shift() ?? '';
    const durationMs = (pcm16.length / sampleRate) * 1000;
    return {
      text: applyCorrections(text),
      language: 'de',
      latencyMs: this.latencyMs,
      realTimeFactor: durationMs > 0 ? this.latencyMs / durationMs : 0,
      durationMs,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'Simulierte Spracherkennung' };
  }
}

/* -------------------------------------------------------------------------- */
/* Hilfsmittel                                                                 */
/* -------------------------------------------------------------------------- */

/** Schreibt einen WAV-Header vor die PCM-Daten (16 Bit, Mono). */
export function wavFromPcm16(pcm: Int16Array, sampleRate: number): Buffer {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i += 1) buf.writeInt16LE(pcm[i] ?? 0, 44 + i * 2);
  return buf;
}

/** Liest PCM aus einer WAV-Datei (16 Bit Mono, wie sie hier erzeugt wird). */
export function pcm16FromWav(buf: Buffer): { pcm: Int16Array; sampleRate: number } {
  const sampleRate = buf.readUInt32LE(24);
  const dataSize = buf.readUInt32LE(40);
  const n = Math.floor(dataSize / 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i += 1) pcm[i] = buf.readInt16LE(44 + i * 2);
  return { pcm, sampleRate };
}

export async function runProcess(bin: string, args: readonly string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args as string[],
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`${bin} fehlgeschlagen: ${err.message}${stderr ? ` (${stderr.slice(0, 400)})` : ''}`));
          return;
        }
        resolve(stdout);
      },
    );
    child.on('error', reject);
  });
}

export const STT_TARGET_SAMPLE_RATE = STT_SAMPLE_RATE;

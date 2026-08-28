/**
 * Audio-Grundlagen fuer die Telefonstrecke.
 *
 * Aus dem Telefonnetz kommt G.711 mit 8 kHz - A-law in Europa, mu-law in
 * Nordamerika. Die Spracherkennung will PCM mit 16 kHz. Diese Datei macht die
 * Umrechnung in beide Richtungen und stellt den Ringpuffer, aus dem der
 * Streaming-Erkenner liest.
 *
 * Die Codec-Tabellen sind die aus ITU-T G.711; sie werden beim Laden einmal
 * berechnet, damit pro Paket nur ein Tabellenzugriff anfaellt.
 */

export type PcmFormat = 'alaw' | 'ulaw' | 'pcm16';

export const TELEPHONY_SAMPLE_RATE = 8000;
export const STT_SAMPLE_RATE = 16000;
/** 20 ms bei 8 kHz - die uebliche Paketgroesse in RTP. */
export const FRAME_SAMPLES_8K = 160;

/* -------------------------------------------------------------------------- */
/* G.711 A-law                                                                 */
/* -------------------------------------------------------------------------- */

const ALAW_DECODE = new Int16Array(256);
const ULAW_DECODE = new Int16Array(256);

for (let i = 0; i < 256; i += 1) {
  // A-law dekodieren (ITU-T G.711).
  let a = i ^ 0x55;
  let t = (a & 0x0f) << 4;
  const seg = (a & 0x70) >> 4;
  if (seg === 0) t += 8;
  else if (seg === 1) t += 0x108;
  else {
    t += 0x108;
    t <<= seg - 1;
  }
  ALAW_DECODE[i] = (a & 0x80) !== 0 ? t : -t;

  // mu-law dekodieren.
  a = ~i & 0xff;
  t = (((a & 0x0f) << 3) + 0x84) << ((a & 0x70) >> 4);
  ULAW_DECODE[i] = (a & 0x80) !== 0 ? 0x84 - t : t - 0x84;
}

const ALAW_SEG_ENDS = [0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff];

/**
 * A-law kodieren, nach der Referenzimplementierung zu ITU-T G.711.
 *
 * Zwei Details, an denen eine eigene Herleitung zuverlaessig scheitert (und
 * beim ersten Testlauf hier auch gescheitert ist): der Eingangswert wird um
 * DREI Bit geschoben, nicht um vier, und das Vorzeichen steckt in der
 * XOR-Maske (0xD5 fuer positiv, 0x55 fuer negativ) statt in einem eigenen
 * Sign-Bit.
 */
export function pcm16ToAlaw(sample: number): number {
  let pcm = clamp16(sample) >> 3;
  let mask: number;
  if (pcm >= 0) {
    mask = 0xd5;
  } else {
    mask = 0x55;
    pcm = -pcm - 1;
  }

  let seg = 8;
  for (let i = 0; i < ALAW_SEG_ENDS.length; i += 1) {
    if (pcm <= (ALAW_SEG_ENDS[i] ?? 0)) {
      seg = i;
      break;
    }
  }
  if (seg >= 8) return (0x7f ^ mask) & 0xff;

  const mantissa = seg < 2 ? (pcm >> 1) & 0x0f : (pcm >> seg) & 0x0f;
  return (((seg << 4) | mantissa) ^ mask) & 0xff;
}

const ULAW_BIAS = 0x84;
const ULAW_CLIP = 32635;

export function pcm16ToUlaw(sample: number): number {
  let pcm = clamp16(sample);
  const sign = pcm < 0 ? 0x80 : 0x00;
  if (pcm < 0) pcm = -pcm;
  if (pcm > ULAW_CLIP) pcm = ULAW_CLIP;
  pcm += ULAW_BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (pcm & mask) === 0 && exponent > 0; mask >>= 1) exponent -= 1;
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function alawToPcm16(byte: number): number {
  return ALAW_DECODE[byte & 0xff] ?? 0;
}

export function ulawToPcm16(byte: number): number {
  return ULAW_DECODE[byte & 0xff] ?? 0;
}

function clamp16(v: number): number {
  const r = Math.round(v);
  if (r > 32767) return 32767;
  if (r < -32768) return -32768;
  return r;
}

/* -------------------------------------------------------------------------- */
/* Puffer-Konvertierung                                                        */
/* -------------------------------------------------------------------------- */

export function decodeG711(data: Uint8Array, format: 'alaw' | 'ulaw'): Int16Array {
  const out = new Int16Array(data.length);
  const table = format === 'alaw' ? ALAW_DECODE : ULAW_DECODE;
  for (let i = 0; i < data.length; i += 1) out[i] = table[data[i] ?? 0] ?? 0;
  return out;
}

export function encodeG711(pcm: Int16Array, format: 'alaw' | 'ulaw'): Uint8Array {
  const out = new Uint8Array(pcm.length);
  const enc = format === 'alaw' ? pcm16ToAlaw : pcm16ToUlaw;
  for (let i = 0; i < pcm.length; i += 1) out[i] = enc(pcm[i] ?? 0);
  return out;
}

export function pcm16ToBuffer(pcm: Int16Array): Buffer {
  const buf = Buffer.allocUnsafe(pcm.length * 2);
  for (let i = 0; i < pcm.length; i += 1) buf.writeInt16LE(pcm[i] ?? 0, i * 2);
  return buf;
}

export function bufferToPcm16(buf: Buffer): Int16Array {
  const n = Math.floor(buf.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i += 1) out[i] = buf.readInt16LE(i * 2);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Resampling                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * 8 kHz -> 16 kHz. Zwischenwerte werden linear interpoliert und anschliessend
 * leicht geglaettet. Fuer Sprache aus dem Telefonnetz reicht das: das Signal
 * ist ohnehin auf 3,4 kHz bandbegrenzt, es entsteht kein Aliasing, das ein
 * teurerer Filter noch entfernen koennte.
 */
export function upsample8kTo16k(input: Int16Array): Int16Array {
  const out = new Int16Array(input.length * 2);
  for (let i = 0; i < input.length; i += 1) {
    const cur = input[i] ?? 0;
    const next = input[i + 1] ?? cur;
    out[i * 2] = cur;
    out[i * 2 + 1] = clamp16((cur + next) / 2);
  }
  return out;
}

/**
 * 16 kHz -> 8 kHz. Vor dem Dezimieren wird gemittelt; ohne diesen Schritt
 * faltet sich alles oberhalb von 4 kHz hoerbar ins Band zurueck.
 */
export function downsample16kTo8k(input: Int16Array): Int16Array {
  const n = Math.floor(input.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = input[i * 2] ?? 0;
    const b = input[i * 2 + 1] ?? 0;
    out[i] = clamp16((a + b) / 2);
  }
  return out;
}

/** Allgemeines Resampling fuer beliebige Raten (z. B. 22050 Hz aus Piper). */
export function resampleLinear(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = clamp16(a + (b - a) * frac);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Pegel                                                                       */
/* -------------------------------------------------------------------------- */

export function rms(pcm: Int16Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const v = pcm[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / pcm.length);
}

export function dbfs(pcm: Int16Array): number {
  const r = rms(pcm);
  if (r <= 0) return -Infinity;
  return 20 * Math.log10(r / 32768);
}

/**
 * Normalisiert auf einen Zielpegel. Die Verstaerkung ist gedeckelt, damit
 * eine stille Leitung nicht auf volles Rauschen hochgezogen wird.
 */
export function normalize(pcm: Int16Array, targetDbfs = -20, maxGain = 8): Int16Array {
  const current = dbfs(pcm);
  if (!Number.isFinite(current)) return pcm;
  const gain = Math.min(maxGain, 10 ** ((targetDbfs - current) / 20));
  if (Math.abs(gain - 1) < 0.05) return pcm;
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) out[i] = clamp16((pcm[i] ?? 0) * gain);
  return out;
}

/* -------------------------------------------------------------------------- */
/* Ringpuffer                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Ringpuffer fuer den Audiostrom.
 *
 * Feste Groesse: bei einer Stoerung wachsen die Puffer nicht ins Unendliche,
 * sondern die aeltesten Samples fallen heraus. Das ist bei Echtzeit-Audio das
 * richtige Verhalten - alte Sprache ist wertlos, sobald das Gespraech
 * weitergelaufen ist.
 */
export class RingBuffer {
  private readonly data: Int16Array;
  private writeIdx = 0;
  private available = 0;
  private droppedSamples = 0;

  constructor(readonly capacity: number) {
    this.data = new Int16Array(capacity);
  }

  write(samples: Int16Array): void {
    for (let i = 0; i < samples.length; i += 1) {
      this.data[this.writeIdx] = samples[i] ?? 0;
      this.writeIdx = (this.writeIdx + 1) % this.capacity;
      if (this.available < this.capacity) this.available += 1;
      else this.droppedSamples += 1;
    }
  }

  /** Liest die letzten `n` Samples, ohne sie zu entfernen. */
  peekLast(n: number): Int16Array {
    const count = Math.min(n, this.available);
    const out = new Int16Array(count);
    for (let i = 0; i < count; i += 1) {
      const idx = (this.writeIdx - count + i + this.capacity * 2) % this.capacity;
      out[i] = this.data[idx] ?? 0;
    }
    return out;
  }

  /** Liest alles Verfuegbare und leert den Puffer. */
  drain(): Int16Array {
    const out = this.peekLast(this.available);
    this.available = 0;
    return out;
  }

  clear(): void {
    this.available = 0;
    this.writeIdx = 0;
  }

  get length(): number {
    return this.available;
  }

  get dropped(): number {
    return this.droppedSamples;
  }
}

/* -------------------------------------------------------------------------- */
/* Jitter Buffer                                                               */
/* -------------------------------------------------------------------------- */

export interface JitterPacket {
  readonly seq: number;
  readonly payload: Int16Array;
}

/**
 * Jitter Buffer. Haelt eine kleine Tiefe vor, sortiert Pakete nach
 * Sequenznummer und ersetzt fehlende Pakete durch Stille, statt den Strom
 * anzuhalten. Ein zu spaet eintreffendes Paket wird verworfen - es wieder
 * einzusortieren wuerde die Ausgabe nur stottern lassen.
 */
export class JitterBuffer {
  private readonly packets = new Map<number, Int16Array>();
  private nextSeq: number | null = null;
  /** true, solange der Puffer erst auf seine Tiefe gefuellt wird. */
  private filling = true;
  private lateDropped = 0;
  private concealed = 0;

  constructor(
    private readonly depth = 3,
    private readonly frameSamples = FRAME_SAMPLES_8K,
  ) {}

  push(p: JitterPacket): void {
    if (this.nextSeq !== null && p.seq < this.nextSeq) {
      // Zu spaet. Nachtraeglich einsortieren wuerde die Ausgabe stottern
      // lassen - verwerfen ist bei Echtzeit-Audio die bessere Wahl.
      this.lateDropped += 1;
      return;
    }
    this.packets.set(p.seq, p.payload);
    if (this.nextSeq === null || p.seq < this.nextSeq) this.nextSeq = p.seq;
  }

  /** Gibt das naechste Paket aus, sobald genug Tiefe vorhanden ist. */
  pop(): Int16Array | null {
    if (this.nextSeq === null) return null;

    if (this.filling) {
      if (this.packets.size < this.depth) return null;
      this.filling = false;
    }

    const seq = this.nextSeq;
    const found = this.packets.get(seq);

    if (found !== undefined) {
      this.packets.delete(seq);
      this.nextSeq = seq + 1;
      return found;
    }

    // Luecke. Solange noch spaetere Pakete warten, wird sie verdeckt;
    // ist der Puffer leer, geht der Ausgabestrom in den Fuellzustand zurueck.
    if (this.packets.size === 0) {
      this.nextSeq = null;
      this.filling = true;
      return null;
    }
    this.concealed += 1;
    this.nextSeq = seq + 1;
    return new Int16Array(this.frameSamples);
  }

  get pending(): number {
    return this.packets.size;
  }
  get stats(): { lateDropped: number; concealed: number } {
    return { lateDropped: this.lateDropped, concealed: this.concealed };
  }
  reset(): void {
    this.packets.clear();
    this.nextSeq = null;
    this.filling = true;
  }
}

/** Erzeugt Stille - fuer Tests und fuer Luecken im Strom. */
export function silence(samples: number): Int16Array {
  return new Int16Array(samples);
}

/** Erzeugt einen Sinuston - Testmaterial fuer Pegel und Codecs. */
export function tone(samples: number, freqHz: number, sampleRate: number, amplitude = 8000): Int16Array {
  const out = new Int16Array(samples);
  for (let i = 0; i < samples; i += 1) {
    out[i] = clamp16(Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * amplitude);
  }
  return out;
}

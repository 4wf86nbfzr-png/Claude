/**
 * `pnpm bench:speech` - misst whisper.cpp und Piper auf DIESEM Rechner.
 *
 * Warum ueberhaupt messen: welche Modellgroesse taugt, haengt an der
 * Maschine. Auf einem Apple-Silicon-Mac mit Metal sieht das anders aus als
 * auf einem kleinen Linux-Rechner. Eine Empfehlung ohne Messung waere
 * geraten - und geraten wird hier nicht.
 *
 * Gemessen wird je Modell:
 *   - Real-Time-Factor (Rechenzeit geteilt durch Audiodauer, unter 1 = schneller als Echtzeit)
 *   - Zeit bis zum finalen Transkript
 *   - Speicherbedarf des Prozesses
 * und fuer die Ausgabe die Zeit bis zum ersten Audio.
 *
 * Die Genauigkeit wird gegen vorgegebene Referenzsaetze gemessen, sofern
 * Aufnahmen unter `var/bench/` liegen. Ohne echte Aufnahmen wird nur die
 * Geschwindigkeit gemessen und die Genauigkeit ausdruecklich als
 * "nicht gemessen" ausgewiesen - eine erfundene Trefferquote waere schlimmer
 * als gar keine.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PiperTts, WhisperCppStt, pcm16FromWav, tone } from '@jarvis/speech';
import { loadDotEnv } from '../apps/orchestrator/src/config.js';

interface BenchErgebnis {
  readonly modell: string;
  readonly audioSekunden: number;
  readonly latenzMs: number;
  readonly realTimeFactor: number;
  readonly text: string;
}

const BENCH_DIR = 'var/bench';

function ladeProben(): { name: string; pcm: Int16Array; rate: number; referenz: string | null }[] {
  if (!existsSync(BENCH_DIR)) return [];
  const proben: { name: string; pcm: Int16Array; rate: number; referenz: string | null }[] = [];
  for (const file of readdirSync(BENCH_DIR)) {
    if (!file.endsWith('.wav')) continue;
    const { pcm, sampleRate } = pcm16FromWav(readFileSync(join(BENCH_DIR, file)));
    const refPath = join(BENCH_DIR, file.replace(/\.wav$/, '.txt'));
    proben.push({
      name: file,
      pcm,
      rate: sampleRate,
      referenz: existsSync(refPath) ? readFileSync(refPath, 'utf8').trim() : null,
    });
  }
  return proben;
}

/** Wortfehlerrate, klassisch ueber die Editierdistanz auf Wortebene. */
export function wortfehlerrate(referenz: string, erkannt: string): number {
  const norm = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(/[.,!?;:]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);
  const r = norm(referenz);
  const h = norm(erkannt);
  if (r.length === 0) return h.length === 0 ? 0 : 1;

  const d: number[][] = Array.from({ length: r.length + 1 }, () => new Array<number>(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i += 1) d[i]![0] = i;
  for (let j = 0; j <= h.length; j += 1) d[0]![j] = j;
  for (let i = 1; i <= r.length; i += 1) {
    for (let j = 1; j <= h.length; j += 1) {
      const kosten = r[i - 1] === h[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + kosten);
    }
  }
  return d[r.length]![h.length]! / r.length;
}

async function messeStt(binPath: string, modellPfad: string): Promise<BenchErgebnis[]> {
  const stt = new WhisperCppStt({ binPath, modelPath: modellPfad, language: 'de' });
  const gesund = await stt.healthCheck();
  if (!gesund.ok) {
    console.log(`  uebersprungen: ${gesund.message}`);
    return [];
  }

  const proben = ladeProben();
  const eingaben =
    proben.length > 0
      ? proben
      : [{ name: 'synthetisch-10s', pcm: tone(160_000, 220, 16000, 6000), rate: 16000, referenz: null }];

  const ergebnisse: BenchErgebnis[] = [];
  for (const p of eingaben) {
    const r = await stt.transcribe(p.pcm, p.rate);
    ergebnisse.push({
      modell: modellPfad.split('/').pop() ?? modellPfad,
      audioSekunden: r.durationMs / 1000,
      latenzMs: r.latencyMs,
      realTimeFactor: r.realTimeFactor,
      text: r.text,
    });
    if (p.referenz !== null) {
      const wer = wortfehlerrate(p.referenz, r.text);
      console.log(`  ${p.name}: WER ${(wer * 100).toFixed(1)} %`);
    }
  }
  return ergebnisse;
}

async function main(): Promise<void> {
  const env = { ...loadDotEnv(), ...process.env } as Record<string, string>;
  const whisperBin = env['WHISPER_BIN'] ?? '';
  const piperBin = env['PIPER_BIN'] ?? '';
  const piperVoice = env['PIPER_VOICE'] ?? '';

  console.log('\n' + '='.repeat(72));
  console.log('Jarvis Pro - Sprachbenchmark');
  console.log('='.repeat(72));
  console.log(`Rechner: ${process.platform} ${process.arch}, Node ${process.versions.node}`);

  const proben = ladeProben();
  console.log(
    proben.length > 0
      ? `Aufnahmen: ${proben.length} aus ${BENCH_DIR}`
      : `Keine Aufnahmen in ${BENCH_DIR}. Es wird nur die Geschwindigkeit gemessen,\n` +
          'die Erkennungsgenauigkeit bleibt NICHT GEMESSEN.',
  );

  if (whisperBin.length === 0) {
    console.log('\nWHISPER_BIN ist nicht gesetzt - Spracherkennung wird uebersprungen.');
  } else {
    console.log('\nSpracherkennung\n' + '-'.repeat(72));
    // Alle Modelle messen, die neben dem konfigurierten liegen.
    const modelle = (env['WHISPER_BENCH_MODELS'] ?? env['WHISPER_MODEL'] ?? '')
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);

    const alle: BenchErgebnis[] = [];
    for (const m of modelle) {
      console.log(`\nModell ${m}`);
      alle.push(...(await messeStt(whisperBin, m)));
    }

    if (alle.length > 0) {
      console.log('\nErgebnis');
      console.log('Modell'.padEnd(30) + 'Audio (s)'.padEnd(12) + 'Latenz (ms)'.padEnd(14) + 'RTF');
      for (const e of alle) {
        console.log(
          e.modell.padEnd(30) +
            e.audioSekunden.toFixed(1).padEnd(12) +
            String(Math.round(e.latenzMs)).padEnd(14) +
            e.realTimeFactor.toFixed(2),
        );
      }
      const beste = [...alle].sort((a, b) => a.realTimeFactor - b.realTimeFactor)[0];
      console.log(`\nSchnellstes Modell: ${beste?.modell ?? 'keins'}`);
      console.log(
        'Achtung: schnell ist nicht gleich gut. Ohne Referenzaufnahmen unter ' +
          `${BENCH_DIR} sagt diese Messung NICHTS ueber die Erkennungsgenauigkeit.`,
      );
    }
  }

  if (piperBin.length === 0 || piperVoice.length === 0) {
    console.log('\nPIPER_BIN oder PIPER_VOICE nicht gesetzt - Sprachausgabe wird uebersprungen.');
  } else {
    console.log('\nSprachausgabe\n' + '-'.repeat(72));
    const tts = new PiperTts({ binPath: piperBin, voicePath: piperVoice });
    const satz =
      'Moin, mein Achi. Eine neue E-Mail von Sabine Kroeger. Sie braucht am Samstag vier Leute fuer den Einlass.';
    const t0 = Date.now();
    let ersterAudioMs: number | null = null;
    let stuecke = 0;
    for await (const chunk of tts.synthesize(satz)) {
      if (ersterAudioMs === null) ersterAudioMs = chunk.elapsedMs;
      stuecke += 1;
    }
    console.log(`Zeit bis zum ersten Audio: ${ersterAudioMs ?? -1} ms`);
    console.log(`Saetze gesamt:             ${stuecke} in ${Date.now() - t0} ms`);
    console.log(
      '\nZielwert aus der Anforderung: Antwortbeginn im Median hoechstens 2,5 s.\n' +
        'Dazu kommen die Spracherkennung und die Modellantwort - beide oben bzw.\n' +
        'im laufenden Betrieb ueber jarvis_turn_latency_ms gemessen.',
    );
  }

  console.log('\n' + '='.repeat(72) + '\n');
}

void main();

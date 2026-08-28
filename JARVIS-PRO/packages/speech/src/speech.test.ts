import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  JitterBuffer,
  RingBuffer,
  alawToPcm16,
  decodeG711,
  dbfs,
  downsample16kTo8k,
  encodeG711,
  normalize,
  pcm16ToAlaw,
  pcm16ToUlaw,
  resampleLinear,
  rms,
  silence,
  tone,
  ulawToPcm16,
  upsample8kTo16k,
} from './audio.js';
import { EnergyVad, zeroCrossingRate } from './vad.js';
import { applyCorrections, buildInitialPrompt } from './hints.js';
import { applyLexicon } from './lexicon.js';
import { MockTts, splitSentences } from './tts.js';
import { ScriptedStt, cleanTranscript, pcm16FromWav, wavFromPcm16 } from './stt.js';

describe('G.711', () => {
  it('A-law: Rueckweg bleibt nahe am Original', () => {
    // G.711 ist verlustbehaftet; entscheidend ist, dass der Fehler
    // logarithmisch klein bleibt, nicht dass er null ist.
    const input = tone(800, 440, 8000, 12000);
    const roundTrip = decodeG711(encodeG711(input, 'alaw'), 'alaw');

    let maxRelErr = 0;
    for (let i = 0; i < input.length; i += 1) {
      const a = input[i] ?? 0;
      const b = roundTrip[i] ?? 0;
      if (Math.abs(a) < 200) continue;
      maxRelErr = Math.max(maxRelErr, Math.abs(a - b) / Math.abs(a));
    }
    expect(maxRelErr).toBeLessThan(0.08);
  });

  it('mu-law: Rueckweg bleibt nahe am Original', () => {
    const input = tone(800, 440, 8000, 12000);
    const roundTrip = decodeG711(encodeG711(input, 'ulaw'), 'ulaw');

    let maxRelErr = 0;
    for (let i = 0; i < input.length; i += 1) {
      const a = input[i] ?? 0;
      const b = roundTrip[i] ?? 0;
      if (Math.abs(a) < 200) continue;
      maxRelErr = Math.max(maxRelErr, Math.abs(a - b) / Math.abs(a));
    }
    expect(maxRelErr).toBeLessThan(0.08);
  });

  it('kodiert Stille als Stille', () => {
    const encoded = encodeG711(silence(160), 'alaw');
    const decoded = decodeG711(encoded, 'alaw');
    expect(rms(decoded)).toBeLessThan(10);
  });

  it('bleibt fuer jeden 16-Bit-Wert im gueltigen Byte-Bereich', () => {
    fc.assert(
      fc.property(fc.integer({ min: -32768, max: 32767 }), (v) => {
        const a = pcm16ToAlaw(v);
        const u = pcm16ToUlaw(v);
        return a >= 0 && a <= 255 && u >= 0 && u <= 255;
      }),
      { numRuns: 500 },
    );
  });

  it('erhaelt das Vorzeichen', () => {
    fc.assert(
      fc.property(fc.integer({ min: -32768, max: 32767 }), (v) => {
        if (Math.abs(v) < 64) return true;
        const a = alawToPcm16(pcm16ToAlaw(v));
        const u = ulawToPcm16(pcm16ToUlaw(v));
        return Math.sign(a) === Math.sign(v) && Math.sign(u) === Math.sign(v);
      }),
      { numRuns: 500 },
    );
  });
});

describe('Resampling', () => {
  it('8k -> 16k verdoppelt die Laenge und erhaelt den Pegel', () => {
    const input = tone(400, 440, 8000, 10000);
    const up = upsample8kTo16k(input);
    expect(up.length).toBe(800);
    expect(Math.abs(dbfs(up) - dbfs(input))).toBeLessThan(1.5);
  });

  it('16k -> 8k halbiert die Laenge', () => {
    const input = tone(800, 440, 16000, 10000);
    const down = downsample16kTo8k(input);
    expect(down.length).toBe(400);
  });

  it('Hin- und Rueckweg erhaelt Dauer und Pegel', () => {
    const input = tone(800, 300, 8000, 9000);
    const back = downsample16kTo8k(upsample8kTo16k(input));
    expect(back.length).toBe(input.length);
    expect(Math.abs(dbfs(back) - dbfs(input))).toBeLessThan(2);
  });

  it('resampleLinear von 22050 auf 8000 trifft die erwartete Laenge', () => {
    const input = tone(22050, 200, 22050, 8000);
    const out = resampleLinear(input, 22050, 8000);
    expect(out.length).toBeGreaterThan(7900);
    expect(out.length).toBeLessThan(8100);
  });
});

describe('Pegel', () => {
  it('normalisiert leise Sprache nach oben', () => {
    const quiet = tone(1600, 300, 8000, 300);
    const loud = normalize(quiet, -20);
    expect(dbfs(loud)).toBeGreaterThan(dbfs(quiet));
  });

  it('zieht Stille nicht hoch', () => {
    const s = silence(1600);
    const out = normalize(s, -20);
    expect(rms(out)).toBe(0);
  });

  it('deckelt die Verstaerkung', () => {
    const veryQuiet = tone(1600, 300, 8000, 5);
    const out = normalize(veryQuiet, -20, 4);
    // Bei maxGain 4 darf der Pegel hoechstens um 12 dB steigen.
    expect(dbfs(out) - dbfs(veryQuiet)).toBeLessThanOrEqual(12.1);
  });
});

describe('RingBuffer', () => {
  it('haelt die letzten Samples und zaehlt Verluste', () => {
    const rb = new RingBuffer(100);
    rb.write(new Int16Array([1, 2, 3]));
    expect(rb.length).toBe(3);
    expect([...rb.peekLast(3)]).toEqual([1, 2, 3]);

    rb.write(new Int16Array(200).fill(7));
    expect(rb.length).toBe(100);
    expect(rb.dropped).toBeGreaterThan(0);
    expect([...rb.peekLast(2)]).toEqual([7, 7]);
  });

  it('drain leert den Puffer', () => {
    const rb = new RingBuffer(50);
    rb.write(new Int16Array([5, 6]));
    expect([...rb.drain()]).toEqual([5, 6]);
    expect(rb.length).toBe(0);
  });
});

describe('JitterBuffer', () => {
  it('sortiert vertauschte Pakete', () => {
    const jb = new JitterBuffer(2, 4);
    jb.push({ seq: 1, payload: new Int16Array([1, 1, 1, 1]) });
    jb.push({ seq: 3, payload: new Int16Array([3, 3, 3, 3]) });
    jb.push({ seq: 2, payload: new Int16Array([2, 2, 2, 2]) });

    expect(jb.pop()?.[0]).toBe(1);
    expect(jb.pop()?.[0]).toBe(2);
    expect(jb.pop()?.[0]).toBe(3);
  });

  it('ersetzt ein fehlendes Paket durch Stille, statt anzuhalten', () => {
    const jb = new JitterBuffer(2, 4);
    jb.push({ seq: 1, payload: new Int16Array([1, 1, 1, 1]) });
    jb.push({ seq: 3, payload: new Int16Array([3, 3, 3, 3]) });

    expect(jb.pop()?.[0]).toBe(1);
    expect(jb.pop()?.[0]).toBe(0); // Luecke wird verdeckt
    expect(jb.pop()?.[0]).toBe(3);
    expect(jb.stats.concealed).toBe(1);
  });

  it('verwirft zu spaet eintreffende Pakete', () => {
    const jb = new JitterBuffer(1, 4);
    jb.push({ seq: 5, payload: new Int16Array(4) });
    jb.pop();
    jb.push({ seq: 4, payload: new Int16Array(4) });
    expect(jb.stats.lateDropped).toBe(1);
  });
});

describe('VAD', () => {
  const frame = (samples: Int16Array): Int16Array => samples;

  it('erkennt Sprachbeginn und Sprachende', () => {
    const vad = new EnergyVad({ sampleRate: 8000, silenceMs: 300, minSpeechMs: 100, adaptNoiseFloor: false });
    const events: string[] = [];
    let t = 0;
    const step = 20;

    for (let i = 0; i < 10; i += 1) {
      const e = vad.push(frame(silence(160)), t);
      if (e) events.push(e.type);
      t += step;
    }
    for (let i = 0; i < 20; i += 1) {
      const e = vad.push(frame(tone(160, 300, 8000, 9000)), t);
      if (e) events.push(e.type);
      t += step;
    }
    for (let i = 0; i < 30; i += 1) {
      const e = vad.push(frame(silence(160)), t);
      if (e) events.push(e.type);
      t += step;
    }

    expect(events).toEqual(['speech_start', 'speech_end']);
  });

  it('haelt Stille nicht fuer Sprache', () => {
    const vad = new EnergyVad({ sampleRate: 8000, adaptNoiseFloor: false });
    let t = 0;
    for (let i = 0; i < 100; i += 1) {
      expect(vad.push(silence(160), t)).toBeNull();
      t += 20;
    }
    expect(vad.isSpeaking).toBe(false);
  });

  it('ignoriert einen sehr kurzen Stoerimpuls', () => {
    const vad = new EnergyVad({ sampleRate: 8000, minSpeechMs: 200, adaptNoiseFloor: false });
    let t = 0;
    // 40 ms Laerm - unter der Mindestdauer.
    for (let i = 0; i < 2; i += 1) {
      vad.push(tone(160, 300, 8000, 9000), t);
      t += 20;
    }
    expect(vad.isSpeaking).toBe(false);
  });

  it('isLikelySpeech schlaegt bei Sprache an, nicht bei Stille', () => {
    const vad = new EnergyVad({ sampleRate: 8000, adaptNoiseFloor: false });
    expect(vad.isLikelySpeech(tone(160, 300, 8000, 9000))).toBe(true);
    expect(vad.isLikelySpeech(silence(160))).toBe(false);
  });

  it('Nulldurchgangsrate: Stille null, Rauschen hoch', () => {
    expect(zeroCrossingRate(silence(100))).toBe(0);
    const alternating = new Int16Array(100);
    for (let i = 0; i < 100; i += 1) alternating[i] = i % 2 === 0 ? 1000 : -1000;
    expect(zeroCrossingRate(alternating)).toBeGreaterThan(0.9);
  });
});

describe('Satztrennung', () => {
  it('trennt normale Saetze', () => {
    expect(splitSentences('Moin. Wie geht es dir? Alles klar!')).toEqual([
      'Moin.',
      'Wie geht es dir?',
      'Alles klar!',
    ]);
  });

  it('trennt nicht bei Ordinalzahlen', () => {
    const out = splitSentences('Der Einsatz ist am 9. Mai am Nordtor.');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('9. Mai');
  });

  it('trennt nicht bei Abkuerzungen', () => {
    expect(splitSentences('Bring bitte Warnwesten mit, z. B. vier Stueck.')).toHaveLength(1);
  });

  it('trennt nicht bei Uhrzeiten und Betraegen', () => {
    expect(splitSentences('Beginn 17.30 Uhr, Kosten 249.90 Euro.')).toHaveLength(1);
  });

  it('behaelt die Satzzeichen im Text', () => {
    expect(splitSentences('Erster Satz. Zweiter Satz.').join(' ')).toBe('Erster Satz. Zweiter Satz.');
  });
});

describe('Aussprachelexikon', () => {
  it('loest gaengige Abkuerzungen auf', () => {
    expect(applyLexicon('Bitte z. B. bis ca. 17:30 Uhr.')).toContain('zum Beispiel');
    expect(applyLexicon('Bitte z. B. bis ca. 17:30 Uhr.')).toContain('circa');
  });

  it('spricht Uhrzeiten aus', () => {
    expect(applyLexicon('Beginn 17:00')).toContain('17 Uhr');
    expect(applyLexicon('Beginn 17:30')).toContain('17 Uhr 30');
  });

  it('spricht E-Mail-Adressen buchstabengetreu', () => {
    expect(applyLexicon('kroeger@elbe-events.de')).toContain(' at ');
  });
});

describe('Erkennungs-Hints', () => {
  it('korrigiert Eigennamen', () => {
    expect(applyCorrections('Hier ist Noah Benk Hofer von Herm Service Team')).toBe(
      'Hier ist Noah Benkhofer von HERM Service Team',
    );
    expect(applyCorrections('watts app business')).toContain('WhatsApp');
    expect(applyCorrections('Einsatz in Wandsbeck')).toContain('Wandsbek');
  });

  it('baut einen natuerlichen Initial-Prompt', () => {
    const p = buildInitialPrompt();
    expect(p).toContain('Noah Benkhofer');
    expect(p).toContain('Disposition');
    expect(p.startsWith('Telefongespraech')).toBe(true);
  });
});

describe('WAV', () => {
  it('schreibt und liest verlustfrei', () => {
    const pcm = tone(400, 440, 16000, 5000);
    const { pcm: back, sampleRate } = pcm16FromWav(wavFromPcm16(pcm, 16000));
    expect(sampleRate).toBe(16000);
    expect([...back]).toEqual([...pcm]);
  });
});

describe('Transkript-Bereinigung', () => {
  it('entfernt Marker fuer Stille und Musik', () => {
    expect(cleanTranscript('[BLANK_AUDIO] Moin, alles klar. (Musik)')).toBe('Moin, alles klar.');
  });
});

describe('Simulierte Sprachdienste', () => {
  it('ScriptedStt liefert die vorgegebenen Texte der Reihe nach', async () => {
    const stt = new ScriptedStt(['Moin.', 'Ja, senden']);
    expect((await stt.transcribe(silence(8000), 8000)).text).toBe('Moin.');
    expect((await stt.transcribe(silence(8000), 8000)).text).toBe('Ja, senden');
    expect((await stt.transcribe(silence(8000), 8000)).text).toBe('');
  });

  it('MockTts bricht bei einem Abort-Signal sofort ab', async () => {
    const tts = new MockTts();
    tts.msPerSentence = 20;
    const ctrl = new AbortController();

    const chunks: string[] = [];
    const run = (async () => {
      for await (const c of tts.synthesize('Erster Satz. Zweiter Satz. Dritter Satz.', ctrl.signal)) {
        chunks.push(c.text);
        if (chunks.length === 1) ctrl.abort();
      }
    })();
    await run;

    expect(chunks).toHaveLength(1);
    expect(tts.completedSentences).toHaveLength(1);
  });
});

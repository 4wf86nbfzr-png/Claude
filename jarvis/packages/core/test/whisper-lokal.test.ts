import { describe, expect, it, vi } from 'vitest';
import {
  LokaleErkennung,
  saeubere,
  WHISPER_ABTASTRATE,
  type ErkennungsPipeline,
} from '../src/voice/whisper-lokal.js';

/**
 * Das echte Modell wird hier nicht geladen — das wären hunderte Megabyte und
 * ein Netzzugang. Geprüft wird alles drumherum: dass nur einmal geladen wird,
 * dass Fehler als Fehler ankommen und dass Whispers Standfloskeln nicht als
 * Anweisung durchgehen.
 */

const pcm = (sekunden: number) => new Float32Array(Math.round(sekunden * WHISPER_ABTASTRATE));

function baue(pipeline: ErkennungsPipeline, extras: Record<string, unknown> = {}) {
  return new LokaleErkennung({
    modellDir: '/nicht/vorhanden',
    erzeugePipeline: async () => pipeline,
    ...extras,
  });
}

describe('LokaleErkennung', () => {
  it('gibt den erkannten Text zurück', async () => {
    const e = baue(async () => ({ text: '  Was steht heute noch an?  ' }));
    const r = await e.transkribiere(pcm(2));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.text).toBe('Was steht heute noch an?');
  });

  it('lädt das Modell nur einmal, auch bei gleichzeitigen Anfragen', async () => {
    const fabrik = vi.fn(async () => (async () => ({ text: 'ja' })) as ErkennungsPipeline);
    const e = new LokaleErkennung({ modellDir: '/x', erzeugePipeline: fabrik });

    await Promise.all([e.transkribiere(pcm(1)), e.transkribiere(pcm(1)), e.transkribiere(pcm(1))]);
    expect(fabrik).toHaveBeenCalledTimes(1);
    expect(e.geladen).toBe(true);
  });

  it('meldet ein fehlendes Paket als Einrichtungsfehler, nicht als Absturz', async () => {
    const e = new LokaleErkennung({
      modellDir: '/x',
      erzeugePipeline: async () => {
        throw new Error("Cannot find module '@huggingface/transformers'");
      },
    });

    const r = await e.transkribiere(pcm(1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('NOT_CONFIGURED');
    expect(r.error.hint).toContain('npm run stimme');
  });

  it('lässt einen zweiten Versuch zu, wenn das Laden fehlgeschlagen ist', async () => {
    let versuche = 0;
    const e = new LokaleErkennung({
      modellDir: '/x',
      erzeugePipeline: async () => {
        versuche += 1;
        if (versuche === 1) throw new Error('Netz weg');
        return (async () => ({ text: 'jetzt geht es' })) as ErkennungsPipeline;
      },
    });

    expect((await e.transkribiere(pcm(1))).ok).toBe(false);
    const zweiter = await e.transkribiere(pcm(1));
    expect(zweiter.ok).toBe(true);
    if (!zweiter.ok) return;
    expect(zweiter.data.text).toBe('jetzt geht es');
  });

  it('behauptet keinen Erfolg, wenn die Erkennung wirft', async () => {
    const e = baue(async () => {
      throw new Error('kaputt');
    });
    const r = await e.transkribiere(pcm(1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe('PROVIDER_ERROR');
    expect(r.error.message).toContain('kaputt');
  });

  it('weist leere und zu lange Aufnahmen ab, ohne das Modell zu laden', async () => {
    const fabrik = vi.fn(async () => (async () => ({ text: 'x' })) as ErkennungsPipeline);
    const e = new LokaleErkennung({ modellDir: '/x', erzeugePipeline: fabrik });

    expect((await e.transkribiere(new Float32Array(0))).ok).toBe(false);
    const zuLang = await e.transkribiere(pcm(45));
    expect(zuLang.ok).toBe(false);
    if (zuLang.ok) return;
    expect(zuLang.error.message).toContain('zu lang');
    expect(fabrik).not.toHaveBeenCalled();
  });

  it('reicht Sprache und Aufgabe an das Modell durch', async () => {
    const gesehen: Record<string, unknown>[] = [];
    const e = baue(async (_audio, optionen) => {
      gesehen.push(optionen);
      return { text: 'gut' };
    });

    await e.transkribiere(pcm(1));
    expect(gesehen[0]).toMatchObject({ language: 'de', task: 'transcribe' });
  });

  it('misst die Dauer der Erkennung', async () => {
    let t = 1000;
    const e = new LokaleErkennung({
      modellDir: '/x',
      jetzt: () => (t += 250),
      erzeugePipeline: async () => (async () => ({ text: 'hallo' })) as ErkennungsPipeline,
    });
    const r = await e.transkribiere(pcm(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.dauerMs).toBeGreaterThan(0);
  });

  it('nimmt auch ein Array als Antwort der Pipeline', async () => {
    const e = baue(async () => [{ text: 'aus einem Array' }]);
    const r = await e.transkribiere(pcm(1));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.text).toBe('aus einem Array');
  });
});

describe('saeubere', () => {
  it('lässt echte Sätze unverändert', () => {
    expect(saeubere('Leg mir einen Entwurf für die Hafenlogistik an.')).toBe(
      'Leg mir einen Entwurf für die Hafenlogistik an.',
    );
  });

  it('wirft Whispers Untertitel-Floskeln weg', () => {
    // Genau diese Zeilen erfindet Whisper bei Stille aus seinen Trainingsdaten.
    for (const floskel of [
      'Untertitelung des ZDF, 2020',
      'Untertitel im Auftrag des ZDF für funk, 2017',
      'Vielen Dank.',
      'Thanks for watching!',
      'Copyright WDR 2021',
    ]) {
      expect(saeubere(floskel)).toBe('');
    }
  });

  it('wirft reine Satzzeichen und Leerzeichen weg', () => {
    expect(saeubere('   ')).toBe('');
    expect(saeubere('...')).toBe('');
    expect(saeubere('?!')).toBe('');
  });

  it('behält einen Satz, der zufällig mit Dank anfängt', () => {
    expect(saeubere('Vielen Dank, und jetzt schreib bitte an die Firma Meyer.')).toBe(
      'Vielen Dank, und jetzt schreib bitte an die Firma Meyer.',
    );
  });
});

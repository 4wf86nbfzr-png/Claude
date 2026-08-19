import { describe, expect, it } from 'vitest';
import { PROBESATZ, trefferquote, wavAusPcm } from '../src/voice/probe.js';

/**
 * Die Selbstprüfung der Spracherkennung.
 *
 * Sprechen kann diese Testumgebung nicht — dafür braucht es `say` bzw.
 * `espeak` des Betriebssystems. Geprüft wird deshalb der Teil, der erfahrungs-
 * gemäß danebengeht: das Auslesen der Audiodateien und die Frage, ab wann ein
 * Erkennungsergebnis als „hat funktioniert" gilt.
 */

describe('trefferquote', () => {
  it('erkennt eine wortgleiche Wiedergabe', () => {
    expect(trefferquote(PROBESATZ, PROBESATZ)).toBe(1);
  });

  it('ist nachsichtig bei Satzzeichen und Groß-/Kleinschreibung', () => {
    expect(
      trefferquote(PROBESATZ, 'moin hier spricht jarvis bitte leg vier entwürfe für die hafenlogistik an'),
    ).toBe(1);
  });

  it('bewertet eine halbe Erkennung als halb', () => {
    const quote = trefferquote('Moin, hier spricht Jarvis zur Probe', 'Moin hier spricht');
    expect(quote).toBeGreaterThan(0.4);
    expect(quote).toBeLessThan(0.8);
  });

  it('gibt null zurück, wenn nichts erkannt wurde', () => {
    expect(trefferquote(PROBESATZ, '')).toBe(0);
    expect(trefferquote(PROBESATZ, '...')).toBe(0);
  });

  it('lässt sich von einem falschen Eigennamen nicht aus der Ruhe bringen', () => {
    // „Jarvis" versteht Whisper regelmäßig als „Jarvis'" oder „Charles".
    const quote = trefferquote(PROBESATZ, 'Moin, hier spricht Charles. Bitte leg vier Entwürfe für die Hafenlogistik an.');
    expect(quote).toBeGreaterThan(0.85);
  });
});

describe('wavAusPcm', () => {
  it('schreibt einen gültigen WAV-Kopf', () => {
    const wav = wavAusPcm(new Float32Array(1600), 16_000);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.toString('ascii', 36, 40)).toBe('data');
    expect(wav.readUInt16LE(22)).toBe(1); // einkanalig
    expect(wav.readUInt32LE(24)).toBe(16_000);
    expect(wav.readUInt16LE(34)).toBe(16); // Bit je Wert
    expect(wav.length).toBe(44 + 1600 * 2);
  });

  it('rechnet Fließkomma auf Ganzzahlen um', () => {
    const wav = wavAusPcm(new Float32Array([0, 0.5, -0.5, 1, -1]), 16_000);
    expect(wav.readInt16LE(44)).toBe(0);
    expect(wav.readInt16LE(46)).toBeCloseTo(16_384, -2);
    expect(wav.readInt16LE(48)).toBeCloseTo(-16_384, -2);
    expect(wav.readInt16LE(50)).toBe(32_767);
    expect(wav.readInt16LE(52)).toBe(-32_767);
  });

  it('begrenzt Werte außerhalb des Bereichs, statt überzulaufen', () => {
    // Ohne Begrenzung würde aus einem lauten Wort ein Knacken.
    const wav = wavAusPcm(new Float32Array([3.5, -2.8]), 16_000);
    expect(wav.readInt16LE(44)).toBe(32_767);
    expect(wav.readInt16LE(46)).toBe(-32_767);
  });

  it('kommt mit einer leeren Aufnahme zurecht', () => {
    expect(wavAusPcm(new Float32Array(0)).length).toBe(44);
  });
});

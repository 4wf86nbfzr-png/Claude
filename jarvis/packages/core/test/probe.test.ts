import { describe, expect, it } from 'vitest';
import { PROBESATZ, trefferquote } from '../src/voice/probe.js';

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

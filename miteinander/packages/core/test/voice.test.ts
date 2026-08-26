import { describe, expect, it } from 'vitest';
import {
  IRREVERSIBLE_ACTIONS,
  MIN_CONFIDENCE,
  exampleCommands,
  interpret,
  requiresVisualConfirmation,
  startListening,
  stopListening,
  voiceFallback,
} from '../src/voice/commands';

describe('Sprachbefehle', () => {
  it('führt einfache Befehle direkt aus', () => {
    const result = interpret({ transcript: 'Vorlesen', confidence: 0.95 });
    expect(result).toMatchObject({ kind: 'execute', intent: 'read_aloud' });
  });

  it('erkennt Befehle unabhängig von Umlaut-Schreibweise', () => {
    expect(interpret({ transcript: 'zurueck', confidence: 0.9 })).toMatchObject({ intent: 'back' });
    expect(interpret({ transcript: 'Zurück', confidence: 0.9 })).toMatchObject({ intent: 'back' });
  });

  it('führt eine Buchung nie allein auf Zuruf aus', () => {
    const result = interpret({ transcript: 'Termin bestätigen', confidence: 0.99 });
    expect(result.kind).toBe('confirm');
    if (result.kind === 'confirm') {
      expect(result.prompt).toContain('Bildschirm');
    }
  });

  it('fragt bei unsicherer Erkennung nach, statt zu raten', () => {
    const result = interpret({ transcript: 'Vorlesen', confidence: MIN_CONFIDENCE - 0.1 });
    expect(result.kind).toBe('clarify');
  });

  it('bietet bei unbekanntem Befehl Beispiele an', () => {
    const result = interpret({ transcript: 'Mach mal irgendwas', confidence: 0.9 });
    expect(result.kind).toBe('clarify');
    if (result.kind === 'clarify') {
      expect(result.suggestions).toEqual(exampleCommands());
    }
  });

  it('verweist bei leerer Eingabe auf die Tastatur', () => {
    const result = interpret({ transcript: '   ', confidence: 0.9 });
    expect(result.kind).toBe('fallback');
    if (result.kind === 'fallback') {
      expect(result.message).toContain('tippen');
    }
  });
});

describe('Folgenreiche Handlungen', () => {
  it('verlangt für Geld, Buchungen, Einwilligungen und Löschungen eine Bestätigung am Bildschirm', () => {
    for (const action of IRREVERSIBLE_ACTIONS) {
      expect(requiresVisualConfirmation(action)).toBe(true);
    }
    expect(requiresVisualConfirmation('profile.read')).toBe(false);
  });
});

describe('Wenn Sprache nicht geht', () => {
  it('nennt zu jedem Grund eine vollwertige Alternative', () => {
    for (const reason of ['no_permission', 'noise', 'offline', 'unsupported'] as const) {
      const fallback = voiceFallback(reason);
      expect(fallback.message.length).toBeGreaterThan(10);
      expect(fallback.action.length).toBeGreaterThan(10);
    }
  });
});

describe('Mikrofon', () => {
  it('läuft nie dauerhaft und immer sichtbar', () => {
    const state = startListening('2026-03-02T09:00:00.000Z');
    expect(state.active).toBe(true);
    expect(state.visibleIndicator).toBe(true);
    expect(state.autoStopSeconds).toBeLessThanOrEqual(30);
    expect(stopListening().active).toBe(false);
  });
});

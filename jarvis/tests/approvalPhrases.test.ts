import { describe, expect, it } from 'vitest';
import { classifyApproval } from '../src/core/services/approvalPhrases.js';

describe('Freigabeerkennung', () => {
  it('erkennt eindeutige Freigaben', () => {
    for (const utterance of [
      'Senden',
      'senden.',
      'Freigeben',
      'Mail abschicken',
      'Ja, genau so senden',
      'Okay, freigeben und senden',
      'Bitte versenden',
      'Ja',
      'Ja, bitte',
      'Perfekt',
      'Einverstanden',
    ]) {
      expect(classifyApproval(utterance), utterance).toBe('freigabe');
    }
  });

  it('erkennt Ablehnungen', () => {
    for (const utterance of [
      'Nein',
      'Abbrechen',
      'Stopp',
      'Bitte nicht senden',
      'Doch nicht',
      'Lieber nicht',
      'Verwerfen',
    ]) {
      expect(classifyApproval(utterance), utterance).toBe('ablehnung');
    }
  });

  it('behandelt alles Uneindeutige als unklar — im Zweifel wird nicht gesendet', () => {
    for (const utterance of [
      'Soll ich das senden?',
      'Kannst du das senden?',
      'Vielleicht senden',
      'Später senden',
      'Erst noch mal lesen, dann senden',
      'Wenn der Text passt, senden',
      'Morgen senden',
      'Warte kurz',
      'Lies mir die Mail vor',
      'Mach den Text kürzer',
      '',
      '   ',
    ]) {
      expect(classifyApproval(utterance), utterance).toBe('unklar');
    }
  });

  it('lässt sich durch angehängte Freigabewörter in Fragen nicht täuschen', () => {
    expect(classifyApproval('Ist der Text so gut, soll ich freigeben?')).toBe('unklar');
    expect(classifyApproval('Noch nicht freigeben')).toBe('ablehnung');
  });
});

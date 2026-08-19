import { describe, expect, it } from 'vitest';
import {
  leerbegruessung,
  mitAnrede,
  personaPrompt,
  PERSONA_STANDARD,
  type Persona,
} from '../src/agents/persona.js';

/**
 * Die Persönlichkeit.
 *
 * Zwei Dinge werden hier festgehalten: dass die Anrede eine Einstellung ist
 * und nicht im Code klebt, und dass JARVIS beim Rufen nicht jedes Mal
 * denselben Satz sagt — genau das lässt eine Stimme künstlich klingen.
 */

const master: Persona = { anrede: 'Master', stil: 'trocken' };
const ohne: Persona = { anrede: '', stil: 'knapp' };

describe('mitAnrede', () => {
  it('stellt die Anrede voran und schreibt danach klein weiter', () => {
    expect(mitAnrede('Eine Sache wartet noch auf Ihre Freigabe.', master)).toBe(
      'Master, eine Sache wartet noch auf Ihre Freigabe.',
    );
  });

  it('lässt Namen und Substantive am Satzanfang groß', () => {
    expect(mitAnrede('Nordbau hat geantwortet.', master)).toBe('Master, Nordbau hat geantwortet.');
  });

  it('tut nichts, wenn keine Anrede eingestellt ist', () => {
    const satz = 'Eine Sache wartet noch auf Ihre Freigabe.';
    expect(mitAnrede(satz, ohne)).toBe(satz);
  });

  it('doppelt die Anrede nicht', () => {
    expect(mitAnrede('Master, ich höre.', master)).toBe('Master, ich höre.');
  });

  it('kommt mit einem leeren Satz zurecht', () => {
    expect(mitAnrede('', master)).toBe('');
  });
});

describe('leerbegruessung', () => {
  const morgens = new Date('2026-08-18T08:00:00');
  const abends = new Date('2026-08-18T20:00:00');

  it('grüßt morgens anders als abends', () => {
    const frueh = leerbegruessung(master, morgens);
    const spaet = leerbegruessung(master, abends);
    expect(frueh).not.toBe(spaet);
    expect(frueh).toContain('Master');
  });

  it('sagt nicht immer denselben Satz', () => {
    const gesehen = new Set<string>();
    for (let minute = 0; minute < 30; minute += 1) {
      const t = new Date('2026-08-18T09:00:00');
      t.setMinutes(minute);
      gesehen.add(leerbegruessung(master, t));
    }
    expect(gesehen.size).toBeGreaterThan(1);
  });

  it('merkt, wenn man kurz hintereinander ruft', () => {
    const erst = leerbegruessung(master, morgens, 0);
    const nochmal = leerbegruessung(master, morgens, 1);
    expect(nochmal).not.toBe(erst);
    // Genau der Fall, um den es geht: er darf es ansprechen.
    const oft = [1, 2, 3, 4, 5].map((n) => leerbegruessung(master, morgens, n));
    expect(oft.some((s) => /schon wieder|häufig/i.test(s))).toBe(true);
  });

  it('bleibt auch bei vielen Rufen in seinem Satzvorrat', () => {
    for (const n of [0, 1, 7, 99, 1000]) {
      const satz = leerbegruessung(master, morgens, n);
      expect(satz).toMatch(/\S/);
      expect(satz.startsWith('Master, ')).toBe(true);
    }
  });
});

describe('personaPrompt', () => {
  it('nennt die eingestellte Anrede', () => {
    expect(personaPrompt(master)).toContain('Master');
  });

  it('lässt die Anrede weg, wenn keine gesetzt ist', () => {
    expect(personaPrompt(ohne)).not.toContain('anspricht');
  });

  it('unterscheidet die Stile', () => {
    const a = personaPrompt({ anrede: '', stil: 'trocken' });
    const b = personaPrompt({ anrede: '', stil: 'warm' });
    expect(a).not.toBe(b);
  });

  it('hat als Standard eine Anrede und den trockenen Ton', () => {
    expect(PERSONA_STANDARD.anrede).toBe('Master');
    expect(PERSONA_STANDARD.stil).toBe('trocken');
  });
});

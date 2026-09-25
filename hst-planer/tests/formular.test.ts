/**
 * Felder aus FormData lesen.
 *
 * Hintergrund: Die Anmeldung war einmal vollständig kaputt, weil das Feld für
 * den zweiten Faktor erst im zweiten Schritt im Formular steht. `formData.get`
 * liefert dafür `null`, und Zod hält `null` bei einem `.optional()`-String
 * nicht für einen fehlenden Wert, sondern für den falschen Typ. Auf der
 * Anmeldeseite stand dann „Expected string, received null" — für jeden, der
 * sich anmelden wollte.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { feld, pflichtfeld } from '@/lib/formular';

function formularMit(werte: Record<string, string>): FormData {
  const daten = new FormData();
  for (const [name, wert] of Object.entries(werte)) daten.set(name, wert);
  return daten;
}

describe('feld', () => {
  it('liefert den Wert, wenn das Feld da ist', () => {
    expect(feld(formularMit({ code: '123456' }), 'code')).toBe('123456');
  });

  it('liefert undefined statt null, wenn das Feld fehlt', () => {
    expect(feld(formularMit({}), 'code')).toBeUndefined();
  });

  it('liefert undefined bei einem Datei-Feld', () => {
    const daten = new FormData();
    daten.set('datei', new File(['abc'], 'test.txt'));
    expect(feld(daten, 'datei')).toBeUndefined();
  });

  it('behält den leeren String — der ist eine Eingabe, kein fehlendes Feld', () => {
    expect(feld(formularMit({ code: '' }), 'code')).toBe('');
  });
});

describe('pflichtfeld', () => {
  it('macht aus einem fehlenden Feld einen leeren String', () => {
    expect(pflichtfeld(formularMit({}), 'email')).toBe('');
  });
});

describe('zusammen mit Zod', () => {
  const SCHEMA = z.object({
    email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse an.'),
    code: z.string().trim().optional(),
  });

  it('nimmt ein Formular ohne das optionale Feld an', () => {
    const daten = formularMit({ email: 'moin@example.org' });
    const ergebnis = SCHEMA.safeParse({
      email: pflichtfeld(daten, 'email'),
      code: feld(daten, 'code'),
    });
    expect(ergebnis.success).toBe(true);
  });

  it('meldet bei einem fehlenden Pflichtfeld den Text für Menschen', () => {
    const ergebnis = SCHEMA.safeParse({
      email: pflichtfeld(formularMit({}), 'email'),
      code: feld(formularMit({}), 'code'),
    });
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) {
      expect(ergebnis.error.issues[0]?.message).toBe('Bitte geben Sie eine gültige E-Mail-Adresse an.');
    }
  });

  it('scheitert genau so, wie es damals kaputt war, wenn man null durchreicht', () => {
    const ergebnis = SCHEMA.safeParse({
      email: 'moin@example.org',
      code: formularMit({}).get('code'), // null – der alte Weg
    });
    expect(ergebnis.success).toBe(false);
    if (!ergebnis.success) expect(ergebnis.error.issues[0]?.code).toBe('invalid_type');
  });
});

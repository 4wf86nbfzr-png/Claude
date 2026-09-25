/**
 * Feldverschlüsselung für besondere Kategorien (SecPlan 15, Art. 32 Abs. 1 lit. a).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entschluesseln, schluesselVergessen, verschluesseln, verschluesselungBereit } from '@/lib/krypto';

const ALTER_SCHLUESSEL = process.env.DATA_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.DATA_ENCRYPTION_KEY = 'ein-hinreichend-langer-testschluessel-1234';
  schluesselVergessen();
});

afterEach(() => {
  if (ALTER_SCHLUESSEL === undefined) delete process.env.DATA_ENCRYPTION_KEY;
  else process.env.DATA_ENCRYPTION_KEY = ALTER_SCHLUESSEL;
  schluesselVergessen();
});

describe('Verschlüsseln und Entschlüsseln', () => {
  it('gibt denselben Text zurück', () => {
    const klartext = 'Beschäftigungsverbot bis 12.06.2026, ärztliche Bescheinigung liegt vor.';
    expect(entschluesseln(verschluesseln(klartext))).toBe(klartext);
  });

  it('kommt mit Umlauten und Sonderzeichen klar', () => {
    const klartext = 'Schwerbehinderung – GdB 50 · § 2 Abs. 2 SGB IX · Ausweis gültig bis 31.12.';
    expect(entschluesseln(verschluesseln(klartext))).toBe(klartext);
  });

  it('erzeugt bei gleichem Text zweimal etwas Verschiedenes', () => {
    // Sonst liesse sich aus zwei gleichen Werten in der Datenbank schliessen,
    // dass zwei Personen dasselbe Merkmal tragen.
    const a = verschluesseln('derselbe Text');
    const b = verschluesseln('derselbe Text');
    expect(a).not.toBe(b);
    expect(entschluesseln(a)).toBe(entschluesseln(b));
  });

  it('schreibt den Klartext nicht in das Ergebnis', () => {
    const gespeichert = verschluesseln('Schwerbehinderung');
    expect(gespeichert).not.toContain('Schwerbehinderung');
    expect(gespeichert.startsWith('v1:')).toBe(true);
    expect(gespeichert.split(':')).toHaveLength(4);
  });
});

describe('Veränderte Werte', () => {
  it('erkennt eine Veränderung am Inhalt', () => {
    const gespeichert = verschluesseln('Original');
    const teile = gespeichert.split(':');
    const inhalt = Buffer.from(teile[3]!, 'base64');
    inhalt[0] = inhalt[0]! ^ 0xff;
    teile[3] = inhalt.toString('base64');
    expect(() => entschluesseln(teile.join(':'))).toThrow();
  });

  it('weist ein fremdes Format ab, statt es zu raten', () => {
    expect(() => entschluesseln('einfach Klartext')).toThrow(/Format/);
    expect(() => entschluesseln('v2:a:b:c')).toThrow(/Format/);
    expect(() => entschluesseln('')).toThrow(/Format/);
  });

  it('entschlüsselt nicht mit einem anderen Schlüssel', () => {
    const gespeichert = verschluesseln('Geheim');
    process.env.DATA_ENCRYPTION_KEY = 'ein-ganz-anderer-langer-testschluessel-9876';
    schluesselVergessen();
    expect(() => entschluesseln(gespeichert)).toThrow();
  });
});

describe('Fehlender Schlüssel', () => {
  it('fällt nicht still auf Klartext zurück', () => {
    // Ein Feld, das mal verschlüsselt und mal nicht abgelegt wird, ist
    // schlimmer als eines, das gar nicht angelegt werden kann.
    delete process.env.DATA_ENCRYPTION_KEY;
    schluesselVergessen();
    expect(verschluesselungBereit()).toBe(false);
    expect(() => verschluesseln('egal')).toThrow(/DATA_ENCRYPTION_KEY/);
  });

  it('weist einen zu kurzen Schlüssel ab', () => {
    process.env.DATA_ENCRYPTION_KEY = 'zu-kurz';
    schluesselVergessen();
    expect(verschluesselungBereit()).toBe(false);
    expect(() => verschluesseln('egal')).toThrow(/mindestens 32/);
  });
});

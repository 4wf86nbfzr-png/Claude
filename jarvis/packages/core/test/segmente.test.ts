import { describe, expect, it } from 'vitest';
import { Sprachsegmentierer, type PegelRahmen, type SegmentEreignis } from '../src/voice/segmente.js';

/**
 * Die Segmentierung entscheidet, was überhaupt an die Erkennung geht. Sitzt
 * sie daneben, wird entweder das Satzende abgeschnitten oder JARVIS antwortet
 * mit spürbarer Verzögerung. Deshalb hier mit gestellten Pegelkurven geprüft,
 * ohne Mikrofon.
 */

const RAHMEN_MS = 20;

/** Liefert eine Uhr, die über mehrere Aufrufe hinweg weiterläuft. */
function macheUhr() {
  let t = 0;
  return {
    jetzt: () => t,
    /** Spielt `ms` Millisekunden mit konstantem Pegel ab. */
    spiele(segmentierer: Sprachsegmentierer, rms: number, ms: number): SegmentEreignis[] {
      const ereignisse: SegmentEreignis[] = [];
      for (let vergangen = 0; vergangen < ms; vergangen += RAHMEN_MS) {
        t += RAHMEN_MS;
        const e = segmentierer.pruefe({ t, rms } satisfies PegelRahmen);
        if (e) ereignisse.push(e);
      }
      return ereignisse;
    },
  };
}

const STILLE = 0.004;
const SPRACHE = 0.09;

describe('Sprachsegmentierer', () => {
  it('erkennt Anfang und Ende einer Äußerung', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();

    uhr.spiele(s, STILLE, 600);
    const start = uhr.spiele(s, SPRACHE, 1200);
    expect(start.map((e) => e.art)).toEqual(['start']);
    expect(s.imSatz).toBe(true);

    const ende = uhr.spiele(s, STILLE, 1000);
    expect(ende).toHaveLength(1);
    expect(ende[0]!.art).toBe('ende');
    expect(s.imSatz).toBe(false);
  });

  it('zählt die Stille am Ende nicht zur Äußerung', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 400);
    uhr.spiele(s, SPRACHE, 1000);
    const ende = uhr.spiele(s, STILLE, 1200);

    const e = ende[0]!;
    expect(e.art).toBe('ende');
    if (e.art !== 'ende') return;
    // Rund eine Sekunde gesprochen -- nicht 1 s + 750 ms Stille.
    expect(e.dauerMs).toBeGreaterThan(900);
    expect(e.dauerMs).toBeLessThan(1100);
  });

  it('trennt zwei Sätze mit einer Pause dazwischen', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 400);

    const alle: SegmentEreignis[] = [
      ...uhr.spiele(s, SPRACHE, 900),
      ...uhr.spiele(s, STILLE, 1000),
      ...uhr.spiele(s, SPRACHE, 900),
      ...uhr.spiele(s, STILLE, 1000),
    ];
    expect(alle.map((e) => e.art)).toEqual(['start', 'ende', 'start', 'ende']);
  });

  it('lässt eine kurze Atempause mitten im Satz durchgehen', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 400);

    const alle: SegmentEreignis[] = [
      ...uhr.spiele(s, SPRACHE, 700),
      ...uhr.spiele(s, STILLE, 300), // Luftholen -- kürzer als stoppStilleMs
      ...uhr.spiele(s, SPRACHE, 700),
      ...uhr.spiele(s, STILLE, 1000),
    ];
    expect(alle.map((e) => e.art)).toEqual(['start', 'ende']);
  });

  it('verwirft ein einzelnes kurzes Geräusch', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 400);

    const alle: SegmentEreignis[] = [
      ...uhr.spiele(s, SPRACHE, 120), // Klick, Husten, Tastenanschlag
      ...uhr.spiele(s, STILLE, 1000),
    ];
    // Der Start wird gemeldet, das Ende aber verworfen -- nichts geht an die
    // Erkennung, und der Segmentierer steht wieder bereit.
    expect(alle.map((e) => e.art)).toEqual(['start']);
    expect(s.imSatz).toBe(false);
  });

  it('schneidet eine endlose Äußerung nach der Höchstdauer', () => {
    const s = new Sprachsegmentierer({ maxDauerMs: 2000 });
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 200);

    const alle = uhr.spiele(s, SPRACHE, 4000);
    // Geschnitten, aber nicht abgewürgt: wer weiterredet, wird weiter
    // aufgenommen -- sonst verlöre man die zweite Hälfte des Satzes.
    expect(alle.map((e) => e.art)).toEqual(['start', 'ende', 'start']);
    const ende = alle[1]!;
    if (ende.art !== 'ende') return;
    expect(ende.grund).toBe('zu_lang');
  });

  it('geht im lauten Raum nicht dauernd an', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();

    // Dauerhaftes Rauschen -- Lüfter, Straße, Café.
    const laerm = uhr.spiele(s, 0.05, 4000);
    expect(laerm).toEqual([]);
    // Der Grundpegel ist mitgewandert, also liegt die Schwelle jetzt höher.
    expect(s.rauschen).toBeGreaterThan(0.02);

    // Sprechen muss sich davon trotzdem abheben.
    const gesprochen = uhr.spiele(s, 0.3, 900);
    expect(gesprochen.map((e) => e.art)).toEqual(['start']);
  });

  it('hebt die Schwelle nicht durch einen einzelnen Knall', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, STILLE, 1000);
    const vorher = s.rauschen;

    uhr.spiele(s, 0.8, 60); // Tür knallt
    uhr.spiele(s, STILLE, 1000);

    // Der Grundpegel darf davon höchstens leicht angehoben sein.
    expect(s.rauschen).toBeLessThan(vorher * 3);
    expect(s.rauschen).toBeLessThan(0.02);
  });

  it('setzt zurück, ohne den gelernten Raumpegel zu verlieren', () => {
    const s = new Sprachsegmentierer();
    const uhr = macheUhr();
    uhr.spiele(s, 0.05, 3000);
    uhr.spiele(s, 0.3, 400);
    expect(s.imSatz).toBe(true);

    const gelernt = s.rauschen;
    s.zuruecksetzen();
    expect(s.imSatz).toBe(false);
    expect(s.rauschen).toBe(gelernt);
  });
});

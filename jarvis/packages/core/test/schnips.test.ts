import { describe, expect, it } from 'vitest';
import { EMPFINDLICHKEITEN, SchnipsErkenner, type Rahmen } from '../src/voice/schnips.js';

/**
 * Die Erkennung wird mit nachgebauten Signalverläufen geprüft.
 *
 * Das ersetzt kein echtes Mikrofon, trifft aber genau den Punkt, auf den es
 * ankommt: unterscheidet die Logik einen kurzen hellen Knall von Sprache,
 * von einem dumpfen Schlag und von Dauerlärm? Genau daran scheitern naive
 * Lautstärke-Schwellen.
 */

const SCHRITT = 16; // ms je Rahmen, wie im Fenster

type Abschnitt = { dauerMs: number; rms: number; hochanteil: number };

/**
 * Baut eine Rahmenfolge aus Abschnitten.
 *
 * Die Uhr laeuft weiter, auch ueber mehrere Aufrufe hinweg -- sonst waere
 * der Abstand zwischen zwei Ereignissen im Test nicht der, den man meint.
 */
function macheUhr(): (abschnitte: Abschnitt[]) => Rahmen[] {
  let t = 0;
  return (abschnitte) => {
    const rahmen: Rahmen[] = [];
    for (const a of abschnitte) {
      for (let i = 0; i < Math.round(a.dauerMs / SCHRITT); i += 1) {
        rahmen.push({ t, rms: a.rms, hochanteil: a.hochanteil });
        t += SCHRITT;
      }
    }
    return rahmen;
  };
}

/** Einzelne Folge ab Zeitpunkt 0 -- für Tests mit nur einem Abschnittsblock. */
function folge(abschnitte: Abschnitt[]): Rahmen[] {
  return macheUhr()(abschnitte);
}

const STILLE = { dauerMs: 600, rms: 0.01, hochanteil: 0.1 };

/** Kurz, laut, hell — und sofort wieder weg. */
const SCHNIPS = [
  { dauerMs: 32, rms: 0.55, hochanteil: 0.7 },
  { dauerMs: 48, rms: 0.12, hochanteil: 0.5 },
  { dauerMs: 200, rms: 0.012, hochanteil: 0.1 },
];

function zaehleTreffer(rahmen: Rahmen[], erkenner: SchnipsErkenner): number {
  let n = 0;
  for (const r of rahmen) if (erkenner.pruefe(r)) n += 1;
  return n;
}

describe('Was ein Schnipsen ist', () => {
  it('erkennt ein einzelnes Schnipsen nach Stille', () => {
    const treffer = zaehleTreffer(folge([STILLE, ...SCHNIPS]), new SchnipsErkenner());
    expect(treffer).toBe(1);
  });

  it('erkennt mehrere Schnipser hintereinander', () => {
    const rahmen = folge([STILLE, ...SCHNIPS, { dauerMs: 900, rms: 0.01, hochanteil: 0.1 }, ...SCHNIPS]);
    expect(zaehleTreffer(rahmen, new SchnipsErkenner())).toBe(2);
  });

  it('löst innerhalb der Sperrzeit nicht doppelt aus', () => {
    // Zwei Knalle dicht hintereinander -- das ist ein Ereignis, kein zwei.
    const rahmen = folge([STILLE, ...SCHNIPS, { dauerMs: 100, rms: 0.01, hochanteil: 0.1 }, ...SCHNIPS]);
    expect(zaehleTreffer(rahmen, new SchnipsErkenner())).toBe(1);
  });
});

describe('Was kein Schnipsen ist', () => {
  it('ignoriert Sprache — laut, aber dumpf und anhaltend', () => {
    const sprache = folge([
      STILLE,
      { dauerMs: 1400, rms: 0.28, hochanteil: 0.18 },
      { dauerMs: 200, rms: 0.02, hochanteil: 0.1 },
    ]);
    expect(zaehleTreffer(sprache, new SchnipsErkenner())).toBe(0);
  });

  it('ignoriert einen dumpfen Schlag — laut und kurz, aber tieffrequent', () => {
    const tuer = folge([
      STILLE,
      { dauerMs: 40, rms: 0.6, hochanteil: 0.12 },
      { dauerMs: 300, rms: 0.02, hochanteil: 0.1 },
    ]);
    expect(zaehleTreffer(tuer, new SchnipsErkenner())).toBe(0);
  });

  it('ignoriert helles Dauergeräusch — hell, aber klingt nicht ab', () => {
    const rauschen = folge([
      STILLE,
      { dauerMs: 2000, rms: 0.4, hochanteil: 0.6 },
      { dauerMs: 200, rms: 0.02, hochanteil: 0.1 },
    ]);
    expect(zaehleTreffer(rauschen, new SchnipsErkenner())).toBe(0);
  });

  it('ignoriert Stille', () => {
    expect(zaehleTreffer(folge([{ dauerMs: 3000, rms: 0.005, hochanteil: 0.1 }]), new SchnipsErkenner())).toBe(0);
  });
});

describe('Lauter Raum', () => {
  it('gewöhnt sich an Hintergrundlärm und löst darin nicht dauernd aus', () => {
    const erkenner = new SchnipsErkenner();
    const laut = folge([{ dauerMs: 4000, rms: 0.15, hochanteil: 0.4 }]);
    expect(zaehleTreffer(laut, erkenner)).toBe(0);
    expect(erkenner.aktuellerGrundpegel).toBeGreaterThan(0.05);
  });

  it('erkennt ein Schnipsen trotzdem, wenn es deutlich über dem Lärm liegt', () => {
    const erkenner = new SchnipsErkenner();
    zaehleTreffer(folge([{ dauerMs: 3000, rms: 0.06, hochanteil: 0.3 }]), erkenner);

    const treffer = zaehleTreffer(
      folge([
        { dauerMs: 32, rms: 0.75, hochanteil: 0.75 },
        { dauerMs: 48, rms: 0.1, hochanteil: 0.4 },
        { dauerMs: 200, rms: 0.06, hochanteil: 0.3 },
      ]),
      erkenner,
    );
    expect(treffer).toBe(1);
  });
});

describe('Empfindlichkeit', () => {
  it('lässt „streng" ein leises Schnipsen durchgehen, „locker" nicht', () => {
    const leise = folge([
      STILLE,
      { dauerMs: 32, rms: 0.09, hochanteil: 0.4 },
      { dauerMs: 48, rms: 0.02, hochanteil: 0.2 },
      { dauerMs: 200, rms: 0.01, hochanteil: 0.1 },
    ]);

    expect(zaehleTreffer(leise, new SchnipsErkenner(EMPFINDLICHKEITEN.streng))).toBe(0);
    expect(zaehleTreffer(leise, new SchnipsErkenner(EMPFINDLICHKEITEN.locker))).toBe(1);
  });
});

describe('Doppelschnipsen', () => {
  const optionen = { doppelFensterMs: 1200 };

  it('löst erst beim zweiten Schnipsen aus', () => {
    const erkenner = new SchnipsErkenner(optionen);
    const uhr = macheUhr();

    expect(zaehleTreffer(uhr([STILLE, ...SCHNIPS]), erkenner), 'erster Schnipser allein').toBe(0);
    // Knapp innerhalb des Doppelfensters.
    const zweiter = uhr([{ dauerMs: 300, rms: 0.01, hochanteil: 0.1 }, ...SCHNIPS]);
    expect(zaehleTreffer(zweiter, erkenner), 'zweiter Schnipser im Fenster').toBe(1);
  });

  it('vergisst den ersten Schnipser, wenn der zweite zu spät kommt', () => {
    const erkenner = new SchnipsErkenner(optionen);
    const uhr = macheUhr();

    zaehleTreffer(uhr([STILLE, ...SCHNIPS]), erkenner);
    // Deutlich mehr als das Doppelfenster später.
    const spaet = uhr([{ dauerMs: 2500, rms: 0.01, hochanteil: 0.1 }, ...SCHNIPS]);
    expect(zaehleTreffer(spaet, erkenner)).toBe(0);
  });
});

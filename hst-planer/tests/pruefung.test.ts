/**
 * Prüfungen vor einer Zuordnung (SecPlan 4).
 *
 * Die Meldungstexte werden mitgeprüft: eine Warnung, die nicht sagt
 * wann und warum, ist keine Warnung.
 */
import { describe, expect, it } from 'vitest';
import { blockiert, pruefe, ueberschneidet, ueberschrift, type PruefEingabe } from '@/lib/dispo/pruefung';

const TAG = new Date('2026-05-16T00:00:00Z');

function eingabe(teil: Partial<PruefEingabe> = {}): PruefEingabe {
  return {
    tag: TAG,
    ziel: { start: '20:00', ende: '02:00', bezeichnung: 'Einlass Süd' },
    person: { name: 'Lena Bergmann', aktiv: true, gesperrt: false },
    belegt: [],
    abwesend: [],
    qualifikationen: [],
    schulungen: [],
    dokumente: [],
    ...teil,
  };
}

describe('Überschneidung', () => {
  it('erkennt zwei sich überlappende Schichten', () => {
    expect(ueberschneidet({ start: '18:00', ende: '23:00' }, { start: '20:00', ende: '02:00' })).toBe(true);
  });

  it('lässt nahtlos anschließende Schichten durch', () => {
    expect(ueberschneidet({ start: '10:00', ende: '18:00' }, { start: '18:00', ende: '23:00' })).toBe(false);
  });

  it('rechnet über Mitternacht richtig', () => {
    // Beide Schichten tragen dasselbe Datum: 05:00 ist der Morgen DIESES
    // Tages, die Nachtschicht endet am Morgen des FOLGENDEN. Kein Konflikt.
    expect(ueberschneidet({ start: '22:00', ende: '06:00' }, { start: '05:00', ende: '09:00' })).toBe(false);
    expect(ueberschneidet({ start: '22:00', ende: '02:00' }, { start: '23:00', ende: '03:00' })).toBe(true);
    expect(ueberschneidet({ start: '22:00', ende: '02:00' }, { start: '03:00', ende: '09:00' })).toBe(false);
  });

  it('sieht die Nachtschicht des Vortages, die in den neuen Tag hineinläuft', () => {
    const k = pruefe(eingabe({
      ziel: { start: '05:00', ende: '13:00' },
      belegtVortag: [{ start: '22:00', ende: '06:00', bezeichnung: 'Werkschutz Nacht' }],
    }));
    const treffer = k.find((x) => x.art === 'UEBERSCHNEIDUNG');
    expect(treffer?.text).toBe('Lena Bergmann ist noch aus der Nachtschicht des Vortages bis 06:00 Uhr eingeplant: Werkschutz Nacht.');
    expect(treffer?.blockierend).toBe(true);
  });

  it('lässt eine Nachtschicht in Ruhe, die vor Mitternacht endet', () => {
    const k = pruefe(eingabe({
      ziel: { start: '05:00', ende: '13:00' },
      belegtVortag: [{ start: '14:00', ende: '22:00' }],
    }));
    expect(k.some((x) => x.art === 'UEBERSCHNEIDUNG')).toBe(false);
  });

  it('urteilt nicht über Schichten ohne feste Zeit', () => {
    expect(ueberschneidet({ start: null, ende: null }, { start: '18:00', ende: '23:00' })).toBe(false);
  });
});

describe('Blockierende Gründe', () => {
  it('nennt die belegte Zeit im Klartext', () => {
    const k = pruefe(eingabe({
      belegt: [{ start: '18:00', ende: '23:00', bezeichnung: 'Hafenlicht Open Air' }],
    }));
    const treffer = k.find((x) => x.art === 'UEBERSCHNEIDUNG');
    expect(treffer?.text).toBe('Lena Bergmann ist bereits von 18:00–23:00 Uhr eingeplant: Hafenlicht Open Air.');
    expect(treffer?.blockierend).toBe(true);
    expect(blockiert(k)).toBe(true);
  });

  it('nennt den Sperrgrund', () => {
    const k = pruefe(eingabe({ person: { name: 'M. T.', aktiv: true, gesperrt: true, sperrgrund: 'Ausweis eingezogen' } }));
    expect(k[0]?.text).toBe('M. T. hat einen Sperrvermerk: Ausweis eingezogen.');
    expect(k[0]?.blockierend).toBe(true);
  });

  it('kommt ohne Sperrgrund aus, ohne leer zu bleiben', () => {
    const k = pruefe(eingabe({ person: { name: 'M. T.', aktiv: true, gesperrt: true, sperrgrund: '  ' } }));
    expect(k[0]?.text).toContain('ohne Angabe');
  });

  it('blockiert eine nicht freigegebene Funktion', () => {
    const k = pruefe(eingabe({ rolle: { name: 'Teamleitung', erlaubt: false, grund: 'keine Unterweisung' } }));
    const treffer = k.find((x) => x.art === 'ROLLE');
    expect(treffer?.text).toContain('nicht freigegeben (keine Unterweisung)');
    expect(treffer?.blockierend).toBe(true);
  });
});

describe('Warnungen, die man übergehen darf', () => {
  it('meldet Urlaub, verhindert die Zuordnung aber nicht', () => {
    const k = pruefe(eingabe({ abwesend: [{ art: 'URLAUB', hinweis: 'bis 20.05.' }] }));
    expect(k[0]?.text).toBe('Lena Bergmann ist an diesem Tag im Urlaub: bis 20.05..');
    expect(blockiert(k)).toBe(false);
  });

  it('unterscheidet fehlend von abgelaufen', () => {
    const k = pruefe(eingabe({
      qualifikationen: [
        { name: 'Sachkunde § 34a', vorhanden: false, laeuftAb: null },
        { name: 'Erste Hilfe', vorhanden: true, laeuftAb: new Date('2026-01-31T00:00:00Z') },
        { name: 'Brandschutz', vorhanden: true, laeuftAb: null },
      ],
    }));
    expect(k.map((x) => x.text)).toEqual([
      'Qualifikation fehlt: Sachkunde § 34a.',
      'Qualifikation abgelaufen am 31.1.2026: Erste Hilfe.',
    ]);
  });

  it('prüft Schulungen und Unterlagen mit denselben Regeln', () => {
    const k = pruefe(eingabe({
      schulungen: [{ name: 'Jährliche Unterweisung', vorhanden: false, laeuftAb: null }],
      dokumente: [{ name: 'Führungszeugnis', vorhanden: true, laeuftAb: new Date('2025-12-01T00:00:00Z') }],
    }));
    expect(k.map((x) => x.art)).toEqual(['SCHULUNG', 'ABLAUF']);
    expect(k[0]?.text).toBe('Pflichtschulung fehlt: Jährliche Unterweisung.');
    expect(k[1]?.text).toContain('Unterlage abgelaufen am 1.12.2025');
  });
});

describe('Ruhezeit nach § 5 ArbZG', () => {
  it('warnt bei weniger als elf Stunden', () => {
    const k = pruefe(eingabe({ ziel: { start: '06:00', ende: '14:00' }, vortagEnde: '23:00' }));
    const treffer = k.find((x) => x.art === 'RUHEZEIT');
    expect(treffer?.text).toBe('Zwischen der letzten Schicht und diesem Einsatz liegen nur 7 Std. 0 Min. – § 5 ArbZG verlangt 11 Stunden.');
    expect(treffer?.blockierend).toBe(false);
  });

  it('schweigt bei ausreichender Pause', () => {
    const k = pruefe(eingabe({ ziel: { start: '14:00', ende: '22:00' }, vortagEnde: '22:00' }));
    expect(k.some((x) => x.art === 'RUHEZEIT')).toBe(false);
  });

  it('rechnet ein Schichtende nach Mitternacht richtig', () => {
    // Vortag endete um 02:00, neue Schicht um 08:00 – das sind sechs Stunden.
    const k = pruefe(eingabe({ ziel: { start: '08:00', ende: '16:00' }, vortagEnde: '02:00' }));
    expect(k.find((x) => x.art === 'RUHEZEIT')?.text).toContain('6 Std. 0 Min.');
  });
});

describe('Überschrift der Warnung', () => {
  it('sagt bei sauberer Lage nichts Dramatisches', () => {
    expect(ueberschrift(pruefe(eingabe()))).toBe('Keine Einwände.');
  });

  it('unterscheidet Hinweis von Verbot', () => {
    expect(ueberschrift([{ art: 'ABWESEND', text: 'x', blockierend: false }])).toBe('Ein Hinweis zu dieser Zuordnung');
    expect(ueberschrift([{ art: 'GESPERRT', text: 'x', blockierend: true }])).toBe('Diese Zuordnung ist nicht möglich');
    expect(ueberschrift([
      { art: 'GESPERRT', text: 'x', blockierend: true },
      { art: 'UEBERSCHNEIDUNG', text: 'y', blockierend: true },
    ])).toBe('2 Gründe sprechen gegen diese Zuordnung');
  });
});

import { describe, expect, it } from 'vitest';
import {
  aktiveZeile,
  formatiereLaufzeit,
  parseWebVtt,
  parseZeitstempel,
  transkriptAusZeilen,
  zeilenAusSaetzen,
  zuWebVtt,
} from '../src/content/untertitel';
import { DGS_CATALOG, DgsRegistry, REQUIRED_DGS_KEYS, laufzeit } from '../src/content/dgs';
import { DGS_SKRIPTE } from '../src/content/dgs-skripte';

const BEISPIEL = `WEBVTT

NOTE Dieser Block wird übersprungen.

1
00:00:00.000 --> 00:00:03.000
Herzlich willkommen.

zeile-zwei
00:00:03.000 --> 00:00:06.500
Diese App bringt <b>Menschen</b> zusammen.
Zweite Zeile.
`;

describe('WebVTT lesen', () => {
  it('liest Zeitstempel mit und ohne Stundenangabe', () => {
    expect(parseZeitstempel('00:00:03.500')).toBeCloseTo(3.5);
    // WebVTT verlangt mindestens Minuten und Sekunden.
    expect(parseZeitstempel('00:03.500')).toBeCloseTo(3.5);
    expect(() => parseZeitstempel('03.500')).toThrow();
    expect(parseZeitstempel('01:02:03.000')).toBe(3723);
    expect(() => parseZeitstempel('kaputt')).toThrow();
  });

  it('liest Blöcke mit und ohne Bezeichner', () => {
    const zeilen = parseWebVtt(BEISPIEL);
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0]?.text).toBe('Herzlich willkommen.');
    expect(zeilen[1]?.bis).toBeCloseTo(6.5);
  });

  it('überspringt Kommentarblöcke und entfernt Auszeichnungen', () => {
    const zeilen = parseWebVtt(BEISPIEL);
    expect(zeilen.some((z) => z.text.includes('übersprungen'))).toBe(false);
    expect(zeilen[1]?.text).toContain('Menschen');
    expect(zeilen[1]?.text).not.toContain('<b>');
  });

  it('behält mehrzeilige Texte', () => {
    expect(parseWebVtt(BEISPIEL)[1]?.text).toContain('\nZweite Zeile.');
  });

  it('macht eine kaputte Zeile nicht zum Totalausfall', () => {
    const kaputt = `WEBVTT

1
irgendwas --> nochwas
Kaputt.

2
00:00:00.000 --> 00:00:02.000
Heil.
`;
    const zeilen = parseWebVtt(kaputt);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]?.text).toBe('Heil.');
  });

  it('schreibt WebVTT, das sich wieder lesen lässt', () => {
    const original = zeilenAusSaetzen(['Eins.', 'Zwei.', 'Drei.'], 2);
    const gelesen = parseWebVtt(zuWebVtt(original));
    expect(gelesen).toEqual(original);
  });
});

describe('Untertitel zur Wiedergabe', () => {
  const zeilen = zeilenAusSaetzen(['Eins.', 'Zwei.', 'Drei.'], 3);

  it('findet die Zeile zum Zeitpunkt', () => {
    expect(aktiveZeile(zeilen, 0)?.text).toBe('Eins.');
    expect(aktiveZeile(zeilen, 2.9)?.text).toBe('Eins.');
    expect(aktiveZeile(zeilen, 3)?.text).toBe('Zwei.');
    expect(aktiveZeile(zeilen, 8.9)?.text).toBe('Drei.');
  });

  it('zeigt nach dem Ende nichts mehr an', () => {
    expect(aktiveZeile(zeilen, 9)).toBeUndefined();
    expect(aktiveZeile(zeilen, 99)).toBeUndefined();
  });

  it('formatiert die Laufzeit', () => {
    expect(formatiereLaufzeit(0)).toBe('0:00');
    expect(formatiereLaufzeit(7)).toBe('0:07');
    expect(formatiereLaufzeit(75)).toBe('1:15');
  });

  it('baut das Transkript aus denselben Zeilen', () => {
    expect(transkriptAusZeilen(zeilen)).toBe('Eins. Zwei. Drei.');
  });
});

describe('Gebärdensprach-Katalog', () => {
  it('hat für jeden Kernablauf ein Skript', () => {
    for (const key of REQUIRED_DGS_KEYS) {
      expect(DGS_SKRIPTE[key].length, `Skript fehlt: ${key}`).toBeGreaterThan(2);
    }
  });

  it('liefert Transkript und Untertitel schon ohne Video', () => {
    for (const item of DGS_CATALOG) {
      expect(item.untertitel.length, `Untertitel fehlen: ${item.key}`).toBeGreaterThan(0);
      expect(item.transcript, `Transkript fehlt: ${item.key}`).toBeTruthy();
      // Der Text ist da -- das Video trotzdem noch nicht.
      expect(item.status).toBe('placeholder');
      expect(item.videoUrl).toBeNull();
    }
  });

  it('rechnet die Laufzeit aus den Untertiteln', () => {
    const item = DGS_CATALOG[0]!;
    expect(laufzeit(item)).toBe(item.untertitel.length * 3);
  });

  it('nutzt kurze Sätze -- die Vorlage muss gebärdbar sein', () => {
    for (const key of REQUIRED_DGS_KEYS) {
      for (const satz of DGS_SKRIPTE[key]) {
        expect(satz.split(/\s+/).length, `Zu lang in ${key}: ${satz}`).toBeLessThanOrEqual(14);
      }
    }
  });

  it('erklärt in jedem sicherheitsrelevanten Skript den Notruf', () => {
    expect(DGS_SKRIPTE['safety.emergency'].join(' ')).toMatch(/1\s?1\s?2/);
  });
});

describe('Platzhaltervideos', () => {
  it('ändern den Status nicht', () => {
    const registry = new DgsRegistry();
    const item = registry.setzePlatzhalterVideo('booking.summary', 'platzhalter.webm');
    expect(item?.videoUrl).toBe('platzhalter.webm');
    expect(item?.status).toBe('placeholder');
    expect(registry.isApproved('booking.summary')).toBe(false);
    expect(registry.coverage().approved).toBe(0);
  });

  it('überschreiben ein freigegebenes Video nicht', () => {
    const registry = new DgsRegistry();
    registry.upsertVideo('help.overview', 'echt.mp4', 'echt.vtt', 'Text');
    registry.approve('help.overview', 'M. Petersen, DGS-Muttersprachlerin', '2026-03-02');
    registry.setzePlatzhalterVideo('help.overview', 'platzhalter.webm');
    expect(registry.get('help.overview')?.videoUrl).toBe('echt.mp4');
    expect(registry.isApproved('help.overview')).toBe(true);
  });

  it('verlangt für die Freigabe weiterhin Untertitel und Transkript', () => {
    const registry = new DgsRegistry();
    const ohneText = new DgsRegistry([
      { key: 'x', title: 'X', status: 'in_review', videoUrl: 'v.mp4', untertitel: [], transcript: null, version: 1 },
    ]);
    expect(() => ohneText.approve('x', 'Prüfperson', '2026-03-02')).toThrow(/Untertitel und ein Transkript/);
    expect(registry.coverage().total).toBe(REQUIRED_DGS_KEYS.length);
  });
});

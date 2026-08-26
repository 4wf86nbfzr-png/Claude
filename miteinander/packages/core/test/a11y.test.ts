import { describe, expect, it } from 'vitest';
import {
  MIN_TOUCH_TARGET_DP,
  animationDuration,
  clampPreferences,
  createDefaultPreferences,
  hintDuration,
  resolvePreferences,
  switchMode,
} from '../src/a11y/preferences';
import { composeLabel, shouldSpeakInApp } from '../src/a11y/announcements';
import { contrastRatio, meetsAaNonText, meetsAaText, parseHex } from '../src/a11y/contrast';

const NOW = '2026-03-02T09:00:00.000Z';

describe('Bedienmodi', () => {
  it('setzt im Einfach-Modus große Tippflächen, Vorlesen und Leichte Sprache', () => {
    const prefs = createDefaultPreferences('u1', 'einfach', NOW);
    expect(prefs.touchTargetSize).toBeGreaterThanOrEqual(64);
    expect(prefs.readAloud).toBe(true);
    expect(prefs.easyLanguage).toBe(true);
    expect(prefs.fontScale).toBeGreaterThan(1);
  });

  it('hält jede Tippfläche bei mindestens 48 dp', () => {
    const prefs = clampPreferences({
      ...createDefaultPreferences('u1', 'standard', NOW),
      touchTargetSize: 12,
    });
    expect(prefs.touchTargetSize).toBe(MIN_TOUCH_TARGET_DP);
  });

  it('wechselt den Modus ohne Datenverlust', () => {
    const individuell = {
      ...createDefaultPreferences('u1', 'individuell', NOW),
      fontScale: 1.8,
      signLanguage: true,
    };
    const zurueck = switchMode(individuell, 'individuell', NOW);
    expect(zurueck.fontScale).toBe(1.8);
    expect(zurueck.signLanguage).toBe(true);
  });

  it('behält eine einmal abgeschaltete Bewegung auch nach Moduswechsel bei', () => {
    const prefs = { ...createDefaultPreferences('u1', 'individuell', NOW), reduceMotion: true };
    expect(switchMode(prefs, 'standard', NOW).reduceMotion).toBe(true);
  });

  it('begrenzt Schriftskalierung und Vorlesegeschwindigkeit auf sinnvolle Werte', () => {
    const prefs = clampPreferences({
      ...createDefaultPreferences('u1', 'standard', NOW),
      fontScale: 99,
      readAloudRate: 0.01,
      extraTimeFactor: 100,
    });
    expect(prefs.fontScale).toBeLessThanOrEqual(2.5);
    expect(prefs.readAloudRate).toBeGreaterThanOrEqual(0.5);
    expect(prefs.extraTimeFactor).toBeLessThanOrEqual(5);
  });
});

describe('Systemeinstellungen haben Vorrang', () => {
  it('erzwingt reduzierte Bewegung, wenn das Betriebssystem sie meldet', () => {
    const prefs = { ...createDefaultPreferences('u1', 'standard', NOW), reduceMotion: false };
    const effective = resolvePreferences(prefs, { prefersReducedMotion: true });
    expect(effective.reduceMotion).toBe(true);
    expect(animationDuration(300, effective)).toBe(0);
  });

  it('übernimmt eine größere Systemschrift, überschreibt sie aber nie nach unten', () => {
    const prefs = { ...createDefaultPreferences('u1', 'standard', NOW), fontScale: 1 };
    expect(resolvePreferences(prefs, { systemFontScale: 1.6 }).fontScale).toBe(1.6);
    const gross = { ...prefs, fontScale: 2 };
    expect(resolvePreferences(gross, { systemFontScale: 1.1 }).fontScale).toBe(2);
  });

  it('schweigt mit dem eigenen Vorlesemodus, wenn ein Screenreader läuft', () => {
    const prefs = createDefaultPreferences('u1', 'einfach', NOW);
    const effective = resolvePreferences(prefs, { screenReaderEnabled: true });
    expect(effective.suppressInAppReadAloud).toBe(true);
    expect(shouldSpeakInApp(effective)).toBe(false);
  });

  it('verlängert Hinweiszeiten im Einfach-Modus', () => {
    const effective = resolvePreferences(createDefaultPreferences('u1', 'einfach', NOW));
    expect(hintDuration(4000, effective)).toBeGreaterThan(4000);
    expect(effective.oneTaskPerScreen).toBe(true);
  });
});

describe('Kontrastberechnung', () => {
  it('rechnet die Randfälle korrekt', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('kennt die AA-Schwellen für Text und Bedienelemente', () => {
    // 4.54:1 -- knapp über der Textschwelle
    expect(meetsAaText('#767676', '#FFFFFF')).toBe(true);
    expect(meetsAaText('#808080', '#FFFFFF')).toBe(false);
    expect(meetsAaText('#808080', '#FFFFFF', 'large')).toBe(true);
    expect(meetsAaNonText('#949494', '#FFFFFF')).toBe(true);
  });

  it('akzeptiert Kurzschreibweise und weist Unsinn ab', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(() => parseHex('#xyz')).toThrow();
  });
});

describe('Screenreader-Beschriftungen', () => {
  it('fügt Bestandteile zusammen und lässt Leeres weg', () => {
    expect(composeLabel('Meike', undefined, 'verifizierte Fachkraft', '')).toBe(
      'Meike. verifizierte Fachkraft.',
    );
  });
});

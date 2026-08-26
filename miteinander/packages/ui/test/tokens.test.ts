import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  formatRatio,
  meetsAaNonText,
  meetsAaText,
  meetsAaaText,
  resolvePreferences,
  createDefaultPreferences,
} from '@miteinander/core';
import {
  CONTRAST_PAIRS,
  darkColors,
  highContrastColors,
  lightColors,
  type ColorPalette,
} from '../src/tokens/color';
import { buildTheme } from '../src/tokens/theme';
import { isLargeText, scaleType, typeScale } from '../src/tokens/typography';
import { touchTargets } from '../src/tokens/layout';

const PALETTES: Array<[string, ColorPalette]> = [
  ['hell', lightColors],
  ['dunkel', darkColors],
  ['hochkontrast', highContrastColors],
];

describe('Kontrast der Farbtokens', () => {
  for (const [name, colors] of PALETTES) {
    describe(`Palette ${name}`, () => {
      for (const pair of CONTRAST_PAIRS) {
        it(`${pair.name} erfüllt WCAG 2.2 AA`, () => {
          const fg = colors[pair.fg];
          const bg = colors[pair.bg];
          const ratio = contrastRatio(fg, bg);
          const ok =
            pair.role === 'text'
              ? meetsAaText(fg, bg)
              : pair.role === 'largeText'
                ? meetsAaText(fg, bg, 'large')
                : meetsAaNonText(fg, bg);
          expect(
            ok,
            `${pair.name} in Palette ${name}: ${fg} auf ${bg} ergibt nur ${formatRatio(ratio)}`,
          ).toBe(true);
        });
      }
    });
  }

  it('erreicht im Hochkontrastmodus AAA für Fließtext', () => {
    expect(meetsAaaText(highContrastColors.text, highContrastColors.background)).toBe(true);
    expect(meetsAaaText(highContrastColors.textMuted, highContrastColors.background)).toBe(true);
  });

  it('hat in jeder Palette dieselben Schlüssel', () => {
    const keys = Object.keys(lightColors).sort();
    expect(Object.keys(darkColors).sort()).toEqual(keys);
    expect(Object.keys(highContrastColors).sort()).toEqual(keys);
  });
});

describe('Schrift', () => {
  it('skaliert Größe und Zeilenhöhe gemeinsam', () => {
    const gross = scaleType('body', 2);
    expect(gross.fontSize).toBe(typeScale.body.fontSize * 2);
    expect(gross.lineHeight).toBe(typeScale.body.lineHeight * 2);
  });

  it('hat einen Fließtext, der auch ohne Vergrößerung gut lesbar ist', () => {
    expect(typeScale.body.fontSize).toBeGreaterThanOrEqual(17);
    expect(typeScale.caption.fontSize).toBeGreaterThanOrEqual(15);
  });

  it('erkennt großen Text nach WCAG', () => {
    expect(isLargeText(typeScale.display)).toBe(true);
    expect(isLargeText(typeScale.body)).toBe(false);
  });
});

describe('Theme aus Nutzereinstellungen', () => {
  const NOW = '2026-03-02T09:00:00.000Z';

  it('schaltet im Einfach-Modus auf große Tippflächen und Leichte Sprache', () => {
    const theme = buildTheme(resolvePreferences(createDefaultPreferences('u1', 'einfach', NOW)));
    expect(theme.touchTarget).toBeGreaterThanOrEqual(touchTargets.simple);
    expect(theme.easyLanguage).toBe(true);
    expect(theme.oneTaskPerScreen).toBe(true);
    expect(theme.measure).toBeLessThan(50);
  });

  it('setzt bei reduzierter Bewegung alle Dauern auf null', () => {
    const theme = buildTheme(
      resolvePreferences(createDefaultPreferences('u1', 'standard', NOW), {
        prefersReducedMotion: true,
      }),
    );
    expect(theme.motion).toEqual({ fast: 0, normal: 0, slow: 0 });
  });

  it('nimmt im Hochkontrast die Hochkontrast-Palette', () => {
    const prefs = { ...createDefaultPreferences('u1', 'standard', NOW), highContrast: true };
    const theme = buildTheme(resolvePreferences(prefs));
    expect(theme.colors.background).toBe(highContrastColors.background);
  });

  it('hält die Tippfläche nie unter 48 dp', () => {
    const prefs = { ...createDefaultPreferences('u1', 'standard', NOW), touchTargetSize: 10 };
    const theme = buildTheme(resolvePreferences(prefs));
    expect(theme.touchTarget).toBeGreaterThanOrEqual(48);
  });
});

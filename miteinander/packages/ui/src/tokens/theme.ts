import type { EffectivePreferences } from '@miteinander/core';
import { palette, type ColorPalette } from './color';
import { motion, spacing, touchTargets, measure } from './layout';
import { scaleType, type TypeToken, type TypeStyle } from './typography';

/**
 * Das Theme ist die einzige Quelle fuer Farben, Groessen und Bewegung in den
 * Komponenten. Es wird aus den aufgeloesten Nutzereinstellungen gebaut --
 * damit wirken Schriftgroesse, Kontrast, Bewegung und Tippflaeche
 * durchgaengig, ohne dass eine Komponente sie einzeln beruecksichtigen muss.
 */
export interface Theme {
  colors: ColorPalette;
  spacing: typeof spacing;
  /** Effektive Mindestgroesse einer Tippflaeche. */
  touchTarget: number;
  /** Animationsdauern -- bei reduzierter Bewegung durchgehend 0. */
  motion: { fast: number; normal: number; slow: number };
  type: (token: TypeToken) => TypeStyle;
  /** Zeichen pro Zeile. */
  measure: number;
  easyLanguage: boolean;
  signLanguage: boolean;
  oneTaskPerScreen: boolean;
  fontScale: number;
}

export function buildTheme(prefs: EffectivePreferences): Theme {
  const colors = palette(prefs.resolvedColorScheme, prefs.highContrast);
  const reduce = prefs.reduceMotion;
  const target = Math.max(
    prefs.touchTargetSize,
    prefs.uiMode === 'einfach' ? touchTargets.simple : touchTargets.standard,
  );

  return {
    colors,
    spacing,
    touchTarget: target,
    motion: reduce
      ? { fast: 0, normal: 0, slow: 0 }
      : { fast: motion.fast, normal: motion.normal, slow: motion.slow },
    type: (token) => scaleType(token, prefs.fontScale),
    measure: prefs.easyLanguage ? measure.easyLanguage : measure.body,
    easyLanguage: prefs.easyLanguage,
    signLanguage: prefs.signLanguage,
    oneTaskPerScreen: prefs.oneTaskPerScreen,
    fontScale: prefs.fontScale,
  };
}

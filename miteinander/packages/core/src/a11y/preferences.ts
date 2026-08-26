import type { AccessibilityPreferences, IsoDateTime } from '../domain/types';
import type { UiMode } from '../domain/enums';

/**
 * Bedienmodi.
 *
 * "einfach" ist kein abgespecktes Standard, sondern eine eigene Voreinstellung:
 * ein Hauptschritt pro Ansicht, sehr grosse Tippflaechen, Leichte Sprache und
 * Vorlesen von Anfang an aktiv.
 */
export const MODE_DEFAULTS: Record<UiMode, Omit<AccessibilityPreferences, 'userId' | 'updatedAt' | 'uiMode'>> = {
  einfach: {
    fontScale: 1.4,
    highContrast: false,
    colorScheme: 'system',
    reduceMotion: true,
    readAloud: true,
    readAloudRate: 0.9,
    haptics: true,
    touchTargetSize: 72,
    extraTimeFactor: 2,
    easyLanguage: true,
    signLanguage: false,
    captions: true,
  },
  standard: {
    fontScale: 1,
    highContrast: false,
    colorScheme: 'system',
    reduceMotion: false,
    readAloud: false,
    readAloudRate: 1,
    haptics: true,
    touchTargetSize: 48,
    extraTimeFactor: 1,
    easyLanguage: false,
    signLanguage: false,
    captions: true,
  },
  individuell: {
    fontScale: 1.15,
    highContrast: false,
    colorScheme: 'system',
    reduceMotion: false,
    readAloud: false,
    readAloudRate: 1,
    haptics: true,
    touchTargetSize: 56,
    extraTimeFactor: 1.5,
    easyLanguage: false,
    signLanguage: false,
    captions: true,
  },
};

/** WCAG 2.2 (2.5.8) fordert mindestens 24x24 CSS-Pixel; wir setzen 48 dp als Untergrenze. */
export const MIN_TOUCH_TARGET_DP = 48;
export const MAX_FONT_SCALE = 2.5;
export const MIN_FONT_SCALE = 0.9;

export interface SystemAccessibilitySignals {
  /** Betriebssystem meldet "Bewegung reduzieren". */
  prefersReducedMotion?: boolean;
  /** Screenreader (VoiceOver/TalkBack) laeuft. */
  screenReaderEnabled?: boolean;
  /** Vom System vorgegebene Schriftskalierung. */
  systemFontScale?: number;
  prefersHighContrast?: boolean;
  colorScheme?: 'light' | 'dark';
}

export interface EffectivePreferences extends AccessibilityPreferences {
  /** Aufgeloestes Farbschema -- nie mehr "system". */
  resolvedColorScheme: 'light' | 'dark';
  /** Ein Hauptschritt pro Ansicht. */
  oneTaskPerScreen: boolean;
  /** Screenreader aktiv: eigener Vorlesemodus tritt zurueck, um Doppelsprache zu vermeiden. */
  suppressInAppReadAloud: boolean;
}

export function createDefaultPreferences(
  userId: string,
  uiMode: UiMode,
  now: IsoDateTime,
): AccessibilityPreferences {
  return { userId, uiMode, updatedAt: now, ...MODE_DEFAULTS[uiMode] };
}

/**
 * Wechselt den Modus, ohne individuelle Angaben zu verlieren.
 *
 * Beim Wechsel nach "individuell" bleiben die aktuellen Werte erhalten -- der
 * Modus wird nur zur Beschriftung. Beim Wechsel auf "einfach"/"standard" gelten
 * die Voreinstellungen, aber vom System erzwungene Werte (z. B. reduzierte
 * Bewegung) bleiben bestehen.
 */
export function switchMode(
  current: AccessibilityPreferences,
  next: UiMode,
  now: IsoDateTime,
): AccessibilityPreferences {
  if (next === 'individuell') {
    return { ...current, uiMode: 'individuell', updatedAt: now };
  }
  const defaults = MODE_DEFAULTS[next];
  return {
    ...current,
    ...defaults,
    // Einmal bewusst abgeschaltete Bewegung bleibt abgeschaltet.
    reduceMotion: current.reduceMotion || defaults.reduceMotion,
    uiMode: next,
    updatedAt: now,
  };
}

export function clampPreferences(prefs: AccessibilityPreferences): AccessibilityPreferences {
  return {
    ...prefs,
    fontScale: clamp(prefs.fontScale, MIN_FONT_SCALE, MAX_FONT_SCALE),
    readAloudRate: clamp(prefs.readAloudRate, 0.5, 2),
    touchTargetSize: Math.max(MIN_TOUCH_TARGET_DP, Math.round(prefs.touchTargetSize)),
    extraTimeFactor: clamp(prefs.extraTimeFactor, 1, 5),
  };
}

/**
 * Verbindet gespeicherte Einstellungen mit dem, was das Betriebssystem meldet.
 * Systemseitige Einschraenkungen gewinnen immer -- niemand soll die
 * Systemeinstellung "Bewegung reduzieren" durch die App ueberstimmt bekommen.
 */
export function resolvePreferences(
  prefs: AccessibilityPreferences,
  system: SystemAccessibilitySignals = {},
): EffectivePreferences {
  const clamped = clampPreferences(prefs);
  const reduceMotion = clamped.reduceMotion || system.prefersReducedMotion === true;
  const highContrast = clamped.highContrast || system.prefersHighContrast === true;
  const fontScale = Math.min(
    MAX_FONT_SCALE,
    Math.max(clamped.fontScale, system.systemFontScale ?? 0),
  );
  const resolvedColorScheme =
    clamped.colorScheme === 'system' ? (system.colorScheme ?? 'light') : clamped.colorScheme;

  return {
    ...clamped,
    fontScale,
    reduceMotion,
    highContrast,
    resolvedColorScheme,
    oneTaskPerScreen: clamped.uiMode === 'einfach',
    suppressInAppReadAloud: system.screenReaderEnabled === true,
  };
}

/** Dauer einer Animation unter Beruecksichtigung von "Bewegung reduzieren". */
export function animationDuration(base: number, prefs: Pick<EffectivePreferences, 'reduceMotion'>): number {
  return prefs.reduceMotion ? 0 : base;
}

/** Anzeigedauer eines Hinweises. Zeitlimits sind grundsaetzlich verlaengerbar. */
export function hintDuration(base: number, prefs: Pick<EffectivePreferences, 'extraTimeFactor'>): number {
  return Math.round(base * prefs.extraTimeFactor);
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

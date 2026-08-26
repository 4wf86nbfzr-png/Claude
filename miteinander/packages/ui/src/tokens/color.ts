/**
 * Farbtokens.
 *
 * Drei vollstaendige Paletten: hell, dunkel und Hochkontrast. Jede Palette
 * traegt dieselben Schluessel, damit kein Bildschirm eine Farbe "nur im
 * Hellmodus" haben kann.
 *
 * Alle Text- und Bedienelementpaare werden im Test gegen WCAG 2.2 AA geprueft
 * (packages/ui/test/tokens.test.ts). Ein neuer Farbwert, der die Schwelle
 * reisst, laesst die Testsuite fehlschlagen.
 *
 * Grundton: tiefes Anthrazit-Blau als Traeger, ein warmes Bernstein als
 * Akzent. Kein Krankenhaus-Weiss, keine Pastell-Kindlichkeit.
 *
 * ACHTUNG: Der Adminbereich ist Web und kann diese Tokens nicht laden. Die
 * Werte sind dort als CSS-Variablen gespiegelt
 * (apps/admin/src/app/globals.css). Wer hier einen Wert aendert, muss ihn
 * dort ebenfalls aendern.
 */

export interface ColorPalette {
  /** Seitenhintergrund. */
  background: string;
  /** Flaechen, die sich vom Hintergrund abheben (Karten). */
  surface: string;
  /** Staerker abgesetzte Flaeche, z. B. hervorgehobene Karte. */
  surfaceRaised: string;
  /** Haupttext. */
  text: string;
  /** Nachgeordneter Text -- muss weiterhin AA erfuellen. */
  textMuted: string;
  /** Text auf Akzentflaechen. */
  textOnAccent: string;
  /** Akzent fuer die wichtigste Handlung. */
  accent: string;
  /** Gedrueckter Zustand des Akzents. */
  accentPressed: string;
  /** Trennlinien und Rahmen. */
  border: string;
  /** Rahmen eines Eingabefelds -- Bedienelement, deshalb mindestens 3:1. */
  inputBorder: string;
  /** Fokusring. Immer sichtbar, nie ausgeblendet. */
  focus: string;
  /** Erfolg, Warnung, Fehler -- immer zusaetzlich mit Symbol und Text. */
  success: string;
  danger: string;
  warning: string;
  /** Flaeche fuer den Notfallhinweis. */
  emergency: string;
  textOnEmergency: string;
}

export const lightColors: ColorPalette = {
  background: '#FFFFFF',
  surface: '#F4F5F7',
  surfaceRaised: '#E9EBEF',
  text: '#14181F',
  textMuted: '#4A5260',
  textOnAccent: '#FFFFFF',
  accent: '#8A4200',
  accentPressed: '#6B3300',
  border: '#B9BEC7',
  inputBorder: '#5C6470',
  focus: '#0B4FA8',
  success: '#1B5E20',
  danger: '#A31515',
  warning: '#7A4A00',
  emergency: '#8E0000',
  textOnEmergency: '#FFFFFF',
};

export const darkColors: ColorPalette = {
  background: '#0E1116',
  surface: '#171C24',
  surfaceRaised: '#222933',
  text: '#F2F4F7',
  textMuted: '#B7BFCC',
  textOnAccent: '#1A1200',
  accent: '#FFB35C',
  accentPressed: '#E09640',
  border: '#3A424E',
  inputBorder: '#8B95A5',
  focus: '#7FB8FF',
  success: '#7BD98A',
  danger: '#FF9C93',
  warning: '#FFC46B',
  emergency: '#FF8A80',
  textOnEmergency: '#1A0000',
};

/** Hochkontrastmodus: Ziel ist AAA fuer Fliesstext (7:1). */
export const highContrastColors: ColorPalette = {
  background: '#000000',
  surface: '#000000',
  surfaceRaised: '#111111',
  text: '#FFFFFF',
  textMuted: '#E6E6E6',
  textOnAccent: '#000000',
  accent: '#FFD400',
  accentPressed: '#E0BB00',
  border: '#FFFFFF',
  inputBorder: '#FFFFFF',
  focus: '#00E5FF',
  success: '#7CFF9B',
  danger: '#FF8A80',
  warning: '#FFD400',
  emergency: '#FFFFFF',
  textOnEmergency: '#000000',
};

export type ColorSchemeName = 'light' | 'dark' | 'highContrast';

export function palette(scheme: 'light' | 'dark', highContrast: boolean): ColorPalette {
  if (highContrast) return highContrastColors;
  return scheme === 'dark' ? darkColors : lightColors;
}

/**
 * Paare, die im Test geprueft werden. Der Eintrag `role` entscheidet ueber die
 * Schwelle: Text 4.5:1, grosser Text und Bedienelemente 3:1.
 */
export const CONTRAST_PAIRS: Array<{
  name: string;
  fg: keyof ColorPalette;
  bg: keyof ColorPalette;
  role: 'text' | 'largeText' | 'nonText';
}> = [
  { name: 'Haupttext auf Hintergrund', fg: 'text', bg: 'background', role: 'text' },
  { name: 'Haupttext auf Karte', fg: 'text', bg: 'surface', role: 'text' },
  { name: 'Haupttext auf hervorgehobener Karte', fg: 'text', bg: 'surfaceRaised', role: 'text' },
  { name: 'Nachgeordneter Text auf Hintergrund', fg: 'textMuted', bg: 'background', role: 'text' },
  { name: 'Nachgeordneter Text auf Karte', fg: 'textMuted', bg: 'surface', role: 'text' },
  { name: 'Text auf Akzentfläche', fg: 'textOnAccent', bg: 'accent', role: 'text' },
  { name: 'Text auf gedrückter Akzentfläche', fg: 'textOnAccent', bg: 'accentPressed', role: 'text' },
  { name: 'Akzent als Bedienelement', fg: 'accent', bg: 'background', role: 'nonText' },
  { name: 'Eingaberahmen', fg: 'inputBorder', bg: 'background', role: 'nonText' },
  { name: 'Eingaberahmen auf Karte', fg: 'inputBorder', bg: 'surface', role: 'nonText' },
  { name: 'Fokusring auf Hintergrund', fg: 'focus', bg: 'background', role: 'nonText' },
  { name: 'Fokusring auf Karte', fg: 'focus', bg: 'surface', role: 'nonText' },
  { name: 'Fehlertext', fg: 'danger', bg: 'background', role: 'text' },
  { name: 'Fehlertext auf Karte', fg: 'danger', bg: 'surface', role: 'text' },
  { name: 'Erfolgstext', fg: 'success', bg: 'background', role: 'text' },
  { name: 'Warntext', fg: 'warning', bg: 'background', role: 'text' },
  { name: 'Notfalltext', fg: 'textOnEmergency', bg: 'emergency', role: 'text' },
];

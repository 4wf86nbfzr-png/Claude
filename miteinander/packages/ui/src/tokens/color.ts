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
 * Grundton kommt aus dem Logo: tiefes Navy (#022255) als Traeger, Tuerkis
 * (#02B9B5) und Koralle (#FD624D) als Markenfarben.
 *
 * Tuerkis und Koralle sind in ihrer reinen Form zu hell fuer Text -- 2,4:1
 * und 3,0:1 auf Weiss. Sie stehen deshalb im Logo und in Flaechen, waehrend
 * Text und Bedienelemente abgedunkelte Varianten nutzen. Die Marke bleibt
 * erkennbar, ohne dass jemand raten muss, was dort steht.
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
  surface: '#F1F5FA',
  surfaceRaised: '#E2EAF4',
  text: '#022255',
  textMuted: '#48597A',
  textOnAccent: '#FFFFFF',
  accent: '#022255',
  accentPressed: '#01173C',
  border: '#6F84A6',
  inputBorder: '#5A6B88',
  focus: '#0B57C7',
  success: '#146B3A',
  danger: '#B03A28',
  warning: '#8A4B00',
  emergency: '#8E0000',
  textOnEmergency: '#FFFFFF',
};

export const darkColors: ColorPalette = {
  background: '#0A1A33',
  surface: '#12294A',
  surfaceRaised: '#1D3A63',
  text: '#F2F6FA',
  textMuted: '#B7C6DB',
  textOnAccent: '#05231F',
  accent: '#3FD8D2',
  accentPressed: '#26B7B1',
  border: '#7A93BC',
  inputBorder: '#8FA6C4',
  focus: '#7FC9FF',
  success: '#7BD98A',
  danger: '#FF9382',
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
  accent: '#5CF0EA',
  accentPressed: '#3ED2CC',
  border: '#FFFFFF',
  inputBorder: '#FFFFFF',
  focus: '#FFD400',
  success: '#7CFF9B',
  danger: '#FF8A80',
  warning: '#FFD400',
  emergency: '#FFFFFF',
  textOnEmergency: '#000000',
};

/**
 * Markenfarben in ihrer reinen Form.
 *
 * Nur fuer Flaechen und Grafik -- nie fuer Text auf hellem Grund. Wer sie
 * doch dort einsetzt, faellt im Kontrasttest auf.
 */
export const markenfarben = {
  navy: '#022255',
  tuerkis: '#02B9B5',
  koralle: '#FD624D',
} as const;

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
  { name: 'Kartenrahmen auf Hintergrund', fg: 'border', bg: 'background', role: 'nonText' },
  { name: 'Kartenrahmen auf Karte', fg: 'border', bg: 'surface', role: 'nonText' },
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

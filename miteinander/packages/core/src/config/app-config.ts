/**
 * Zentrale Produktkonfiguration.
 *
 * Der Arbeitstitel "MITEINANDER" ist bewusst NUR hier hinterlegt. Kein anderer
 * Programmteil darf den Namen fest verdrahten -- ein spaeterer Rebrand aendert
 * ausschliesslich diese Datei bzw. die Umgebungsvariablen.
 */

export interface AppConfig {
  /** Angezeigter Produktname. */
  readonly appName: string;
  /** Kurzform fuer enge Stellen (z. B. Kopfzeile im Einfach-Modus). */
  readonly appNameShort: string;
  /** Ein Satz, der das Produkt in Leichter Sprache erklaert. */
  readonly claim: string;
  /** Verantwortliche Stelle im Sinne der DSGVO (vor Start ausfuellen). */
  readonly operator: string;
  readonly supportEmail: string;
  readonly accessibilityFeedbackEmail: string;
  readonly privacyEmail: string;
  /** Notrufnummern -- landesspezifisch, hier Deutschland. */
  readonly emergencyNumbers: ReadonlyArray<{ label: string; number: string; hint: string }>;
  /** Mindestalter fuer alle Konten im MVP. */
  readonly minimumAge: number;
  /** Feature-Schalter fuer austauschbare Module. */
  readonly features: {
    readonly payments: boolean;
    readonly videoCalls: boolean;
    readonly signLanguageInterpreterBooking: boolean;
    readonly costBearerBilling: boolean;
  };
}

function env(key: string, fallback: string): string {
  // Laeuft in Node, Expo (process.env wird zur Bauzeit ersetzt) und Next.
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return value && value.length > 0 ? value : fallback;
}

function flag(key: string, fallback: boolean): boolean {
  const value = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (value === undefined || value === '') return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

export const appConfig: AppConfig = {
  appName: env('EXPO_PUBLIC_APP_NAME', 'MITEINANDER'),
  appNameShort: env('EXPO_PUBLIC_APP_NAME_SHORT', 'MITEINANDER'),
  claim: env(
    'EXPO_PUBLIC_APP_CLAIM',
    'Hier finden Sie Menschen, die Sie im Alltag unterstützen.',
  ),
  operator: env('EXPO_PUBLIC_OPERATOR', 'Betreiber: bitte vor dem Start eintragen'),
  supportEmail: env('EXPO_PUBLIC_SUPPORT_EMAIL', 'hilfe@example.org'),
  accessibilityFeedbackEmail: env('EXPO_PUBLIC_A11Y_EMAIL', 'barrierefreiheit@example.org'),
  privacyEmail: env('EXPO_PUBLIC_PRIVACY_EMAIL', 'datenschutz@example.org'),
  emergencyNumbers: [
    { label: 'Notruf 112', number: '112', hint: 'Feuerwehr und Rettungsdienst. Bei Gefahr für Leben und Gesundheit.' },
    { label: 'Polizei 110', number: '110', hint: 'Polizei. Bei Gewalt, Bedrohung oder Straftaten.' },
  ],
  minimumAge: 18,
  features: {
    payments: flag('EXPO_PUBLIC_FEATURE_PAYMENTS', false),
    videoCalls: flag('EXPO_PUBLIC_FEATURE_VIDEO', true),
    signLanguageInterpreterBooking: flag('EXPO_PUBLIC_FEATURE_DGS_INTERPRETER', false),
    costBearerBilling: flag('EXPO_PUBLIC_FEATURE_COST_BEARER', false),
  },
};

/**
 * Diese App ersetzt keinen Notruf. Der Hinweis wird an allen Stellen
 * eingebunden, an denen Menschen Hilfe suchen.
 */
export const EMERGENCY_DISCLAIMER =
  'Diese App ist kein Notruf. Wenn jemand in Gefahr ist, rufen Sie 112 oder 110 an.';

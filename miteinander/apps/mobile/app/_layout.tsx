import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '@miteinander/ui';
import { AppStateProvider, useAppState } from '../src/state/app-state';
import { AccessibilityHeaderButton } from '../src/components/AccessibilityHeaderButton';

/** Route -> Titel in der Kopfzeile. */
const SCREEN_TITLES: Array<[string, string]> = [
  ['index', 'Start'],
  ['sprachfuehrung', 'Mika führt Sie'],
  ['mika', 'Verständigung'],
  ['bedienhilfen', 'Bedienhilfen'],
  ['anmelden', 'Anmelden'],
  ['hilfe', 'Hilfe und Notfall'],
  ['datenschutz', 'Ihre Daten'],
  ['vertrauenspersonen', 'Vertrauenspersonen'],
  ['freigaben', 'Wer entscheidet mit'],
  ['verantwortlich/index', 'Meine Verantwortung'],
  ['verantwortlich/einrichten', 'Person einrichten'],
  ['verantwortlich/freigaben/[id]', 'Freigabe'],
  ['suchen/profil', 'Mein Profil'],
  ['suchen/anfrage', 'Unterstützung anfragen'],
  ['suchen/vorschlaege', 'Vorschläge'],
  ['suchen/vergleich', 'Vergleich'],
  ['suchen/termine', 'Meine Termine'],
  ['suchen/person/[id]', 'Profil ansehen'],
  ['suchen/chat/[id]', 'Nachrichten'],
  ['suchen/buchung/[id]', 'Buchung bestätigen'],
  ['suchen/bewertung/[id]', 'Rückmeldung'],
  ['anbieten/onboarding', 'Unterstützung anbieten'],
  ['anbieten/leistungen', 'Mein Leistungsprofil'],
  ['anbieten/auftraege', 'Anfragen'],
  ['anbieten/planer', 'Mein Planer'],
  ['anbieten/nachweise', 'Meine Nachweise'],
];

function Shell() {
  const { prefs } = useAppState();
  return (
    <ThemeProvider prefs={prefs}>
      <StatusBar style={prefs.resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: true,
          headerBackTitle: 'Zurück',
          // Bei reduzierter Bewegung keine Übergänge.
          animation: prefs.reduceMotion ? 'none' : 'default',
          // Die Bedienhilfen sind von jedem Bildschirm aus erreichbar.
          headerRight: () => <AccessibilityHeaderButton />,
        }}
      >
        {/*
          Jede Route bekommt einen verstaendlichen deutschen Titel. Ohne
          Eintrag zeigt expo-router den Dateipfad -- der waere fuer einen
          Screenreader die erste Ansage der Seite.
        */}
        {SCREEN_TITLES.map(([name, title]) => (
          <Stack.Screen
            key={name}
            name={name}
            options={name === 'index' ? { title, headerShown: false } : { title }}
          />
        ))}
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

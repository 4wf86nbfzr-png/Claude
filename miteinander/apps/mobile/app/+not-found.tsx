import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Button, Callout, Screen } from '@miteinander/ui';

/**
 * Auffangbildschirm für unbekannte Adressen.
 *
 * Zwei Fälle: ein kaputter Deep Link, und die Testfassung als einzelne
 * Datei -- dort ist die Adresse ein Dateipfad und passt auf keine Route.
 * In beiden Fällen ist die Startseite das Richtige. Wer ohne Umleitung
 * hier landet, bekommt eine verständliche Erklärung statt einer
 * englischen Fehlerseite.
 */
export default function NichtGefunden() {
  const router = useRouter();
  // Der Web-Ausgang von React Native bringt keine DOM-Typen mit --
  // deshalb hier ein eng gefasster Zugriff statt eines globalen any.
  const protokoll = (globalThis as { location?: { protocol?: string } }).location?.protocol;
  const alsDatei = Platform.OS === 'web' && protokoll === 'file:';

  useEffect(() => {
    if (!alsDatei) return;
    // In der Datei-Fassung gibt es keine sinnvolle Adresse -- direkt zum Start.
    router.replace('/');
  }, [alsDatei, router]);

  if (alsDatei) return <Redirect href="/" />;

  return (
    <Screen
      title="Diese Seite gibt es nicht"
      intro="Der Link führt ins Leere. Das liegt nicht an Ihnen."
      easyIntro="Diese Seite gibt es nicht. Sie haben nichts falsch gemacht."
    >
      <Callout tone="info" title="Was Sie tun können">
        Gehen Sie zurück zum Start. Von dort finden Sie alles wieder.
      </Callout>
      <Button label="Zum Start" onPress={() => router.replace('/')} />
    </Screen>
  );
}

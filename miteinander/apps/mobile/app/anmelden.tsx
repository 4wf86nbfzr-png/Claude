import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { CONSENT_CATALOG, appConfig } from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';

/**
 * Screen 3: Einfache Registrierung und Anmeldung.
 *
 * Pflichteinwilligungen stehen einzeln und ohne Vorabhaken. Biometrie laeuft
 * ueber die sicheren Funktionen des Betriebssystems -- die App speichert
 * niemals biometrische Rohdaten.
 */
export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [email, setEmail] = useState('');
  const [accepted, setAccepted] = useState<string[]>([]);
  const required = CONSENT_CATALOG.filter((c) => c.requiredForService);
  const missing = required.filter((c) => !accepted.includes(c.purpose));

  return (
    <Screen
      title="Anmelden"
      intro="Wir brauchen nur Ihre E-Mail-Adresse. Ein Passwort ist nicht nötig – Sie bekommen einen Link."
      easyIntro="Bitte geben Sie Ihre E-Mail-Adresse ein."
      onSpeak={speak}
      footer={
        <ButtonStack>
          <Button
            label="Anmelde-Link schicken"
            disabled={!email.trim() || missing.length > 0}
            onPress={() => router.push('/')}
          />
          <Button
            label="Mit Face ID oder Fingerabdruck anmelden"
            variant="secondary"
            onPress={() => speak('Die Anmeldung läuft über Ihr Gerät. Wir speichern keine biometrischen Daten.')}
            accessibilityHint="Die Prüfung übernimmt Ihr Gerät. Die App speichert keine biometrischen Daten."
          />
        </ButtonStack>
      }
    >
      <TextField
        label="E-Mail-Adresse"
        value={email}
        onChangeText={setEmail}
        autoComplete="email"
        keyboardType="email-address"
        required
      />

      <Text variant="heading" accessibilityRole="header">
        Das müssen Sie bestätigen
      </Text>
      <View style={{ gap: theme.spacing.m }}>
        {required.map((item) => (
          <ChoiceCard
            key={item.purpose}
            title={item.title}
            description={item.explanation}
            easyDescription={item.easyExplanation}
            selected={accepted.includes(item.purpose)}
            onPress={() =>
              setAccepted((current) =>
                current.includes(item.purpose)
                  ? current.filter((p) => p !== item.purpose)
                  : [...current, item.purpose],
              )
            }
            onSpeak={speak}
          />
        ))}
      </View>

      <Callout tone="info" title="Alles andere ist freiwillig">
        Weitere Erlaubnisse fragen wir erst, wenn sie gebraucht werden – und immer einzeln. Sie
        finden alle unter „Ihre Daten“.
      </Callout>

      <Text variant="caption" muted>
        Für ein Konto müssen Sie mindestens {appConfig.minimumAge} Jahre alt sein.
      </Text>
    </Screen>
  );
}

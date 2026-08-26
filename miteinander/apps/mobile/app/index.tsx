import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { appConfig } from '@miteinander/core';
import { Button, Callout, ChoiceCard, EmergencyBar, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { heroStartseite } from '../src/inhalte/bilder';
import { useReadAloud } from '../src/state/speech';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';

/**
 * Screen 1: Start und Moduswahl.
 *
 * Kein Formular, keine Registrierung. Drei grosse Karten, jede mit Symbol,
 * kurzem Text, Vorlesen-Knopf und -- sobald produziert -- einem DGS-Video.
 */
export default function StartScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { prefs, setMode, setCurrentUserId, easy } = useAppState();
  const { speak, speaking, stop } = useReadAloud(prefs);

  const seek = easy.resolve('home.seek', 'Jemand hilft Ihnen im Alltag.');
  const offer = easy.resolve('home.offer', 'Sie möchten anderen Menschen helfen.');
  const responsible = easy.resolve(
    'home.responsible',
    'Sie kümmern sich um einen Menschen.\nSie sehen, was los ist.\nSie sagen Ja oder Nein.',
  );

  return (
    <Screen
      title={appConfig.appName}
      intro={appConfig.claim}
      easyIntro="Hier finden Sie Menschen, die Ihnen helfen."
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="onboarding.mode_choice" />}
      hero={heroStartseite}
    >
      <Text variant="heading" accessibilityRole="header">
        Was möchten Sie tun?
      </Text>

      <View style={{ gap: theme.spacing.l }}>
        {/* Oben und am größten: der Zugang für Menschen, die Hilfe suchen.
            Für sie muss die App vor allem eines sein -- leicht. */}
        <ChoiceCard
          testID="choice-seek"
          title="Ich suche Unterstützung"
          description="Sie brauchen Hilfe im Alltag. Wir suchen passende Menschen für Sie."
          easyDescription={seek.text}
          icon={<Text variant="display" accessibilityElementsHidden>🤝</Text>}
          onPress={() => {
            setMode('seek');
            setCurrentUserId('u_seeker_1');
            router.push('/suchen/anfrage');
          }}
          onSpeak={speak}
        />

        <ChoiceCard
          testID="choice-offer"
          title="Ich biete Unterstützung an"
          description="Sie begleiten Menschen im Alltag – als Fachkraft, Alltagsbegleitung oder ehrenamtlich."
          easyDescription={offer.text}
          icon={<Text variant="display" accessibilityElementsHidden>💛</Text>}
          onPress={() => {
            setMode('offer');
            setCurrentUserId('u_provider_1');
            router.push('/anbieten/onboarding');
          }}
          onSpeak={speak}
        />

        <ChoiceCard
          testID="choice-responsible"
          title="Ich bin verantwortlich für eine Person"
          description="Sie richten die App für jemanden ein, behalten den Überblick und geben frei, was vereinbart wurde."
          easyDescription={responsible.text}
          icon={<Text variant="display" accessibilityElementsHidden>🧭</Text>}
          onPress={() => {
            setMode('responsible');
            setCurrentUserId('u_trusted_2');
            router.push('/verantwortlich');
          }}
          onSpeak={speak}
        />
      </View>

      {/* Kein vierter Kasten: wer nur beim Bedienen Hilfe braucht, findet
          das hier als ruhigen Nebenweg. */}
      <Button
        label="Jemand hilft mir beim Bedienen"
        variant="quiet"
        onPress={() => {
          setMode('assisted');
          setCurrentUserId('u_seeker_1');
          router.push('/vertrauenspersonen');
        }}
        accessibilityHint="Eine Person Ihres Vertrauens richtet die App gemeinsam mit Ihnen ein."
      />

      {seek.notice ? <Callout tone="info" title="Hinweis zu den Texten">{seek.notice}</Callout> : null}

      <View style={{ gap: theme.spacing.m }}>
        <Button
          label="Bedienung einstellen"
          variant="secondary"
          onPress={() => router.push('/bedienhilfen')}
          accessibilityHint="Schrift, Farben, Vorlesen und Gebärdensprache einstellen."
        />
        <Button label="Hilfe" variant="quiet" onPress={() => router.push('/hilfe')} />
        {speaking ? <Button label="Vorlesen anhalten" variant="quiet" onPress={stop} /> : null}
      </View>

      <EmergencyBar />
    </Screen>
  );
}

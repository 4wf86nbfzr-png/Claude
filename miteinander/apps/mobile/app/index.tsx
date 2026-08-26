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
  const { prefs, setMode, dgs, easy } = useAppState();
  const { speak, speaking, stop } = useReadAloud(prefs);

  const seek = easy.resolve('home.seek', 'Jemand hilft Ihnen im Alltag.');
  const offer = easy.resolve('home.offer', 'Sie möchten anderen Menschen helfen.');
  const assisted = easy.resolve('home.assisted', 'Eine Person hilft Ihnen beim Bedienen der App.');

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
        <ChoiceCard
          testID="choice-seek"
          title="Ich suche Unterstützung"
          description="Sie brauchen Hilfe im Alltag. Wir suchen passende Menschen für Sie."
          easyDescription={seek.text}
          icon={<Text variant="display" accessibilityElementsHidden>🤝</Text>}
          onPress={() => {
            setMode('seek');
            router.push('/suchen/anfrage');
          }}
          onSpeak={speak}
          signLanguageAvailable={dgs.isApproved('onboarding.mode_choice')}
          onOpenSignLanguage={() => router.push('/hilfe')}
        />

        <ChoiceCard
          testID="choice-offer"
          title="Ich biete Unterstützung an"
          description="Sie möchten andere Menschen begleiten – beruflich oder ehrenamtlich."
          easyDescription={offer.text}
          icon={<Text variant="display" accessibilityElementsHidden>💛</Text>}
          onPress={() => {
            setMode('offer');
            router.push('/anbieten/onboarding');
          }}
          onSpeak={speak}
        />

        <ChoiceCard
          testID="choice-assisted"
          title="Jemand unterstützt mich bei der Bedienung"
          description="Eine Person Ihres Vertrauens richtet die App gemeinsam mit Ihnen ein."
          easyDescription={assisted.text}
          icon={<Text variant="display" accessibilityElementsHidden>👥</Text>}
          onPress={() => {
            setMode('assisted');
            router.push('/vertrauenspersonen');
          }}
          onSpeak={speak}
        />
      </View>

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

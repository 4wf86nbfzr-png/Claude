import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BEGLEITER, appConfig } from '@miteinander/core';
import { Button, Callout, ChoiceCard, EmergencyBar, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { heroStartseite } from '../src/inhalte/bilder';
import { Startbild } from '../src/components/Startbild';
import { useReadAloud } from '../src/state/speech';
import { Begleiter } from '../src/components/Begleiter';

/**
 * Screen 1: Start.
 *
 * Zwei Wege, klar getrennt:
 *
 *   „Sagen Sie es einfach"  -- Mika hoert zu und fuehrt. Der leichteste Weg,
 *                              deshalb steht er oben und ist der groesste.
 *   Drei Karten             -- fuer alle, die lieber selbst waehlen.
 *
 * Alles Weitere (Bedienung einstellen, Hilfe, jemand hilft mir) steht
 * darunter als ruhige Zeile. Der Bildschirm hat damit genau eine Frage:
 * Was moechten Sie tun?
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
      dgs={<Begleiter schluessel="start" />}
      // Bewegtes Startbild nur, wenn Bewegung erlaubt ist.
      hero={{ ...heroStartseite, ...(prefs.reduceMotion ? {} : { video: <Startbild /> }) }}
    >
      {/* Der leichteste Weg zuerst: sagen, was man braucht. */}
      <ChoiceCard
        testID="choice-mika"
        title="Sagen Sie einfach, was Sie brauchen"
        description={`${BEGLEITER.name} hört zu und bringt Sie hin. Sie können auch tippen.`}
        easyDescription={'Sagen Sie, was Sie brauchen.\nMika bringt Sie hin.'}
        icon={<Text variant="display" accessibilityElementsHidden>🎙️</Text>}
        onPress={() => router.push('/sprachfuehrung')}
        onSpeak={speak}
      />

      <Button
        testID="zu-mika-verstaendigung"
        label="Ich kann nicht sprechen – das Gerät spricht für mich"
        variant="secondary"
        onPress={() => router.push('/mika')}
        accessibilityHint="Karten und Text, die laut gesprochen werden. Ihr Gegenüber antwortet auf demselben Bildschirm."
      />

      <Text variant="heading" accessibilityRole="header">
        Oder wählen Sie selbst
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

      {/* Der Hinweis auf ungeprüfte Texte steht dort, wo er zählt: bei
          eingeschalteter Leichter Sprache. Sonst wäre er nur ein Kasten
          mehr für Menschen, die ihn gar nicht betrifft. */}
      {prefs.easyLanguage && seek.notice ? (
        <Callout tone="info" title="Hinweis zu den Texten">
          {seek.notice}
        </Callout>
      ) : null}

      {/* Ruhige Zeile: alles, was nicht die Hauptfrage dieses Bildschirms
          ist. Kein vierter Kasten -- der würde die drei Wege verwässern. */}
      <View style={{ gap: theme.spacing.s }}>
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
        <Button
          label="Bedienung einstellen"
          variant="quiet"
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

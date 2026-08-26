import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BEGLEITER,
  BEISPIEL_SAETZE,
  SICHER_AB,
  appConfig,
  begruessung,
  ersteWunsch,
  kategorienFuerEntwurf,
  type Wunsch,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  EmergencyBar,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';
import {
  ZUHOEREN_HINWEIS_WEB,
  useZuhoeren,
  zuhoerMeldung,
  zuhoerenMoeglich,
} from '../src/state/zuhoeren';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';
import { Rueckfragen } from '../src/components/Rueckfragen';

/**
 * Die Sprachfuehrung.
 *
 * Mika begruesst, fragt "Was kann ich fuer Sie tun?", hoert zu oder liest
 * mit, und bringt die Person dorthin, wo ihr Wunsch hingehoert -- mit
 * bereits ausgefuellter Kategorie.
 *
 * Drei Regeln, die hier nicht verhandelbar sind:
 *
 *  1. Was verstanden wurde, steht als Text auf dem Bildschirm. Immer.
 *     Eine Stimme, die etwas falsch versteht und trotzdem weitergeht, ist
 *     schlimmer als gar keine Stimme.
 *  2. Unter SICHER_AB wird nachgefragt, nicht geraten.
 *  3. Die Fuehrung fuehrt hin und fuellt aus. Abgeschickt, gebucht und
 *     eingewilligt wird ausschliesslich mit einem Fingertipp auf dem
 *     Bildschirm (siehe IRREVERSIBLE_ACTIONS in core).
 */
export default function Sprachfuehrung() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs, setMode, setCurrentUserId, setSprachWunsch } = useAppState();
  const { speak, speaking, stop } = useReadAloud(prefs);

  const [wunsch, setWunsch] = useState<Wunsch | null>(null);
  const [getippt, setGetippt] = useState('');
  const [begruesst, setBegruesst] = useState(false);

  const gruss = begruessung(appConfig.appName, prefs.easyLanguage);

  const auswerten = useCallback(
    (satz: string) => {
      const ergebnis = ersteWunsch(satz);
      setWunsch(ergebnis);
      speak(prefs.easyLanguage ? ergebnis.antwortLeicht : ergebnis.antwort);
    },
    [prefs.easyLanguage, speak],
  );

  const { stand, zwischenstand, starten, stoppen } = useZuhoeren(auswerten);
  const meldung = zuhoerMeldung(stand);
  const kannHoeren = zuhoerenMoeglich();

  // Begruessen, sobald der Bildschirm da ist -- aber nur einmal, und nur,
  // wenn Vorlesen ueberhaupt erwuenscht ist. Das Mikrofon geht dabei NICHT
  // von allein an; zuhoeren beginnt erst auf Knopfdruck.
  const gesprochen = useRef(false);
  useEffect(() => {
    if (gesprochen.current) return;
    gesprochen.current = true;
    setBegruesst(true);
    speak(gruss);
  }, [gruss, speak]);

  /** Bringt die Person dorthin, wo ihr Wunsch hingehoert. */
  const fuehren = (ziel: Wunsch) => {
    stoppen();
    stop();
    const kategorien = kategorienFuerEntwurf(ziel);
    if (kategorien.length > 0) {
      setSprachWunsch({ kategorien, gehoert: ziel.gehoert });
    }
    if (ziel.art === 'anbieten') {
      setMode('offer');
      setCurrentUserId('u_provider_1');
    } else if (ziel.art === 'verantwortlich') {
      setMode('responsible');
      setCurrentUserId('u_trusted_2');
    } else if (ziel.art === 'dienstleistung' || ziel.art === 'termine') {
      setMode('seek');
      setCurrentUserId('u_seeker_1');
    }
    router.push(ziel.ziel as never);
  };

  const sicher = wunsch !== null && wunsch.sicherheit >= SICHER_AB && wunsch.ziel !== '';

  return (
    <Screen
      title="Mika führt Sie durch die App"
      intro={gruss}
      easyIntro={'Sagen Sie, was Sie brauchen.\nMika bringt Sie hin.'}
      onSpeak={speak}
      /* Kein Begleiter-Block: dieser Bildschirm ist Mika. Ein Knopf
         „Mika fragen" daneben wäre dieselbe Figur zweimal. Gebärdensprache
         steht deshalb direkt hier. */
      dgs={<DgsAbschnitt schluessel="onboarding.welcome" standardOffen={prefs.signLanguage} />}
    >
      {/* Wer hier spricht, und dass es kein Mensch ist -- in einem Atemzug. */}
      <Callout tone="info" title={`${BEGLEITER.name} – ${BEGLEITER.rolle}`}>
        {BEGLEITER.selbstauskunft}
      </Callout>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Was kann ich für Sie tun?
        </Text>
        <Text muted>
          Sagen Sie es in einem Satz. Zum Beispiel: „Ich möchte zum Arzt begleitet werden.“
        </Text>
      </View>

      <ButtonStack>
        {stand === 'laeuft' ? (
          <Button
            testID="zuhoeren-stopp"
            label="Ich bin fertig"
            onPress={stoppen}
            accessibilityHint="Beendet das Zuhören."
          />
        ) : (
          <Button
            testID="zuhoeren-start"
            label={kannHoeren ? 'Sprechen – ich höre zu' : 'Zuhören geht auf diesem Gerät nicht'}
            onPress={starten}
            disabled={!kannHoeren}
            accessibilityHint={
              kannHoeren
                ? 'Das Mikrofon wird eingeschaltet, bis Sie einen Satz gesagt haben.'
                : 'Tippen Sie Ihren Satz in das Feld darunter.'
            }
          />
        )}
        {begruesst && !speaking ? (
          <Button label="Begrüßung wiederholen" variant="quiet" onPress={() => speak(gruss)} />
        ) : null}
        {speaking ? <Button label="Vorlesen anhalten" variant="quiet" onPress={stop} /> : null}
      </ButtonStack>

      {stand === 'laeuft' ? (
        <View accessibilityLiveRegion="polite">
          <Callout tone="info" title="Ich höre zu">
            {zwischenstand ? `… ${zwischenstand}` : 'Sprechen Sie jetzt.'}
          </Callout>
        </View>
      ) : null}

      {meldung ? (
        <Callout tone="warning" title="Zum Zuhören">
          {meldung}
        </Callout>
      ) : null}

      {/* Tippen ist gleichwertig, nicht Ersatz. Es steht deshalb immer da. */}
      <View style={{ gap: theme.spacing.s }}>
        <TextField
          testID="feld-wunsch"
          label="Oder tippen Sie es"
          value={getippt}
          onChangeText={setGetippt}
          hint="Ein Satz genügt. Sie können auch einen der Beispielsätze abtippen."
          multiline
        />
        <Button
          testID="wunsch-auswerten"
          label="Das ist mein Wunsch"
          variant="secondary"
          onPress={() => {
            const satz = getippt.trim();
            if (satz) auswerten(satz);
          }}
        />
      </View>

      {/* Ergebnis. Was verstanden wurde, steht wortwoertlich da. */}
      {wunsch ? (
        <View accessibilityLiveRegion="polite" style={{ gap: theme.spacing.m }}>
          <Callout
            tone={wunsch.art === 'notfall' ? 'warning' : sicher ? 'success' : 'info'}
            title={`Ich habe verstanden: „${wunsch.gehoert.trim()}“`}
          >
            {prefs.easyLanguage ? wunsch.antwortLeicht : wunsch.antwort}
          </Callout>

          <ButtonStack>
            {sicher ? (
              <Button
                testID="wunsch-weiter"
                label={
                  wunsch.art === 'dienstleistung'
                    ? 'Ja, bringen Sie mich zur Anfrage'
                    : 'Ja, bringen Sie mich hin'
                }
                onPress={() => fuehren(wunsch)}
              />
            ) : null}
            <Button
              label="Nein, das war nicht richtig"
              variant="secondary"
              onPress={() => {
                setWunsch(null);
                setGetippt('');
                speak('Kein Problem. Sagen Sie es gern noch einmal – oder tippen Sie es.');
              }}
            />
            <Button
              label="Antwort noch einmal vorlesen"
              variant="quiet"
              onPress={() => speak(prefs.easyLanguage ? wunsch.antwortLeicht : wunsch.antwort)}
            />
          </ButtonStack>
        </View>
      ) : null}

      {/* Beispielsaetze sind Knoepfe: wer sie nicht sprechen kann, tippt
          nicht ab, sondern waehlt. */}
      <View style={{ gap: theme.spacing.s }}>
        <Text variant="label">Beispiele – tippen Sie einen an</Text>
        {BEISPIEL_SAETZE.map((satz) => (
          <Button
            key={satz}
            label={satz}
            variant="secondary"
            onPress={() => {
              setGetippt(satz);
              auswerten(satz);
            }}
          />
        ))}
      </View>

      {kannHoeren ? (
        <Callout tone="info" title="Was mit Ihrer Stimme geschieht">
          {ZUHOEREN_HINWEIS_WEB}
        </Callout>
      ) : null}

<Rueckfragen schluessel="sprachfuehrung" />

      <Callout tone="info" title="Was ich nicht tue">
        Ich fülle für Sie aus und bringe Sie hin. Abgeschickt, gebucht oder zugestimmt wird nie
        auf Zuruf – das bestätigen Sie immer selbst auf dem Bildschirm.
      </Callout>

      <Button label="Zurück zum Start" variant="quiet" onPress={() => router.push('/')} />

      <EmergencyBar />
    </Screen>
  );
}

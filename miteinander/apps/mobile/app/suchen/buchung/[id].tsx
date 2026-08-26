import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  requiresVisualConfirmation,
  type ApprovalRequest,
  type Booking,
  type ConfirmationSummary,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  Screen,
  Text,
  WhatHappensNext,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../../src/state/app-state';
import { useReadAloud } from '../../../src/state/speech';
import { DgsAbschnitt } from '../../../src/components/DgsAbschnitt';

/**
 * Screen 10: Buchungszusammenfassung und Bestätigung.
 *
 * Vor der verbindlichen Buchung steht immer diese Ansicht. Bestaetigt wird
 * mit einer ausdruecklichen Handlung am Bildschirm -- ein Sprachbefehl
 * allein reicht dafuer nie (siehe requiresVisualConfirmation).
 */
export default function BookingConfirmation() {
  const theme = useTheme();
  const router = useRouter();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { service, data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [summary, setSummary] = useState<ConfirmationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [wartetAufFreigabe, setWartetAufFreigabe] = useState<ApprovalRequest | null>(null);
  const [verantwortlich, setVerantwortlich] = useState<string>('Ihre verantwortliche Person');

  const propose = useCallback(async () => {
    setError(null);
    try {
      const conversation = await data.conversations.get(conversationId);
      if (!conversation?.requestId) throw new Error('Zu dieser Unterhaltung gibt es keine Anfrage.');
      const request = await data.requests.get(conversation.requestId);
      if (!request) throw new Error('Anfrage nicht gefunden.');
      const result = await service.proposeBooking({
        requestId: request.id,
        providerId: conversation.providerId,
        startsAt: request.startsAt,
        durationMinutes: request.durationMinutes,
        meetingPointDescription: 'Wird im Chat abgestimmt',
        priceCents: 4200,
      });
      setBooking(result.booking);
      setSummary(result.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Es hat nicht geklappt.');
    }
  }, [conversationId, data, service]);

  useEffect(() => {
    void propose();
  }, [propose]);

  useEffect(() => {
    if (!wartetAufFreigabe) return;
    void data.users
      .get(wartetAufFreigabe.responsibleId)
      .then((person) => person && setVerantwortlich(person.displayName));
  }, [wartetAufFreigabe, data]);

  const confirm = async () => {
    if (!booking) return;
    setError(null);
    try {
      const ergebnis = await service.confirmBooking(booking.id, currentUserId);
      setBooking(ergebnis.booking);
      // Wartet eine Freigabe, ist das kein Fehler, sondern ein Zwischenschritt.
      setWartetAufFreigabe(ergebnis.approval ?? null);
      if (ergebnis.booking.status === 'confirmed') {
        router.push('/suchen/termine');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Die Bestätigung hat nicht geklappt.');
    }
  };

  return (
    <Screen
      title={summary?.title ?? 'Ihre Buchung'}
      intro="Bitte lesen Sie alles in Ruhe durch. Nichts passiert, bevor Sie bestätigen."
      easyIntro="Bitte prüfen Sie: Stimmt alles?"
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="booking.summary" />}
      footer={
        <ButtonStack>
          <Button
            label="Ja, Termin verbindlich buchen"
            disabled={!checked || !booking}
            onPress={() => void confirm()}
            accessibilityHint="Danach bekommt die andere Person Ihre Anfrage zur Bestätigung."
          />
          <Button label="Abbrechen" variant="secondary" onPress={() => router.back()} />
        </ButtonStack>
      }
    >
      {error ? <Callout tone="danger" title="Es hat nicht geklappt">{error}</Callout> : null}

      {summary ? (
        <>
          <View style={{ gap: theme.spacing.m }}>
            {summary.lines.map((line) => (
              <View key={line.label} style={{ gap: theme.spacing.xs }}>
                <Text variant="label">{line.label}</Text>
                <Text muted>{line.value}</Text>
              </View>
            ))}
          </View>

          <Callout tone="info" title="In Leichter Sprache">
            {summary.easyText}
          </Callout>

          <Button
            label="Buchung vorlesen"
            variant="secondary"
            onPress={() => speak(summary.speechText)}
          />

          <WhatHappensNext text={summary.whatHappensNext} />

          <Button
            label={checked ? 'Ich habe alles gelesen ✓' : 'Ich habe alles gelesen'}
            variant={checked ? 'primary' : 'secondary'}
            onPress={() => setChecked((c) => !c)}
            accessibilityHint="Erst danach können Sie verbindlich buchen."
          />

          {requiresVisualConfirmation('booking.confirm') ? (
            <Text variant="caption" muted>
              Eine Buchung wird nie allein durch einen Sprachbefehl ausgelöst. Sie bestätigen immer
              hier auf dem Bildschirm.
            </Text>
          ) : null}

          {wartetAufFreigabe ? (
            <Callout tone="info" title="Eine Person muss noch zustimmen">
              {`${verantwortlich} muss diesen Termin freigeben. Wir haben Bescheid gesagt. Sie bekommen eine Nachricht, sobald es eine Antwort gibt. Sie können das Anliegen jederzeit zurückziehen.`}
            </Callout>
          ) : null}

          {booking?.confirmedBySeekerAt && booking.status === 'proposed' ? (
            <Callout tone="success" title="Ihre Bestätigung ist da">
              Jetzt fehlt noch die Bestätigung der anderen Person. Sie bekommen eine Nachricht,
              sobald der Termin fest steht.
            </Callout>
          ) : null}
        </>
      ) : (
        <Text muted>Wird vorbereitet …</Text>
      )}
    </Screen>
  );
}

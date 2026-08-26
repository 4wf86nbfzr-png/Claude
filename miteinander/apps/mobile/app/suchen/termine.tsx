import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  formatDateTimeGerman,
  formatDuration,
  formatEuro,
  type Booking,
  type CancellationOutcome,
} from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

const STATUS_TEXT: Record<string, string> = {
  proposed: 'Vorgeschlagen – noch nicht fest',
  confirmed: 'Fest gebucht',
  in_progress: 'Läuft gerade',
  completed: 'Abgeschlossen',
  cancelled_by_seeker: 'Von Ihnen abgesagt',
  cancelled_by_provider: 'Von der anderen Person abgesagt',
  no_show: 'Nicht erschienen',
  disputed: 'In Klärung',
};

/**
 * Screen 11: Termine und Erinnerungen.
 *
 * Vor jeder Absage wird ehrlich gesagt, ob und was sie kostet -- ohne
 * Drohgebaerde und ohne versteckte Kosten.
 */
export default function Appointments() {
  const theme = useTheme();
  const router = useRouter();
  const { data, service, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [preview, setPreview] = useState<Record<string, CancellationOutcome>>({});

  const reload = useCallback(async () => {
    setBookings(await data.bookings.forUser(currentUserId));
  }, [data, currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Screen
      title="Meine Termine"
      intro="Hier stehen alle Termine. Sie können jederzeit absagen."
      easyIntro="Hier sehen Sie Ihre Termine."
      onSpeak={speak}
    >
      {bookings.length === 0 ? <Text muted>Sie haben noch keine Termine.</Text> : null}

      {bookings.map((booking) => (
        <View
          key={booking.id}
          style={{
            gap: theme.spacing.s,
            padding: theme.spacing.l,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text variant="label">{STATUS_TEXT[booking.status] ?? booking.status}</Text>
          <Text variant="heading" accessibilityRole="header">
            {formatDateTimeGerman(booking.startsAt)}
          </Text>
          <Text muted>Dauer: {formatDuration(booking.durationMinutes)}</Text>
          <Text muted>Treffpunkt: {booking.meetingPointDescription}</Text>
          <Text muted>
            Kosten: {booking.volunteer ? 'ehrenamtlich, kostenlos' : formatEuro(booking.priceCents)}
          </Text>

          {booking.preciseAddressReleased ? (
            <Callout tone="info" title="Kontaktdaten freigegeben">
              Für diesen Termin sieht die andere Person Ihre Telefonnummer und Ihre Adresse. Nach
              dem Termin wird die Freigabe wieder beendet.
            </Callout>
          ) : null}

          {preview[booking.id] ? (
            <Callout tone="warning" title="Wenn Sie jetzt absagen">
              {prefs.easyLanguage
                ? preview[booking.id]!.easyExplanation
                : preview[booking.id]!.explanation}
            </Callout>
          ) : null}

          <View style={{ gap: theme.spacing.s }}>
            {booking.status === 'confirmed' || booking.status === 'proposed' ? (
              <>
                <Button
                  label="Was kostet eine Absage?"
                  variant="secondary"
                  onPress={() => {
                    void service.previewCancellation(booking.id).then((outcome) =>
                      setPreview((current) => ({ ...current, [booking.id]: outcome })),
                    );
                  }}
                />
                <Button
                  label="Termin absagen"
                  variant="danger"
                  onPress={() => {
                    void service
                      .cancelBooking(booking.id, currentUserId, 'Absage über die App')
                      .then(reload);
                  }}
                  accessibilityHint="Der Termin wird abgesagt. Die andere Person bekommt eine Nachricht."
                />
              </>
            ) : null}
            {booking.status === 'completed' ? (
              <Button
                label="Termin bewerten"
                onPress={() =>
                  router.push({ pathname: '/suchen/bewertung/[id]', params: { id: booking.id } })
                }
              />
            ) : null}
          </View>
        </View>
      ))}

      <Callout tone="info" title="Erinnerungen">
        Sie bekommen eine Erinnerung, wenn Sie das möchten. In der Vorschau auf dem Sperrbildschirm
        steht nie, worum es geht.
      </Callout>
    </Screen>
  );
}

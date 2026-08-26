import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatDateTimeGerman, isApprovalOverdue, type ApprovalRequest } from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';
import { Begleiter } from '../../src/components/Begleiter';

/**
 * Übersicht für verantwortliche Personen.
 *
 * Dieser Bereich darf umfangreicher sein als die Ansicht der Menschen, die
 * Unterstützung suchen -- wer Verantwortung trägt, braucht Überblick. Er
 * bleibt aber begrenzt auf das, wofür eine Berechtigung erteilt wurde, und
 * er ist nicht heimlich: die betroffene Person sieht in ihrer eigenen App,
 * wer was sehen darf und was noch offen ist.
 */
interface Klient {
  seekerId: string;
  name: string;
  stufe: 'begleitung' | 'verantwortung';
  freigabepflichten: string[];
  offeneFreigaben: number;
  naechsterTermin: { startsAt: string; meetingPointDescription: string } | undefined;
  offeneAnfragen: number;
}

export default function VerantwortlichUebersicht() {
  const theme = useTheme();
  const router = useRouter();
  const { service, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [klienten, setKlienten] = useState<Klient[]>([]);
  const [offen, setOffen] = useState<ApprovalRequest[]>([]);
  const [ueberfaellig, setUeberfaellig] = useState(0);

  const laden = useCallback(async () => {
    const uebersicht = await service.overviewForResponsible(currentUserId);
    setKlienten(uebersicht.klienten as Klient[]);
    setOffen(uebersicht.offeneFreigaben);
    setUeberfaellig(uebersicht.ueberfaellig);
  }, [service, currentUserId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  // Nach einer Entscheidung soll die Übersicht sofort stimmen.
  useFocusEffect(
    useCallback(() => {
      void laden();
    }, [laden]),
  );

  const jetzt = new Date().toISOString();

  return (
    <Screen
      title="Meine Verantwortung"
      intro="Hier sehen Sie, was ansteht, und geben frei, was vereinbart wurde."
      easyIntro="Hier sehen Sie: Was ist los?\nUnd: Wo müssen Sie Ja sagen?"
      onSpeak={speak}
      dgs={<Begleiter schluessel="verantwortlich" />}
    >
      <Callout tone="info" title="Die Person entscheidet mit">
        Ihre Übersicht ist kein heimlicher Einblick. Die Person sieht in ihrer eigenen App, was Sie
        sehen dürfen und welche Freigabe gerade bei Ihnen liegt.
      </Callout>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Offene Freigaben
        </Text>
        {offen.length === 0 ? (
          <Text muted>Gerade wartet nichts auf Sie.</Text>
        ) : (
          <>
            {ueberfaellig > 0 ? (
              <Callout tone="warning" title="Überfällig">
                {`${ueberfaellig} Freigabe${ueberfaellig === 1 ? '' : 'n'} wartet seit längerem. Solange Sie nicht antworten, passiert nichts – die Person wartet.`}
              </Callout>
            ) : null}
            {offen.map((freigabe) => (
              <View
                key={freigabe.id}
                style={{
                  gap: theme.spacing.s,
                  padding: theme.spacing.l,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: isApprovalOverdue(freigabe, jetzt)
                    ? theme.colors.warning
                    : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <Text variant="label">
                  {isApprovalOverdue(freigabe, jetzt) ? '! Überfällig' : '● Wartet auf Sie'}
                </Text>
                <Text>{prefs.easyLanguage ? freigabe.easySummary : freigabe.summary}</Text>
                <Text variant="caption" muted>
                  Antwort erbeten bis {formatDateTimeGerman(freigabe.respondBy)}
                </Text>
                <Button
                  label="Ansehen und entscheiden"
                  onPress={() =>
                    router.push({
                      pathname: '/verantwortlich/freigaben/[id]',
                      params: { id: freigabe.id },
                    })
                  }
                />
              </View>
            ))}
          </>
        )}
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Menschen, für die ich da bin
        </Text>
        {klienten.length === 0 ? (
          <Text muted>Sie sind noch für niemanden eingetragen.</Text>
        ) : null}
        {klienten.map((klient) => (
          <View
            key={klient.seekerId}
            style={{
              gap: theme.spacing.xs,
              padding: theme.spacing.l,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading" accessibilityRole="header">
              {klient.name}
            </Text>
            <Text variant="caption" muted>
              {klient.stufe === 'verantwortung'
                ? 'Sie tragen Verantwortung und geben frei.'
                : 'Sie begleiten beim Bedienen. Sie entscheiden nichts.'}
            </Text>
            {klient.freigabepflichten.length > 0 ? (
              <Text variant="caption" muted>
                Sie geben frei: {klient.freigabepflichten.join(', ')}
              </Text>
            ) : null}
            <Text muted>
              {klient.naechsterTermin
                ? `Nächster Termin: ${formatDateTimeGerman(klient.naechsterTermin.startsAt)}, ${klient.naechsterTermin.meetingPointDescription}`
                : 'Kein Termin geplant.'}
            </Text>
            <Text muted>
              {klient.offeneAnfragen === 0
                ? 'Keine offene Anfrage.'
                : `${klient.offeneAnfragen} offene Anfrage${klient.offeneAnfragen === 1 ? '' : 'n'}.`}
            </Text>
            {klient.offeneFreigaben > 0 ? (
              <Text variant="label" color={theme.colors.warning}>
                ! {klient.offeneFreigaben} Freigabe wartet auf Sie
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Button
        label="Eine Person neu einrichten"
        variant="secondary"
        onPress={() => router.push('/verantwortlich/einrichten')}
        accessibilityHint="Sie richten die App gemeinsam mit einer Person ein."
      />
    </Screen>
  );
}

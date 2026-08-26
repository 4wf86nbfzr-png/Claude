import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  formatDateTimeGerman,
  formatDuration,
  getCategory,
  type SupportRequest,
} from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';
import { DgsAbschnitt } from '../../src/components/DgsAbschnitt';

/**
 * Screen 15: Auftragsübersicht für Anbietende.
 *
 * Vor der Annahme sieht man nur, was fuer die Entscheidung noetig ist:
 * Taetigkeit, Zeit, ungefaehre Region. Kein Name, keine Adresse, keine
 * Gesundheitsangaben.
 */
export default function ProviderRequests() {
  const theme = useTheme();
  const router = useRouter();
  const { data, service, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [previews, setPreviews] = useState<Record<string, { regionLabel: string; categories: string[] }>>({});

  const reload = useCallback(async () => {
    const open = await data.requests.open();
    setRequests(open);
    const entries: Record<string, { regionLabel: string; categories: string[] }> = {};
    for (const request of open) {
      const preview = await service.requestPreviewForProvider(request.id);
      entries[request.id] = {
        regionLabel: preview.regionLabel,
        categories: preview.categoryLabels,
      };
    }
    setPreviews(entries);
  }, [data, service]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <Screen
      title="Passende Anfragen"
      intro="Sie sehen vor der Annahme nur, was für Ihre Entscheidung nötig ist."
      easyIntro="Hier sehen Sie: Wer braucht Hilfe?"
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="search.overview" />}
    >
      {requests.length === 0 ? <Text muted>Gerade gibt es keine offenen Anfragen.</Text> : null}

      {requests.map((request) => (
        <View
          key={request.id}
          style={{
            gap: theme.spacing.s,
            padding: theme.spacing.l,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          <Text variant="heading" accessibilityRole="header">
            {previews[request.id]?.categories.join(', ') ??
              request.categoryKeys.map((k) => getCategory(k)?.label ?? k).join(', ')}
          </Text>
          <Text muted>{formatDateTimeGerman(request.startsAt)}</Text>
          <Text muted>Dauer: {formatDuration(request.durationMinutes)}</Text>
          <Text muted>Region: {previews[request.id]?.regionLabel ?? '–'}</Text>
          {request.requiresLicensedProfessional ? (
            <Callout tone="warning" title="Nur für geprüfte Fachkräfte">
              Diese Anfrage enthält erlaubnispflichtige Tätigkeiten.
            </Callout>
          ) : null}

          <View style={{ gap: theme.spacing.s }}>
            <Button label="Annehmen und schreiben" onPress={() => router.push('/anbieten/auftraege')} />
            <Button label="Rückfrage stellen" variant="secondary" onPress={() => router.push('/anbieten/auftraege')} />
            <Button label="Nicht passend" variant="quiet" onPress={() => void reload()} />
          </View>
        </View>
      ))}

      <Callout tone="info" title="Nach der Annahme">
        Erst wenn beide Seiten den Termin bestätigt haben, sehen Sie Treffpunkt und Kontaktdaten.
        Nach dem Termin endet die Freigabe wieder.
      </Callout>
    </Screen>
  );
}

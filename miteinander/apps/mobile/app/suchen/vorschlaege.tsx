import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SuggestionView } from '@miteinander/core';
import {
  Avatar,
  Button,
  Callout,
  Screen,
  Text,
  VerificationBadge,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';
import { Begleiter } from '../../src/components/Begleiter';

/**
 * Screen 6: Vorschläge als grosse Karten.
 *
 * Zu jedem Vorschlag stehen die Gruende sichtbar dabei -- es gibt keine
 * geheime Rangfolge. Eine Kartenansicht gibt es zusaetzlich, die Liste ist
 * aber immer verfuegbar und gleichwertig.
 */
export default function Suggestions() {
  const theme = useTheme();
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const { service, prefs, activeRequestId } = useAppState();
  const { speak } = useReadAloud(prefs);

  const id = requestId ?? activeRequestId ?? '';
  const [suggestions, setSuggestions] = useState<SuggestionView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compare, setCompare] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (!id) return;
    service
      .suggestProviders(id)
      .then((result) => active && setSuggestions(result))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : 'Fehler'));
    return () => {
      active = false;
    };
  }, [id, service]);

  const toggleCompare = (providerId: string) =>
    setCompare((current) =>
      current.includes(providerId)
        ? current.filter((p) => p !== providerId)
        : current.length >= 3
          ? current
          : [...current, providerId],
    );

  return (
    <Screen
      title="Diese Menschen passen zu Ihnen"
      intro="Wir zeigen Ihnen, warum wir jede Person vorschlagen. Sie entscheiden."
      easyIntro="Diese Menschen können Ihnen helfen. Sie können auswählen."
      onSpeak={speak}
      dgs={<Begleiter schluessel="vorschlaege" />}
      footer={
        compare.length >= 2 ? (
          <Button
            label={`${compare.length} Vorschläge vergleichen`}
            onPress={() =>
              router.push({
                pathname: '/suchen/vergleich',
                params: { requestId: id, ids: compare.join(',') },
              })
            }
          />
        ) : null
      }
    >
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {suggestions === null && !error ? <Text muted>Wird geladen …</Text> : null}
      {suggestions?.length === 0 ? (
        <Callout tone="info" title="Noch niemand gefunden">
          Zu Ihrem Wunschtermin passt gerade niemand. Sie können den Termin ändern oder Ihre Anfrage
          offen lassen – wir melden uns, sobald jemand passt.
        </Callout>
      ) : null}

      {suggestions?.map((suggestion) => {
        const spoken = [
          suggestion.providerName,
          suggestion.headline,
          suggestion.priceLabel,
          suggestion.distanceLabel,
          ...(prefs.easyLanguage ? suggestion.easyReasons : suggestion.reasons),
        ].join('. ');

        return (
          <View
            key={suggestion.match.providerId}
            accessible={false}
            style={{
              gap: theme.spacing.m,
              padding: theme.spacing.l,
              borderRadius: 22,
              borderWidth: 2,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <View style={{ flexDirection: 'row', gap: theme.spacing.m, alignItems: 'center' }}>
              <Avatar name={suggestion.providerName} size={80} />
              <View style={{ flex: 1, gap: theme.spacing.xs }}>
                <Text variant="heading" accessibilityRole="header">
                  {suggestion.providerName}
                </Text>
                <Text muted>{suggestion.headline}</Text>
                <VerificationBadge kind={suggestion.kind as never} />
              </View>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label">{suggestion.priceLabel}</Text>
              <Text variant="caption" muted>
                {suggestion.distanceLabel}
              </Text>
            </View>

            <View style={{ gap: theme.spacing.xs }}>
              <Text variant="label">Warum wir diese Person vorschlagen</Text>
              {(prefs.easyLanguage ? suggestion.easyReasons : suggestion.reasons).map((reason) => (
                <Text key={reason} variant="caption" muted>
                  • {reason}
                </Text>
              ))}
            </View>

            {suggestion.match.needsManualReview ? (
              <Callout tone="warning" title="Wird noch geprüft">
                {suggestion.match.manualReviewReason ??
                  'Ihre Auswahl wird von einem Menschen geprüft, bevor sie berücksichtigt wird.'}
              </Callout>
            ) : null}

            <View style={{ gap: theme.spacing.s }}>
              <Button
                label="Profil ansehen"
                onPress={() =>
                  router.push({
                    pathname: '/suchen/person/[id]',
                    params: { id: suggestion.match.providerId, requestId: id },
                  })
                }
              />
              <Button
                label={
                  compare.includes(suggestion.match.providerId)
                    ? 'Aus dem Vergleich nehmen'
                    : 'Zum Vergleich hinzufügen'
                }
                variant="secondary"
                onPress={() => toggleCompare(suggestion.match.providerId)}
              />
              <Button label="Vorlesen" variant="quiet" onPress={() => speak(spoken)} />
            </View>
          </View>
        );
      })}

      <Callout tone="info" title="Karte oder Liste">
        Sie sehen hier die Liste. Eine Karte ist zusätzlich verfügbar – sie zeigt nur ungefähre
        Regionen, nie genaue Adressen.
      </Callout>
    </Screen>
  );
}

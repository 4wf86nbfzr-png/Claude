import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  describeVerification,
  expiringSoon,
  getQualification,
  type ProviderVerification,
} from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

/**
 * Screen 16: Nachweisprüfung aus Sicht der anbietenden Person.
 *
 * Jeder Nachweis hat einen klaren Status. Abgelaufene und bald ablaufende
 * Nachweise stehen oben -- ohne sie fallen Anfragen aus dem Matching.
 */
export default function ProviderVerifications() {
  const theme = useTheme();
  const { data, prefs, currentUserId } = useAppState();
  const { speak } = useReadAloud(prefs);
  const [items, setItems] = useState<ProviderVerification[]>([]);

  const providerId = currentUserId.startsWith('u_provider') ? currentUserId : 'u_provider_3';

  const reload = useCallback(async () => {
    setItems(await data.verifications.forProvider(providerId));
  }, [data, providerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const today = new Date().toISOString().slice(0, 10);
  const soon = expiringSoon(items, today, 30);

  return (
    <Screen
      title="Meine Nachweise"
      intro="Hier sehen Sie, was geprüft ist und was noch fehlt."
      onSpeak={speak}
    >
      {soon.length > 0 ? (
        <Callout tone="warning" title="Läuft bald ab">
          {`Diese Nachweise müssen Sie erneuern: ${soon
            .map((v) => getQualification(v.qualificationKey)?.label ?? v.qualificationKey)
            .join(', ')}. Ohne gültigen Nachweis erhalten Sie dazu keine Anfragen mehr.`}
        </Callout>
      ) : null}

      {items.map((item) => (
        <View
          key={item.id}
          style={{
            gap: theme.spacing.xs,
            padding: theme.spacing.m,
            borderRadius: 14,
            borderWidth: 2,
            borderColor:
              item.status === 'approved'
                ? theme.colors.success
                : item.status === 'rejected' || item.status === 'expired'
                  ? theme.colors.danger
                  : theme.colors.border,
            backgroundColor: theme.colors.surface,
          }}
        >
          {/* Symbol zusätzlich zur Farbe -- Status nie nur farblich. */}
          <Text variant="label">
            {item.status === 'approved'
              ? '✓ '
              : item.status === 'pending'
                ? '⏳ '
                : item.status === 'expired'
                  ? '⌛ '
                  : '✕ '}
            {describeVerification(item)}
          </Text>
          {item.rejectionReason ? <Text muted>Begründung: {item.rejectionReason}</Text> : null}
          {item.status !== 'approved' ? (
            <Button label="Nachweis hochladen" variant="secondary" onPress={() => void reload()} />
          ) : null}
        </View>
      ))}

      <Callout tone="info" title="Was Prüfung bedeutet">
        Wir prüfen genau das Dokument, das Sie hochladen. Eine Prüfung ist kein allgemeines Urteil
        über einen Menschen. Fachqualifikationen werden von zwei Personen geprüft.
      </Callout>
    </Screen>
  );
}

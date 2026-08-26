import React from 'react';
import { Linking, Pressable, View } from 'react-native';
import { appConfig, EMERGENCY_DISCLAIMER } from '@miteinander/core';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';
import { radius } from '../tokens/layout';

/**
 * Notfallhinweis.
 *
 * Die App ersetzt keinen Notruf. Der Hinweis steht auf jedem Bildschirm, auf
 * dem Menschen Hilfe suchen -- gut sichtbar, aber ohne Panikfarben und ohne
 * kuenstliche Dringlichkeit.
 */
export function EmergencyBar({ compact = false }: { compact?: boolean }) {
  const theme = useTheme();

  return (
    <View
      style={{
        backgroundColor: theme.colors.emergency,
        borderRadius: radius.s,
        padding: theme.spacing.m,
        gap: theme.spacing.s,
      }}
    >
      <Text variant="label" color={theme.colors.textOnEmergency}>
        {EMERGENCY_DISCLAIMER}
      </Text>
      {compact ? null : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
          {appConfig.emergencyNumbers.map((entry) => (
            <Pressable
              key={entry.number}
              onPress={() => {
                void Linking.openURL(`tel:${entry.number}`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${entry.label} anrufen`}
              accessibilityHint={entry.hint}
              style={{
                minHeight: theme.touchTarget,
                paddingHorizontal: theme.spacing.l,
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 2,
                borderColor: theme.colors.textOnEmergency,
              }}
            >
              <Text variant="label" color={theme.colors.textOnEmergency}>
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

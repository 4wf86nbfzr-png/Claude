import React from 'react';
import { View } from 'react-native';
import { PROVIDER_KIND_LABELS, type ProviderKind } from '@miteinander/core';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';
import { radius } from '../tokens/layout';

/**
 * Rollenkennzeichnung.
 *
 * Drei klar unterscheidbare Stufen. Kein Haekchen-Siegel, das mehr verspricht,
 * als geprueft wurde -- die konkreten Nachweise stehen darunter im Klartext.
 */
export function VerificationBadge({ kind }: { kind: ProviderKind }) {
  const theme = useTheme();
  const symbol = kind === 'professional' ? '★' : kind === 'qualified_companion' ? '◆' : '●';

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Rolle: ${PROVIDER_KIND_LABELS[kind]}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text variant="caption">{symbol}</Text>
      <Text variant="caption">{PROVIDER_KIND_LABELS[kind]}</Text>
    </View>
  );
}

/** Ein einzelner geprüfter Nachweis -- im Klartext, ohne Pauschalversprechen. */
export function VerifiedClaim({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: theme.spacing.s, alignItems: 'flex-start' }}>
      <Text variant="caption" color={theme.colors.success}>
        ✓
      </Text>
      <Text variant="caption" style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

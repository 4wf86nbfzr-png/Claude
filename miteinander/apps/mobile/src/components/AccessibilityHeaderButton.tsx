import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, useTheme } from '@miteinander/ui';

/**
 * Ständig erreichbare Schaltfläche für die Bedienhilfen.
 *
 * Sie sitzt in der Kopfzeile und nicht als schwebender Knopf über dem
 * Inhalt: ein Überlagern würde je nach Schriftgröße dauerhaft ein
 * Bedienelement verdecken (WCAG 2.4.11, Fokus nicht verdeckt). In der
 * Kopfzeile ist sie auf jedem Bildschirm sichtbar und in der
 * Fokusreihenfolge an einer vorhersehbaren Stelle.
 */
export function AccessibilityHeaderButton() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push('/bedienhilfen')}
      accessibilityRole="button"
      accessibilityLabel="Bedienhilfen öffnen"
      accessibilityHint="Hier stellen Sie Schrift, Farben, Vorlesen und Gebärdensprache ein."
      hitSlop={8}
      style={{
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.m,
        marginRight: theme.spacing.xs,
        borderRadius: 999,
        borderWidth: 2,
        borderColor: theme.colors.inputBorder,
      }}
    >
      <Text variant="label">Bedienung</Text>
    </Pressable>
  );
}

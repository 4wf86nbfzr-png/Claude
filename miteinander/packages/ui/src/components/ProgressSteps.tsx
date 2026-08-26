import React from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';

/**
 * Fortschrittsanzeige.
 *
 * Zeigt "Schritt x von y" als Text -- die Balken sind nur Ergaenzung. Ohne
 * Text waere der Fortschritt fuer Screenreader und bei Farbenblindheit
 * unlesbar.
 */
export function ProgressSteps({
  index,
  total,
  label,
}: {
  index: number;
  total: number;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index }}
      accessibilityLabel={`Schritt ${index} von ${total}${label ? `: ${label}` : ''}`}
      style={{ gap: theme.spacing.xs }}
    >
      <Text variant="caption" muted>
        Schritt {index} von {total}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }} accessibilityElementsHidden>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={{
              flex: 1,
              height: 8,
              borderRadius: 4,
              backgroundColor: i < index ? theme.colors.accent : theme.colors.surfaceRaised,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}

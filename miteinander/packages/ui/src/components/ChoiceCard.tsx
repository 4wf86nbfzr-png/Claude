import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text, Heading } from './Text';
import { SpeakButton } from './SpeakButton';
import { focusRing, radius } from '../tokens/layout';

export interface ChoiceCardProps {
  title: string;
  description: string;
  /** Text in Leichter Sprache. Wird im Einfach-Modus statt der Beschreibung gezeigt. */
  easyDescription?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onPress: () => void;
  onSpeak?: (text: string) => void;
  /** Steht ein geprueftes DGS-Video bereit? */
  signLanguageAvailable?: boolean;
  onOpenSignLanguage?: () => void;
  testID?: string;
}

/**
 * Grosse Auswahlkarte -- das zentrale Bedienelement beim ersten Start und im
 * Einfach-Modus.
 *
 * Auswahl wird nie allein durch Farbe angezeigt: es gibt zusaetzlich einen
 * dicken Rahmen, ein Haken-Symbol und den Zustand "selected" fuer den
 * Screenreader (WCAG 1.4.1).
 */
export function ChoiceCard({
  title,
  description,
  easyDescription,
  icon,
  selected = false,
  onPress,
  onSpeak,
  signLanguageAvailable,
  onOpenSignLanguage,
  testID,
}: ChoiceCardProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const body = theme.easyLanguage && easyDescription ? easyDescription : description;

  return (
    <View style={{ gap: theme.spacing.s }}>
      <Pressable
        testID={testID}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
        accessibilityState={{ selected }}
        style={({ pressed }) => [
          {
            minHeight: theme.touchTarget * 2,
            padding: theme.spacing.l,
            borderRadius: radius.l,
            backgroundColor: pressed ? theme.colors.surfaceRaised : theme.colors.surface,
            borderWidth: selected ? 4 : 2,
            borderColor: selected ? theme.colors.accent : theme.colors.border,
            gap: theme.spacing.s,
          },
          focused
            ? { borderColor: theme.colors.focus, borderWidth: focusRing.width + 1 }
            : null,
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.m }}>
          {icon}
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Heading level={3}>{title}</Heading>
            <Text muted>{body}</Text>
          </View>
          {/* Haken statt reiner Farbmarkierung. */}
          {selected ? (
            <Text variant="title" accessibilityElementsHidden importantForAccessibility="no">
              ✓
            </Text>
          ) : null}
        </View>
      </Pressable>

      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        {onSpeak ? (
          <SpeakButton text={`${title}. ${body}`} onSpeak={onSpeak} contentLabel={title} />
        ) : null}
        {signLanguageAvailable && onOpenSignLanguage ? (
          <Pressable
            onPress={onOpenSignLanguage}
            accessibilityRole="button"
            accessibilityLabel={`${title} in Gebärdensprache ansehen`}
            style={{
              minHeight: theme.touchTarget,
              paddingHorizontal: theme.spacing.m,
              borderRadius: radius.pill,
              borderWidth: 2,
              borderColor: theme.colors.inputBorder,
              justifyContent: 'center',
            }}
          >
            <Text variant="label">Gebärdensprache</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

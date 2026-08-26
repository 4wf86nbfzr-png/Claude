import React from 'react';
import { Pressable } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';
import { radius } from '../tokens/layout';

export interface SpeakButtonProps {
  /** Was vorgelesen werden soll. */
  text: string;
  onSpeak: (text: string) => void;
  isSpeaking?: boolean;
  onStop?: () => void;
  /** Kurzbeschreibung des Inhalts fuer das Screenreader-Label. */
  contentLabel?: string;
}

/**
 * Vorlesen-Schaltflaeche.
 *
 * Steht an jeder wichtigen Ueberschrift, Erklaerung und Zusammenfassung.
 * Laeuft ein Screenreader, blendet die App den Knopf nicht aus -- manche
 * Menschen nutzen beides -- aber der eigene Vorlesemodus schweigt dann
 * (siehe shouldSpeakInApp im Kern).
 */
export function SpeakButton({ text, onSpeak, isSpeaking, onStop, contentLabel }: SpeakButtonProps) {
  const theme = useTheme();
  const label = isSpeaking ? 'Vorlesen anhalten' : 'Vorlesen';
  return (
    <Pressable
      onPress={() => (isSpeaking && onStop ? onStop() : onSpeak(text))}
      accessibilityRole="button"
      accessibilityLabel={contentLabel ? `${label}: ${contentLabel}` : label}
      accessibilityState={{ busy: isSpeaking }}
      style={{
        minHeight: theme.touchTarget,
        minWidth: theme.touchTarget,
        paddingHorizontal: theme.spacing.m,
        borderRadius: radius.pill,
        borderWidth: 2,
        borderColor: theme.colors.inputBorder,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.s,
      }}
    >
      <Text variant="label" aria-hidden>
        {isSpeaking ? '⏸' : '🔊'}
      </Text>
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

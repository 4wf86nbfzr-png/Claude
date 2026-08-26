import React from 'react';
import { ScrollView, View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Heading, Text } from './Text';
import { SpeakButton } from './SpeakButton';
import { breakpoints } from '../tokens/layout';

export interface ScreenProps {
  title: string;
  /** Kurze Erklaerung unter der Ueberschrift. */
  intro?: string;
  easyIntro?: string;
  onSpeak?: (text: string) => void;
  /** Feststehender Bereich am unteren Rand, z. B. "Weiter". */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Grundgeruest jedes Bildschirms.
 *
 * - Genau eine Hauptueberschrift, die den Fokus beim Wechsel erhaelt.
 * - Inhalt scrollt immer, damit bei grosser Schrift nichts abgeschnitten wird
 *   (WCAG 1.4.10 Reflow).
 * - Der Vorlesen-Knopf liest Ueberschrift und Einleitung.
 */
export function Screen({ title, intro, easyIntro, onSpeak, footer, children }: ScreenProps) {
  const theme = useTheme();
  const introText = theme.easyLanguage && easyIntro ? easyIntro : intro;
  const spoken = [title, introText].filter(Boolean).join('. ');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.l,
          // Platz fuer die schwebende Bedienhilfen-Schaltflaeche: sonst
          // verdeckt sie dauerhaft das letzte Bedienelement
          // (WCAG 2.4.11 Fokus nicht verdeckt).
          paddingBottom: theme.spacing.xxxl * 2,
          gap: theme.spacing.l,
          maxWidth: breakpoints.wide,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: theme.spacing.s }}>
          <Heading level={1} accessible accessibilityRole="header">
            {title}
          </Heading>
          {introText ? <Text muted>{introText}</Text> : null}
          {onSpeak ? <SpeakButton text={spoken} onSpeak={onSpeak} contentLabel={title} /> : null}
        </View>
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            padding: theme.spacing.l,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            gap: theme.spacing.m,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

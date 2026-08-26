import React from 'react';
import { View } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text, Heading } from './Text';
import { radius } from '../tokens/layout';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const SYMBOLS: Record<CalloutTone, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '!',
  danger: '⚠',
};

const WORDS: Record<CalloutTone, string> = {
  info: 'Hinweis',
  success: 'Geschafft',
  warning: 'Achtung',
  danger: 'Fehler',
};

/**
 * Hinweisblock.
 *
 * Die Bedeutung steckt in Symbol UND Wort, nie nur in der Farbe (WCAG 1.4.1).
 * Fehler werden dem Screenreader aktiv angesagt.
 */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const color =
    tone === 'danger'
      ? theme.colors.danger
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'success'
          ? theme.colors.success
          : theme.colors.text;

  return (
    <View
      accessibilityLiveRegion={tone === 'danger' ? 'assertive' : 'polite'}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{
        borderLeftWidth: 6,
        borderLeftColor: color,
        borderWidth: 2,
        borderColor: theme.colors.border,
        borderRadius: radius.s,
        padding: theme.spacing.m,
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Text variant="label" color={color}>
        {SYMBOLS[tone]} {title ?? WORDS[tone]}
      </Text>
      {typeof children === 'string' ? <Text>{children}</Text> : children}
    </View>
  );
}

/**
 * "Was passiert jetzt?" -- steht an jeder Stelle, an der Menschen eine
 * Entscheidung treffen sollen.
 */
export function WhatHappensNext({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Heading level={3}>Was passiert jetzt?</Heading>
      <Text muted>{text}</Text>
    </View>
  );
}

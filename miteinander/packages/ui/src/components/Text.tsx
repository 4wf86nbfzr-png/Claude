import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import type { TypeToken } from '../tokens/typography';
import { useTheme } from './ThemeProvider';

export interface TextProps extends RNTextProps {
  variant?: TypeToken;
  /** Nachgeordneter Text -- weiterhin kontraststark genug fuer AA. */
  muted?: boolean;
  color?: string;
  center?: boolean;
  children: React.ReactNode;
}

/**
 * Basistext.
 *
 * `allowFontScaling` bleibt bewusst aktiv: die Systemschriftgroesse muss
 * durchschlagen. Zeilenhoehen kommen aus dem Theme und wachsen mit, damit
 * nichts abgeschnitten wird (WCAG 1.4.4 und 1.4.12).
 */
export function Text({ variant = 'body', muted, color, center, style, ...rest }: TextProps) {
  const theme = useTheme();
  const type = theme.type(variant);
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={2.5}
      style={[
        type,
        { color: color ?? (muted ? theme.colors.textMuted : theme.colors.text) },
        center ? { textAlign: 'center' } : null,
        style,
      ]}
      {...rest}
    />
  );
}

/**
 * Ueberschrift mit korrekter Rolle fuer Screenreader.
 * `level` steuert nur die Groesse -- die Rolle ist immer "header".
 */
export function Heading({
  level = 2,
  children,
  ...rest
}: Omit<TextProps, 'variant'> & { level?: 1 | 2 | 3 }) {
  const variant: TypeToken = level === 1 ? 'display' : level === 2 ? 'title' : 'heading';
  return (
    <Text
      variant={variant}
      accessibilityRole="header"
      // Kurze Ueberschriften duerfen nicht abgeschnitten werden.
      numberOfLines={undefined}
      {...rest}
    >
      {children}
    </Text>
  );
}

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';
import { focusRing, radius } from '../tokens/layout';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Ergaenzt das Label fuer Screenreader, wenn der sichtbare Text zu knapp ist. */
  accessibilityHint?: string;
  disabled?: boolean;
  busy?: boolean;
  /** Symbol links vom Text. Nie alleiniger Bedeutungstraeger. */
  icon?: React.ReactNode;
  fullWidth?: boolean;
  testID?: string;
}

/**
 * Schaltflaeche.
 *
 * - Mindestens die im Theme hinterlegte Tippflaeche (48 dp, im Einfach-Modus 72 dp).
 * - Sichtbarer Fokusring bei Tastatur- und Switch-Bedienung (WCAG 2.4.7, 2.4.11).
 * - Zustand "disabled" und "busy" werden dem Screenreader gemeldet, nicht nur
 *   farblich angedeutet.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  accessibilityHint,
  disabled = false,
  busy = false,
  icon,
  fullWidth = true,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const base: ViewStyle = {
    minHeight: theme.touchTarget,
    minWidth: theme.touchTarget,
    paddingHorizontal: theme.spacing.l,
    paddingVertical: theme.spacing.s,
    borderRadius: radius.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.s,
    alignSelf: fullWidth ? 'stretch' : 'flex-start',
    borderWidth: 2,
  };

  const colors = (pressed: boolean) => {
    switch (variant) {
      case 'primary':
        return {
          backgroundColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
          borderColor: pressed ? theme.colors.accentPressed : theme.colors.accent,
          textColor: theme.colors.textOnAccent,
        };
      case 'secondary':
        return {
          backgroundColor: pressed ? theme.colors.surfaceRaised : 'transparent',
          borderColor: theme.colors.inputBorder,
          textColor: theme.colors.text,
        };
      case 'danger':
        return {
          backgroundColor: pressed ? theme.colors.surfaceRaised : 'transparent',
          borderColor: theme.colors.danger,
          textColor: theme.colors.danger,
        };
      case 'quiet':
      default:
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textColor: theme.colors.text,
        };
    }
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || busy}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => {
        const c = colors(pressed);
        return [
          base,
          {
            backgroundColor: c.backgroundColor,
            borderColor: c.borderColor,
            opacity: disabled ? 0.5 : 1,
          },
          focused
            ? {
                // Der Ring liegt aussen, damit er auf jedem Untergrund sichtbar ist.
                borderColor: theme.colors.focus,
                borderWidth: focusRing.width,
              }
            : null,
        ];
      }}
    >
      {({ pressed }: { pressed: boolean }) => {
        const c = colors(pressed);
        return (
          <>
            {busy ? <ActivityIndicator color={c.textColor} /> : icon}
            <Text variant="label" color={c.textColor} center>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

/** Abstand zwischen gestapelten Schaltflaechen -- verhindert Fehlgriffe. */
export function ButtonStack({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={{ gap: theme.spacing.m }}>{children}</View>;
}

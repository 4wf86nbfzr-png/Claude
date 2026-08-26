import React, { useId, useState } from 'react';
import { TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Text } from './Text';
import { focusRing, radius } from '../tokens/layout';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Erklaerung unter der Beschriftung. Nie als Platzhalter im Feld. */
  hint?: string;
  /** Fehlermeldung -- steht direkt am Feld und erklaert die Korrektur. */
  error?: { message: string; howToFix: string };
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoComplete?: 'name' | 'tel' | 'email' | 'postal-code' | 'off';
  required?: boolean;
  testID?: string;
}

/**
 * Eingabefeld.
 *
 * - Beschriftung steht ueber dem Feld und bleibt sichtbar (kein Platzhalter
 *   als Ersatz, WCAG 3.3.2).
 * - Fehler stehen am Feld, nicht als Sammelmeldung, und nennen den Weg zur
 *   Korrektur (WCAG 3.3.1 und 3.3.3).
 * - `autoComplete` erlaubt das Ausfuellen durch das System (WCAG 1.3.5).
 */
export function TextField({
  label,
  value,
  onChangeText,
  hint,
  error,
  multiline,
  keyboardType,
  autoComplete = 'off',
  required,
  testID,
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const hintId = useId();

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.focus
      : theme.colors.inputBorder;

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="label" nativeID={`${hintId}-label`}>
        {label}
        {required ? ' (Pflichtfeld)' : ''}
      </Text>
      {hint ? (
        <Text variant="caption" muted nativeID={`${hintId}-hint`}>
          {hint}
        </Text>
      ) : null}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        multiline={multiline}
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        allowFontScaling
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-labelledby={`${hintId}-label`}
        aria-invalid={!!error}
        aria-required={required}
        style={{
          minHeight: multiline ? theme.touchTarget * 2 : theme.touchTarget,
          borderWidth: focused ? focusRing.width : 2,
          borderColor,
          borderRadius: radius.s,
          paddingHorizontal: theme.spacing.m,
          paddingVertical: theme.spacing.s,
          color: theme.colors.text,
          backgroundColor: theme.colors.background,
          ...theme.type('body'),
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
      {error ? (
        // "assertive": ein Fehler darf die aktuelle Ansage unterbrechen.
        <View accessibilityLiveRegion="assertive" style={{ gap: theme.spacing.xs }}>
          <Text variant="caption" color={theme.colors.danger}>
            {/* Symbol zusaetzlich zur Farbe. */}
            {'⚠ '}
            {error.message}
          </Text>
          <Text variant="caption" muted>
            {error.howToFix}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

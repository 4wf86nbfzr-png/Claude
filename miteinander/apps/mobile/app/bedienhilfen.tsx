import React from 'react';
import { Switch, View } from 'react-native';
import {
  MAX_FONT_SCALE,
  MIN_TOUCH_TARGET_DP,
  MODE_DEFAULTS,
  type UiMode,
} from '@miteinander/core';
import { Button, Callout, ChoiceCard, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';

/**
 * Screen 2 und 18: Bedienhilfen einrichten / Barrierefreiheitscenter.
 *
 * Von jedem Bildschirm aus erreichbar. Jede Aenderung wirkt sofort und
 * sichtbar -- niemand soll erst "Speichern" suchen muessen.
 */
const MODES: Array<{ key: UiMode; title: string; description: string; easy: string }> = [
  {
    key: 'einfach',
    title: 'Einfach',
    description: 'Sehr große Schaltflächen, ein Schritt pro Seite, Leichte Sprache und Vorlesen.',
    easy: 'Sehr große Knöpfe. Wenig Text auf einer Seite.',
  },
  {
    key: 'standard',
    title: 'Standard',
    description: 'Übersichtlich und vollständig.',
    easy: 'Sie sehen alles auf einen Blick.',
  },
  {
    key: 'individuell',
    title: 'Individuell',
    description: 'Sie stellen Schrift, Kontrast, Bewegung, Vorlesen und Gebärdensprache selbst ein.',
    easy: 'Sie bestimmen selbst: Schrift, Farben, Vorlesen.',
  },
];

export default function AccessibilityCenter() {
  const theme = useTheme();
  const { prefs, rawPrefs, setUiMode, updatePrefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const row = (
    label: string,
    hint: string,
    value: boolean,
    onChange: (v: boolean) => void,
  ) => (
    <View
      key={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.m,
        minHeight: theme.touchTarget,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="label">{label}</Text>
        <Text variant="caption" muted>
          {hint}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={label}
        accessibilityHint={hint}
        trackColor={{ true: theme.colors.accent, false: theme.colors.border }}
      />
    </View>
  );

  return (
    <Screen
      title="Bedienhilfen"
      intro="Stellen Sie hier ein, wie die App für Sie aussehen und sprechen soll. Änderungen wirken sofort."
      easyIntro="Hier stellen Sie die App ein. Zum Beispiel: große Schrift."
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="onboarding.accessibility" />}
    >
      <Text variant="heading" accessibilityRole="header">
        Bedienmodus
      </Text>
      <View style={{ gap: theme.spacing.m }}>
        {MODES.map((mode) => (
          <ChoiceCard
            key={mode.key}
            testID={`mode-${mode.key}`}
            title={mode.title}
            description={mode.description}
            easyDescription={mode.easy}
            selected={rawPrefs.uiMode === mode.key}
            onPress={() => setUiMode(mode.key)}
            onSpeak={speak}
          />
        ))}
      </View>
      <Callout tone="info" title="Sie verlieren nichts">
        Sie können den Modus jederzeit wechseln. Ihre Angaben bleiben erhalten.
      </Callout>

      <Text variant="heading" accessibilityRole="header">
        Schrift und Darstellung
      </Text>
      <View style={{ gap: theme.spacing.s }}>
        <Text variant="label">Schriftgröße: {Math.round(rawPrefs.fontScale * 100)} Prozent</Text>
        <View style={{ flexDirection: 'row', gap: theme.spacing.m }}>
          <Button
            label="Kleiner"
            variant="secondary"
            fullWidth={false}
            onPress={() => updatePrefs({ fontScale: rawPrefs.fontScale - 0.15 })}
            accessibilityHint="Verkleinert die Schrift in der ganzen App."
          />
          <Button
            label="Größer"
            variant="secondary"
            fullWidth={false}
            onPress={() => updatePrefs({ fontScale: Math.min(MAX_FONT_SCALE, rawPrefs.fontScale + 0.15) })}
            accessibilityHint="Vergrößert die Schrift in der ganzen App."
          />
        </View>
        <Text variant="caption" muted>
          Die Systemeinstellung Ihres Geräts wird zusätzlich berücksichtigt.
        </Text>
      </View>

      <View style={{ gap: theme.spacing.m }}>
        {row(
          'Hoher Kontrast',
          'Sehr starke Farbunterschiede. Hilft bei geringem Sehvermögen.',
          rawPrefs.highContrast,
          (v) => updatePrefs({ highContrast: v }),
        )}
        {row(
          'Bewegung reduzieren',
          'Keine Übergänge und keine Animationen.',
          prefs.reduceMotion,
          (v) => updatePrefs({ reduceMotion: v }),
        )}
        {row(
          'Vorlesen',
          'Die App liest Überschriften und Erklärungen vor.',
          rawPrefs.readAloud,
          (v) => updatePrefs({ readAloud: v }),
        )}
        {row(
          'Leichte Sprache',
          'Kurze Sätze und einfache Wörter.',
          rawPrefs.easyLanguage,
          (v) => updatePrefs({ easyLanguage: v }),
        )}
        {row(
          'Gebärdensprache anzeigen',
          'Zeigt Videos in Deutscher Gebärdensprache, sobald sie geprüft vorliegen.',
          rawPrefs.signLanguage,
          (v) => updatePrefs({ signLanguage: v }),
        )}
        {row(
          'Untertitel',
          'Untertitel bei allen Videos.',
          rawPrefs.captions,
          (v) => updatePrefs({ captions: v }),
        )}
        {row('Vibration', 'Kurzes Vibrieren als Rückmeldung.', rawPrefs.haptics, (v) =>
          updatePrefs({ haptics: v }),
        )}
      </View>

      <Text variant="heading" accessibilityRole="header">
        Größe der Schaltflächen
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.m, flexWrap: 'wrap' }}>
        {[MIN_TOUCH_TARGET_DP, 56, 72, 88].map((size) => (
          <Button
            key={size}
            label={`${size} Punkt`}
            variant={rawPrefs.touchTargetSize === size ? 'primary' : 'secondary'}
            fullWidth={false}
            onPress={() => updatePrefs({ touchTargetSize: size })}
          />
        ))}
      </View>

      <Callout tone="info" title="Screenreader">
        {prefs.suppressInAppReadAloud
          ? 'Auf Ihrem Gerät läuft ein Screenreader. Der eigene Vorlesemodus der App bleibt deshalb still, damit nicht zwei Stimmen gleichzeitig sprechen.'
          : 'VoiceOver und TalkBack werden vollständig unterstützt. Die App erkennt automatisch, wenn ein Screenreader läuft.'}
      </Callout>

      <Text variant="caption" muted>
        Voreinstellung im Einfach-Modus: Schaltflächen ab {MODE_DEFAULTS.einfach.touchTargetSize} Punkt,
        Schrift {Math.round(MODE_DEFAULTS.einfach.fontScale * 100)} Prozent.
      </Text>
    </Screen>
  );
}

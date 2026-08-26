import React, { useState } from 'react';
import { View } from 'react-native';
import {
  DGS_PRODUCTION_REQUIREMENTS,
  REPORT_CATEGORY_LABELS,
  appConfig,
  exampleCommands,
  type Report,
} from '@miteinander/core';
import {
  Button,
  Callout,
  ChoiceCard,
  DgsVideo,
  EmergencyBar,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';

/**
 * Screen 20: Hilfe, Notfall und Beschwerde.
 *
 * Alles an einem Ort und von jedem Bildschirm erreichbar. Der Notruf steht
 * oben, weil er im Ernstfall zuerst gebraucht wird.
 */
export default function HelpScreen() {
  const theme = useTheme();
  const { prefs, dgs, service, currentUserId } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [category, setCategory] = useState<Report['category'] | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const coverage = dgs.coverage();

  const send = async () => {
    if (!category) return;
    const result = await service.reportProblem({
      reporterId: currentUserId,
      category,
      description: text,
    });
    setSent(
      `Ihre Meldung ist angekommen. Wir melden uns innerhalb von ${result.responseTargetHours} Stunden.`,
    );
    setText('');
    setCategory(null);
  };

  return (
    <Screen
      title="Hilfe"
      intro="Hier finden Sie Antworten, können ein Problem melden und sehen die Notrufnummern."
      easyIntro="Hier bekommen Sie Hilfe."
      onSpeak={speak}
    >
      <EmergencyBar />

      <Text variant="heading" accessibilityRole="header">
        Was Sie sagen können
      </Text>
      <Text muted>
        Wenn Sie die Spracheingabe nutzen, versteht die App diese Befehle:
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        {exampleCommands().map((command) => (
          <Text key={command} variant="label">
            „{command}“
          </Text>
        ))}
      </View>
      <Callout tone="info" title="Sicherheitsregel">
        Geld, Buchungen, Freigaben und Löschungen lösen wir nie allein auf Zuruf aus. Dafür
        bestätigen Sie immer zusätzlich auf dem Bildschirm.
      </Callout>

      <Text variant="heading" accessibilityRole="header">
        Ein Problem melden
      </Text>
      {sent ? (
        <Callout tone="success" title="Angekommen">
          {sent}
        </Callout>
      ) : null}
      {REPORT_CATEGORY_LABELS.map((item) => (
        <ChoiceCard
          key={item.key}
          title={item.label}
          description={item.easy}
          selected={category === item.key}
          onPress={() => setCategory(category === item.key ? null : item.key)}
          onSpeak={speak}
        />
      ))}
      {category ? (
        <>
          <TextField
            label="Was ist passiert?"
            hint="Ein paar Sätze genügen. Sie müssen nichts erklären, was Ihnen schwerfällt."
            value={text}
            onChangeText={setText}
            multiline
          />
          <Button label="Meldung absenden" onPress={() => void send()} />
        </>
      ) : null}

      <Text variant="heading" accessibilityRole="header">
        Barrierefreiheit
      </Text>
      <Text muted>
        Diese App wird nach WCAG 2.2 Stufe AA entwickelt. Maßgeblich sind außerdem EN 301 549 sowie
        das Barrierefreiheitsstärkungsgesetz und die zugehörige Verordnung.
      </Text>
      <Callout tone="warning" title="Ehrlicher Stand">
        {`Gebärdensprach-Videos: ${coverage.approved} von ${coverage.total} Kernabläufen sind fachlich geprüft. Die Texte in Leichter Sprache sind Entwürfe und noch nicht von einer Prüfgruppe freigegeben. Wir behaupten nicht, dass die Übersetzung vollständig ist.`}
      </Callout>
      <Text muted>
        Wenn Sie eine Barriere finden, schreiben Sie uns an {appConfig.accessibilityFeedbackEmail}.
        Wir antworten und sagen Ihnen, was wir tun.
      </Text>

      {prefs.signLanguage ? <DgsVideo item={dgs.get('help.overview')} /> : null}

      <Text variant="heading" accessibilityRole="header">
        So werden unsere Gebärdensprach-Videos gemacht
      </Text>
      {DGS_PRODUCTION_REQUIREMENTS.map((item) => (
        <Text key={item} muted>
          • {item}
        </Text>
      ))}
    </Screen>
  );
}

import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { REPORT_CATEGORY_LABELS, type Report } from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../../src/state/app-state';
import { useReadAloud } from '../../../src/state/speech';

/**
 * Screen 12: Bewertung und Problemmeldung.
 *
 * Drei sehr einfache Stufen mit Symbol UND Wort. Die private Rueckmeldung an
 * das Sicherheitsteam ist deutlich von der oeffentlichen Bewertung getrennt.
 */
const RATINGS: Array<{ value: 1 | 2 | 3; symbol: string; label: string; easy: string }> = [
  { value: 3, symbol: '😊', label: 'War gut', easy: 'Es war schön.' },
  { value: 2, symbol: '😐', label: 'Ging so', easy: 'Es war in Ordnung.' },
  { value: 1, symbol: '☹️', label: 'Ging gar nicht', easy: 'Es war nicht gut.' },
];

export default function ReviewScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { service, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [rating, setRating] = useState<1 | 2 | 3 | null>(null);
  const [publicComment, setPublicComment] = useState('');
  const [privateFeedback, setPrivateFeedback] = useState('');
  const [reportCategory, setReportCategory] = useState<Report['category'] | null>(null);
  const [reportText, setReportText] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    try {
      if (rating) {
        await service.submitReview({
          bookingId: id,
          authorId: currentUserId,
          rating,
          publicComment: publicComment.trim() || undefined,
          privateFeedback: privateFeedback.trim() || undefined,
        });
      }
      if (reportCategory) {
        const result = await service.reportProblem({
          reporterId: currentUserId,
          category: reportCategory,
          description: reportText,
          bookingId: id,
        });
        setDone(
          `Ihre Meldung ist angekommen. Wir melden uns innerhalb von ${result.responseTargetHours} Stunden bei Ihnen.`,
        );
      } else {
        setDone('Vielen Dank für Ihre Rückmeldung.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Es hat nicht geklappt.');
    }
  };

  if (done) {
    return (
      <Screen title="Danke" onSpeak={speak}>
        <Callout tone="success" title="Angekommen">
          {done}
        </Callout>
        <Button label="Zu meinen Terminen" onPress={() => router.push('/suchen/termine')} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Wie war der Termin?"
      intro="Ihre Rückmeldung hilft anderen Menschen."
      easyIntro="Wie war es? Bitte tippen Sie auf ein Bild."
      onSpeak={speak}
      footer={
        <ButtonStack>
          <Button label="Absenden" onPress={() => void submit()} disabled={!rating && !reportCategory} />
          <Button label="Später" variant="quiet" onPress={() => router.back()} />
        </ButtonStack>
      }
    >
      <View style={{ gap: theme.spacing.m }}>
        {RATINGS.map((item) => (
          <ChoiceCard
            key={item.value}
            title={`${item.symbol} ${item.label}`}
            description={item.easy}
            selected={rating === item.value}
            onPress={() => setRating(item.value)}
            onSpeak={speak}
          />
        ))}
      </View>

      <TextField
        label="Möchten Sie etwas dazu schreiben?"
        hint="Dieser Text ist öffentlich sichtbar."
        value={publicComment}
        onChangeText={setPublicComment}
        multiline
      />

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Nur für unser Sicherheitsteam
        </Text>
        <Text variant="caption" muted>
          Dieser Text ist nicht öffentlich. Die andere Person sieht ihn nicht.
        </Text>
        <TextField
          label="Vertrauliche Rückmeldung"
          value={privateFeedback}
          onChangeText={setPrivateFeedback}
          multiline
        />
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Ist etwas passiert?
        </Text>
        {REPORT_CATEGORY_LABELS.map((item) => (
          <ChoiceCard
            key={item.key}
            title={item.label}
            description={item.easy}
            selected={reportCategory === item.key}
            onPress={() => setReportCategory(reportCategory === item.key ? null : item.key)}
          />
        ))}
        {reportCategory ? (
          <TextField
            label="Was ist passiert?"
            hint="Sie müssen nicht alles aufschreiben. Ein paar Sätze genügen."
            value={reportText}
            onChangeText={setReportText}
            multiline
          />
        ) : null}
      </View>

      {error ? <Callout tone="danger">{error}</Callout> : null}
    </Screen>
  );
}

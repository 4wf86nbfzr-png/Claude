import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import {
  COMMUNICATION_MODE_LABELS,
  COMMUNICATION_MODES,
  SERVICE_CATEGORIES,
  selectableCategories,
  type CommunicationMode,
} from '@miteinander/core';
import {
  Avatar,
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  Screen,
  Text,
  TextField,
  VerificationBadge,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';
import { DgsAbschnitt } from '../../src/components/DgsAbschnitt';

/**
 * Screen 14: Leistungs- und Verfügbarkeitseditor.
 *
 * Was jemand ausdruecklich NICHT leistet, ist ein Pflichtfeld. Die Vorschau
 * zeigt exakt, wie das Profil bei suchenden Menschen ankommt.
 */
export default function ServiceEditor() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [canDoProfessional] = useState(false);
  const [categories, setCategories] = useState<string[]>(['begleitung_termine']);
  const [notOffered, setNotOffered] = useState('Keine pflegerischen Tätigkeiten');
  const [modes, setModes] = useState<CommunicationMode[]>(['sprechen']);
  const [volunteer, setVolunteer] = useState(false);
  const [rate, setRate] = useState('22,00');
  const [radius, setRadius] = useState('10');
  const [headline, setHeadline] = useState('');
  const [preview, setPreview] = useState(false);

  const available = selectableCategories(canDoProfessional);
  const hidden = SERVICE_CATEGORIES.filter((c) => !available.includes(c));

  if (preview) {
    return (
      <Screen
        title="So sehen andere Ihr Profil"
        intro="Genau das sehen Menschen, die Unterstützung suchen."
        easyIntro="Hier sagen Sie: Wobei kann ich helfen?\nUnd: Was mache ich nicht?"
        onSpeak={speak}
        dgs={<DgsAbschnitt schluessel="profile.create" />}
        footer={<Button label="Zurück zum Bearbeiten" onPress={() => setPreview(false)} />}
      >
        <View style={{ flexDirection: 'row', gap: theme.spacing.m, alignItems: 'center' }}>
          <Avatar name={headline || 'Ihr Profil'} size={80} />
          <View style={{ flex: 1, gap: theme.spacing.xs }}>
            <Text variant="heading">{headline || 'Noch keine Überschrift'}</Text>
            <VerificationBadge kind="private_helper" />
          </View>
        </View>
        <Text variant="label">
          {volunteer ? 'ehrenamtlich, kostenlos' : `${rate} Euro pro Stunde`}
        </Text>
        <Text variant="label">Ich biete an</Text>
        {categories.map((key) => (
          <Text key={key} muted>
            • {SERVICE_CATEGORIES.find((c) => c.key === key)?.label ?? key}
          </Text>
        ))}
        <Text variant="label">Das mache ich ausdrücklich nicht</Text>
        <Text muted>{notOffered || 'Bitte ausfüllen'}</Text>
        <Callout tone="info" title="Rolle noch nicht bestätigt">
          Solange Ihre Nachweise nicht geprüft sind, erscheinen Sie als private
          Unterstützungsperson.
        </Callout>
      </Screen>
    );
  }

  return (
    <Screen
      title="Was Sie anbieten"
      intro="Sagen Sie genau, was Sie leisten – und was nicht. Das schützt Sie und die Menschen, die Sie unterstützen."
      onSpeak={speak}
      footer={
        <ButtonStack>
          <Button label="Vorschau ansehen" onPress={() => setPreview(true)} />
          <Button
            label="Zu meinem Planer"
            variant="secondary"
            onPress={() => router.push('/anbieten/planer')}
          />
        </ButtonStack>
      }
    >
      <TextField
        label="Kurze Überschrift für Ihr Profil"
        hint="Zum Beispiel: Alltagsbegleiter, gebärdensprachkompetent"
        value={headline}
        onChangeText={setHeadline}
        required
      />

      <Text variant="heading" accessibilityRole="header">
        Diese Unterstützung biete ich an
      </Text>
      <View style={{ gap: theme.spacing.m }}>
        {available.map((category) => {
          const selected = categories.includes(category.key);
          return (
            <ChoiceCard
              key={category.key}
              title={category.label}
              description={category.easyLabel}
              selected={selected}
              onPress={() =>
                setCategories((current) =>
                  selected ? current.filter((k) => k !== category.key) : [...current, category.key],
                )
              }
            />
          );
        })}
      </View>

      {hidden.length > 0 ? (
        <Callout tone="info" title="Nur mit geprüftem Nachweis">
          {`Diese Bereiche können Sie erst anbieten, wenn Ihre Fachqualifikation geprüft ist: ${hidden
            .map((c) => c.label)
            .join(', ')}.`}
        </Callout>
      ) : null}

      <TextField
        label="Das mache ich ausdrücklich nicht"
        hint="Pflichtfeld. Zum Beispiel: kein Heben und Tragen, keine Fahrten mit dem eigenen Auto."
        value={notOffered}
        onChangeText={setNotOffered}
        multiline
        required
      />

      <Text variant="heading" accessibilityRole="header">
        Wie ich mich verständige
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        {COMMUNICATION_MODES.map((mode) => {
          const selected = modes.includes(mode);
          return (
            <Button
              key={mode}
              label={selected ? `${COMMUNICATION_MODE_LABELS[mode]} ✓` : COMMUNICATION_MODE_LABELS[mode]}
              variant={selected ? 'primary' : 'secondary'}
              fullWidth={false}
              onPress={() =>
                setModes((current) =>
                  selected ? current.filter((m) => m !== mode) : [...current, mode],
                )
              }
            />
          );
        })}
      </View>
      {modes.includes('dgs') ? (
        <Callout tone="warning" title="Angabe wird gekennzeichnet">
          Gebärdensprache erscheint im Profil als Ihre eigene Angabe. Erst mit einem geprüften
          Nachweis wird sie als bestätigt angezeigt.
        </Callout>
      ) : null}

      <Text variant="heading" accessibilityRole="header">
        Bezahlung
      </Text>
      <View style={{ gap: theme.spacing.m }}>
        <ChoiceCard
          title="Ehrenamtlich"
          description="Sie nehmen kein Geld. Im Profil steht dann „ehrenamtlich, kostenlos“."
          selected={volunteer}
          onPress={() => setVolunteer((v) => !v)}
        />
        {!volunteer ? (
          <TextField
            label="Stundensatz in Euro"
            value={rate}
            onChangeText={setRate}
            keyboardType="decimal-pad"
          />
        ) : null}
      </View>

      <TextField
        label="Wie weit fahren Sie? (Kilometer)"
        value={radius}
        onChangeText={setRadius}
        keyboardType="number-pad"
      />

      <Callout tone="info" title="Verfügbarkeit">
        Ihre Zeiten pflegen Sie im Kalender. Wiederkehrende Zeiten, Abwesenheiten und ein
        Fahrzeitpuffer sind dort hinterlegt. Eine dauerhafte Standortverfolgung gibt es nicht –
        Beginn und Ende eines Termins bestätigen Sie selbst.
      </Callout>
    </Screen>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  COMMUNICATION_MODES,
  COMMUNICATION_MODE_LABELS,
  redactSeekerProfile,
  type CommunicationMode,
  type SeekerFieldKey,
  type SupportSeekerProfile,
} from '@miteinander/core';
import {
  Avatar,
  Button,
  Callout,
  ChoiceCard,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

/**
 * Screen 4: Profil für Unterstützungssuchende.
 *
 * Nur das Noetigste wird abgefragt. Diagnosen werden nie vorausgesetzt. Die
 * Person legt selbst fest, welche Angaben vor einer bestaetigten Buchung
 * sichtbar sind -- die Vorschau zeigt das Ergebnis sofort.
 */
const SHAREABLE: Array<{ key: SeekerFieldKey; label: string; easy: string }> = [
  { key: 'aboutMe', label: 'Was ich über mich schreibe', easy: 'Ihr Text über sich.' },
  { key: 'communicationModes', label: 'Wie ich mich verständige', easy: 'Wie Sie sprechen möchten.' },
  { key: 'languages', label: 'Meine Sprachen', easy: 'Welche Sprachen Sie sprechen.' },
  { key: 'mobilityNotes', label: 'Hinweise zur Bewegung', easy: 'Zum Beispiel: Ich nutze einen Rollator.' },
  { key: 'supportNeeds', label: 'Wobei ich Unterstützung brauche', easy: 'Wobei Sie Hilfe brauchen.' },
  { key: 'photoUrl', label: 'Mein Foto', easy: 'Ihr Bild.' },
];

export default function SeekerProfile() {
  const theme = useTheme();
  const { data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [profile, setProfile] = useState<SupportSeekerProfile | null>(null);

  const reload = useCallback(async () => {
    setProfile((await data.seekers.get(currentUserId)) ?? null);
  }, [data, currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!profile) {
    return (
      <Screen title="Mein Profil">
        <Text muted>Wird geladen …</Text>
      </Screen>
    );
  }

  const save = async (patch: Partial<SupportSeekerProfile>) => {
    const next = { ...profile, ...patch, updatedAt: new Date().toISOString() };
    await data.seekers.save(next);
    setProfile(next);
  };

  const preview = redactSeekerProfile(profile, { kind: 'provider_candidate' });

  return (
    <Screen
      title="Mein Profil"
      intro="Sie müssen nur wenig angeben. Alles Weitere ist freiwillig."
      easyIntro="Hier stehen ein paar Sachen über Sie."
      onSpeak={speak}
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.m, alignItems: 'center' }}>
        <Avatar name="Ihr Profil" size={80} />
        <Text muted style={{ flex: 1 }}>
          Ein Foto ist freiwillig. Ohne Foto sehen andere nur Ihre Anfangsbuchstaben.
        </Text>
      </View>

      <TextField
        label="Was möchten Sie über sich sagen?"
        hint="Freiwillig. Zum Beispiel: Ich gehe gern spazieren."
        value={profile.aboutMe ?? ''}
        onChangeText={(aboutMe) => void save({ aboutMe })}
        multiline
      />

      <TextField
        label="Hinweise zur Bewegung"
        hint="Freiwillig. Zum Beispiel: Ich benutze einen Rollator. Treppen gehen nicht."
        value={profile.mobilityNotes ?? ''}
        onChangeText={(mobilityNotes) => void save({ mobilityNotes })}
        multiline
      />

      <Callout tone="info" title="Keine Diagnosen nötig">
        Sie müssen keine Diagnose angeben. Uns interessiert nur, was Ihnen im Alltag hilft.
      </Callout>

      <Text variant="heading" accessibilityRole="header">
        Wie ich mich verständige
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        {COMMUNICATION_MODES.map((mode: CommunicationMode) => {
          const selected = profile.communicationModes.includes(mode);
          return (
            <Button
              key={mode}
              label={selected ? `${COMMUNICATION_MODE_LABELS[mode]} ✓` : COMMUNICATION_MODE_LABELS[mode]}
              variant={selected ? 'primary' : 'secondary'}
              fullWidth={false}
              onPress={() =>
                void save({
                  communicationModes: selected
                    ? profile.communicationModes.filter((m) => m !== mode)
                    : [...profile.communicationModes, mode],
                })
              }
            />
          );
        })}
      </View>

      <Text variant="heading" accessibilityRole="header">
        Was andere vor einem Termin sehen dürfen
      </Text>
      <Text muted>
        Ihr Name und Ihr Ort sind immer sichtbar – sonst kann niemand entscheiden, ob er passt.
        Telefonnummer und genaue Adresse bleiben immer geheim, bis ein Termin fest steht.
      </Text>
      {SHAREABLE.map((field) => {
        const shared = profile.sharedBeforeBooking.includes(field.key);
        return (
          <ChoiceCard
            key={field.key}
            title={field.label}
            description={shared ? 'Wird vor dem Termin gezeigt.' : 'Bleibt vorerst verborgen.'}
            easyDescription={field.easy}
            selected={shared}
            onPress={() =>
              void save({
                sharedBeforeBooking: shared
                  ? profile.sharedBeforeBooking.filter((f) => f !== field.key)
                  : [...profile.sharedBeforeBooking, field.key],
              })
            }
          />
        );
      })}

      <Text variant="heading" accessibilityRole="header">
        Vorschau
      </Text>
      <Callout tone="info" title="So sehen andere Ihr Profil vor einem Termin">
        {`Sichtbar: ${Object.keys(preview)
          .filter((k) => k !== 'withheldFields' && k !== 'userId' && k !== 'updatedAt')
          .join(', ')}. Zurückgehalten: ${preview.withheldFields.join(', ') || 'nichts'}.`}
      </Callout>
    </Screen>
  );
}

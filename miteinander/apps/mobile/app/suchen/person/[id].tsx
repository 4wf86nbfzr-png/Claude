import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  COMMUNICATION_MODE_LABELS,
  describeVerification,
  toPublicProviderProfile,
  getQualification,
  type ProviderProfile,
  type ProviderVerification,
} from '@miteinander/core';
import {
  Avatar,
  Button,
  Callout,
  Screen,
  Text,
  VerificationBadge,
  VerifiedClaim,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../../src/state/app-state';
import { useReadAloud } from '../../../src/state/speech';
import { DgsAbschnitt } from '../../../src/components/DgsAbschnitt';

/**
 * Screen 7: Profil einer Unterstützungsperson.
 *
 * Geprüft ist immer nur das konkret genannte Merkmal. Was jemand
 * ausdruecklich NICHT anbietet, steht gleichberechtigt daneben -- das
 * verhindert Missverstaendnisse beim Termin.
 */
export default function ProviderProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id, requestId } = useLocalSearchParams<{ id: string; requestId?: string }>();
  const { data, service, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [name, setName] = useState('');
  const [verifications, setVerifications] = useState<ProviderVerification[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      data.providers.get(id),
      data.users.get(id),
      data.verifications.forProvider(id),
    ]).then(([p, u, v]) => {
      if (!active) return;
      setProfile(p ?? null);
      setName(u?.displayName ?? '');
      setVerifications(v);
    });
    return () => {
      active = false;
    };
  }, [id, data]);

  if (!profile) {
    return (
      <Screen title="Profil">
        <Text muted>Wird geladen …</Text>
      </Screen>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const validLabels = verifications
    .filter((v) => v.status === 'approved' && (!v.validUntil || v.validUntil >= today))
    .map((v) => getQualification(v.qualificationKey)?.label ?? v.qualificationKey);
  const publicProfile = toPublicProviderProfile(profile, validLabels);

  return (
    <Screen
      title={name}
      intro={profile.headline}
      easyIntro="Hier steht alles über diese Person."
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="provider.profile_explained" />}
      footer={
        <Button
          label="Nachricht schreiben"
          onPress={() => {
            if (!requestId) return;
            void service.startConversation(requestId, id).then((conversation) =>
              router.push({ pathname: '/suchen/chat/[id]', params: { id: conversation.id } }),
            );
          }}
          accessibilityHint="Sie schreiben eine Nachricht. Ihre Telefonnummer bleibt geheim."
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.m, alignItems: 'center' }}>
        <Avatar name={name} size={96} />
        <View style={{ flex: 1, gap: theme.spacing.s }}>
          <VerificationBadge kind={profile.kind} />
          <Text variant="label">
            {profile.volunteer
              ? 'ehrenamtlich, kostenlos'
              : profile.hourlyRateCents != null
                ? `${(profile.hourlyRateCents / 100).toFixed(2).replace('.', ',')} Euro pro Stunde`
                : 'Preis auf Anfrage'}
          </Text>
        </View>
      </View>

      <Text>{profile.aboutMe}</Text>
      <Button label="Text vorlesen" variant="secondary" onPress={() => speak(profile.aboutMe)} />

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Das wurde geprüft
        </Text>
        {verifications.length === 0 ? (
          <Text muted>Es liegen noch keine geprüften Nachweise vor.</Text>
        ) : (
          verifications.map((v) => <VerifiedClaim key={v.id} text={describeVerification(v)} />)
        )}
        <Callout tone="info" title="Was das bedeutet">
          {publicProfile.verificationDisclaimer}
        </Callout>
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Das macht diese Person ausdrücklich nicht
        </Text>
        {profile.explicitlyNotOffered.map((item) => (
          <Text key={item} muted>
            • {item}
          </Text>
        ))}
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Verständigung
        </Text>
        <Text muted>
          {profile.communicationModes.map((m) => COMMUNICATION_MODE_LABELS[m]).join(', ')}
        </Text>
        <Text muted>Sprachen: {profile.languages.join(', ')}</Text>
        {publicProfile.signLanguageClaimUnverified ? (
          <Callout tone="warning" title="Noch nicht geprüft">
            Diese Person gibt Kenntnisse in Gebärdensprache an. Ein Nachweis liegt dafür noch nicht
            vor.
          </Callout>
        ) : null}
        {publicProfile.signLanguageLevel ? (
          <VerifiedClaim text={`Gebärdensprache, Stufe: ${publicProfile.signLanguageLevel}`} />
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Wenn ein Termin ausfällt
        </Text>
        <Text muted>{profile.cancellationPolicy}</Text>
      </View>

      <Button
        label="Diese Person melden"
        variant="danger"
        onPress={() => router.push('/hilfe')}
        accessibilityHint="Sie können ein Problem melden. Wir kümmern uns darum."
      />
    </Screen>
  );
}

import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  APPROVAL_KINDS,
  APPROVAL_KIND_LABELS,
  ApprovalError,
  validateGrant,
  type ApprovalKind,
  type ApprovalLegalBasis,
  type TrustedScope,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  ProgressSteps,
  Screen,
  Text,
  TextField,
  WhatHappensNext,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

/**
 * Eine Person einrichten.
 *
 * Der heikelste Ablauf der ganzen App. Hier entsteht die Berechtigung einer
 * Person, über die Angelegenheiten einer anderen mitzuentscheiden.
 *
 * Deshalb drei feste Regeln:
 *  1. Die Einrichtung findet gemeinsam statt. Es gibt keinen Weg, das hinter
 *     dem Rücken der Person zu tun -- sie bestätigt am Ende selbst.
 *  2. Eine Freigabepflicht braucht eine Grundlage: entweder ihren eigenen
 *     Wunsch oder einen gerichtlichen Einwilligungsvorbehalt mit Aktenzeichen.
 *  3. Voreingestellt ist die Stufe „Begleitung" -- Hilfe beim Bedienen, ohne
 *     zu entscheiden. Wer mehr will, muss es ausdrücklich wählen.
 */
const EINBLICKE: Array<{ key: TrustedScope; label: string; easy: string }> = [
  { key: 'view_profile', label: 'Profil ansehen', easy: 'Sie dürfen das Profil sehen.' },
  { key: 'create_requests', label: 'Anfragen für die Person stellen', easy: 'Sie dürfen Hilfe suchen.' },
  { key: 'read_messages', label: 'Nachrichten lesen', easy: 'Sie dürfen die Nachrichten lesen.' },
  { key: 'confirm_bookings', label: 'Termine mitbestätigen', easy: 'Sie dürfen Termine zusagen.' },
];

export default function PersonEinrichten() {
  const theme = useTheme();
  const router = useRouter();
  const { data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [schritt, setSchritt] = useState(0);
  const [seekerId, setSeekerId] = useState('');
  const [scopes, setScopes] = useState<TrustedScope[]>(['view_profile']);
  const [stufe, setStufe] = useState<'begleitung' | 'verantwortung'>('begleitung');
  const [freigaben, setFreigaben] = useState<ApprovalKind[]>([]);
  const [grundlage, setGrundlage] = useState<ApprovalLegalBasis | null>(null);
  const [aktenzeichen, setAktenzeichen] = useState('');
  const [personIstDabei, setPersonIstDabei] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);

  const schritte = ['Wen', 'Einblick', 'Verantwortung', 'Bestätigung'];

  const speichern = async () => {
    setFehler(null);
    const berechtigung = {
      id: `trust_${Date.now()}`,
      seekerId: seekerId.trim(),
      trustedPersonId: currentUserId,
      scopes,
      responsibilityLevel: stufe,
      approvalRequired: stufe === 'verantwortung' ? freigaben : [],
      approvalLegalBasis: stufe === 'verantwortung' && freigaben.length > 0 ? grundlage : null,
      courtReference: grundlage === 'court_ordered' ? aktenzeichen.trim() : null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
      revokedAt: null,
      legalBasisNote:
        grundlage === 'client_wish'
          ? 'Die Person hat selbst darum gebeten. Sie kann es jederzeit allein beenden.'
          : grundlage === 'court_ordered'
            ? `Gerichtlicher Einwilligungsvorbehalt, Aktenzeichen ${aktenzeichen.trim()}.`
            : null,
    };
    try {
      validateGrant(berechtigung);
      await data.trust.save(berechtigung);
      setFertig(true);
    } catch (e) {
      setFehler(
        e instanceof ApprovalError || e instanceof Error ? e.message : 'Das hat nicht geklappt.',
      );
    }
  };

  if (fertig) {
    return (
      <Screen title="Eingerichtet" onSpeak={speak}>
        <Callout tone="success" title="Fertig">
          Die Berechtigung ist gespeichert. Die Person sieht in ihrer eigenen App, was Sie sehen
          dürfen, und kann es jederzeit ändern.
        </Callout>
        <Button label="Zur Übersicht" onPress={() => router.replace('/verantwortlich')} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Eine Person einrichten"
      intro="Bitte machen Sie das gemeinsam mit der Person. Sie bestätigt am Ende selbst."
      easyIntro="Machen Sie das zusammen mit der Person.\nDie Person sagt am Ende selbst Ja."
      onSpeak={speak}
      footer={
        <ButtonStack>
          {schritt < schritte.length - 1 ? (
            <Button
              label="Weiter"
              onPress={() => setSchritt((s) => s + 1)}
              disabled={schritt === 0 && seekerId.trim().length === 0}
            />
          ) : (
            <Button
              label="Berechtigung speichern"
              onPress={() => void speichern()}
              disabled={!personIstDabei}
            />
          )}
          {schritt > 0 ? (
            <Button label="Zurück" variant="secondary" onPress={() => setSchritt((s) => s - 1)} />
          ) : null}
        </ButtonStack>
      }
    >
      <ProgressSteps index={schritt + 1} total={schritte.length} label={schritte[schritt]} />

      {schritt === 0 ? (
        <View style={{ gap: theme.spacing.m }}>
          <Callout tone="info" title="Nicht ohne die Person">
            Eine Berechtigung entsteht nur gemeinsam. Es gibt in dieser App keinen Weg, jemanden
            ohne sein Wissen zu verwalten.
          </Callout>
          <TextField
            label="Konto-Kennung der Person"
            hint="Im Demo-Modus zum Ausprobieren: u_seeker_3"
            value={seekerId}
            onChangeText={setSeekerId}
            required
          />
        </View>
      ) : null}

      {schritt === 1 ? (
        <View style={{ gap: theme.spacing.m }}>
          <Text muted>Wählen Sie nur, was Sie wirklich brauchen.</Text>
          {EINBLICKE.map((eintrag) => {
            const gewaehlt = scopes.includes(eintrag.key);
            return (
              <ChoiceCard
                key={eintrag.key}
                title={eintrag.label}
                description={eintrag.easy}
                selected={gewaehlt}
                onPress={() =>
                  setScopes((aktuell) =>
                    gewaehlt ? aktuell.filter((s) => s !== eintrag.key) : [...aktuell, eintrag.key],
                  )
                }
              />
            );
          })}
        </View>
      ) : null}

      {schritt === 2 ? (
        <View style={{ gap: theme.spacing.m }}>
          <ChoiceCard
            title="Begleitung"
            description="Sie helfen beim Bedienen und sehen, was freigegeben ist. Sie entscheiden nichts."
            easyDescription="Sie helfen beim Bedienen.\nSie entscheiden nichts."
            selected={stufe === 'begleitung'}
            onPress={() => {
              setStufe('begleitung');
              setFreigaben([]);
              setGrundlage(null);
            }}
          />
          <ChoiceCard
            title="Verantwortung"
            description="Zusätzlich müssen Sie bestimmte Schritte freigeben, bevor sie wirksam werden."
            easyDescription="Sie müssen bei manchen Sachen Ja sagen."
            selected={stufe === 'verantwortung'}
            onPress={() => setStufe('verantwortung')}
          />

          {stufe === 'verantwortung' ? (
            <>
              <Callout tone="warning" title="Das ist ein Eingriff">
                Eine Freigabepflicht schränkt ein, was ein volljähriger Mensch allein entscheiden
                kann. Sie ist nur zulässig, wenn die Person das selbst so möchte – oder wenn ein
                Gericht einen Einwilligungsvorbehalt angeordnet hat.
              </Callout>

              <Text variant="heading" accessibilityRole="header">
                Was möchten Sie freigeben?
              </Text>
              {APPROVAL_KINDS.map((art) => {
                const gewaehlt = freigaben.includes(art);
                return (
                  <ChoiceCard
                    key={art}
                    title={APPROVAL_KIND_LABELS[art].label}
                    description={APPROVAL_KIND_LABELS[art].easy}
                    selected={gewaehlt}
                    onPress={() =>
                      setFreigaben((aktuell) =>
                        gewaehlt ? aktuell.filter((k) => k !== art) : [...aktuell, art],
                      )
                    }
                  />
                );
              })}

              {freigaben.length > 0 ? (
                <>
                  <Text variant="heading" accessibilityRole="header">
                    Worauf stützt sich das?
                  </Text>
                  <ChoiceCard
                    title="Die Person möchte das selbst so"
                    description="Sie kann es jederzeit allein wieder beenden."
                    easyDescription="Die Person will das so.\nSie kann es wieder ändern."
                    selected={grundlage === 'client_wish'}
                    onPress={() => setGrundlage('client_wish')}
                  />
                  <ChoiceCard
                    title="Gerichtlicher Einwilligungsvorbehalt"
                    description="Ein Betreuungsgericht hat das angeordnet (§ 1825 BGB). Nur mit Aktenzeichen."
                    easyDescription="Ein Gericht hat das entschieden."
                    selected={grundlage === 'court_ordered'}
                    onPress={() => setGrundlage('court_ordered')}
                  />
                  {grundlage === 'court_ordered' ? (
                    <TextField
                      label="Aktenzeichen des Betreuungsgerichts"
                      hint="Ohne Aktenzeichen können wir das nicht speichern."
                      value={aktenzeichen}
                      onChangeText={setAktenzeichen}
                      required
                    />
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {schritt === 3 ? (
        <View style={{ gap: theme.spacing.m }}>
          <Text variant="heading" accessibilityRole="header">
            Das haben Sie eingestellt
          </Text>
          <Text muted>Einblick: {scopes.join(', ') || 'nichts'}</Text>
          <Text muted>
            Stufe: {stufe === 'verantwortung' ? 'Verantwortung mit Freigaben' : 'Begleitung'}
          </Text>
          {freigaben.length > 0 ? (
            <Text muted>
              Freigaben: {freigaben.map((k) => APPROVAL_KIND_LABELS[k].label).join(', ')}
            </Text>
          ) : null}

          <ChoiceCard
            title="Die Person ist dabei und ist einverstanden"
            description="Ohne diese Bestätigung speichern wir nichts. Bitte lesen Sie das Obenstehende gemeinsam durch."
            easyDescription="Die Person ist dabei.\nDie Person sagt Ja."
            selected={personIstDabei}
            onPress={() => setPersonIstDabei((v) => !v)}
          />

          {fehler ? (
            <Callout tone="danger" title="Das geht so nicht">
              {fehler}
            </Callout>
          ) : null}

          <WhatHappensNext text="Die Person sieht danach in ihrer eigenen App, was Sie sehen dürfen und was Sie freigeben. Sie kann eine selbst gewünschte Freigabepflicht jederzeit allein beenden." />
        </View>
      ) : null}
    </Screen>
  );
}

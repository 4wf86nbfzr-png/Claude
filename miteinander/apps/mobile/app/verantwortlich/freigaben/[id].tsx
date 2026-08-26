import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  APPROVAL_KIND_LABELS,
  formatDateTimeGerman,
  isApprovalOverdue,
  type ApprovalRequest,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  Screen,
  Text,
  TextField,
  WhatHappensNext,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../../src/state/app-state';
import { useReadAloud } from '../../../src/state/speech';

/**
 * Eine einzelne Freigabe entscheiden.
 *
 * Zwei Regeln bestimmen diesen Bildschirm:
 *  - Eine Ablehnung braucht eine Begründung. Wer für einen anderen Menschen
 *    entscheidet, schuldet ihm eine Erklärung.
 *  - Nichts geht automatisch durch. Wer nicht antwortet, stimmt nicht zu --
 *    die Person wartet dann weiter, und wir erinnern.
 */
export default function FreigabeEntscheiden() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { service, data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [freigabe, setFreigabe] = useState<ApprovalRequest | null>(null);
  const [name, setName] = useState('');
  const [grund, setGrund] = useState('');
  const [ablehnenOffen, setAblehnenOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    void data.approvals.get(id).then(async (eintrag) => {
      if (!aktiv || !eintrag) return;
      setFreigabe(eintrag);
      const person = await data.users.get(eintrag.seekerId);
      if (aktiv) setName(person?.displayName ?? 'Die Person');
    });
    return () => {
      aktiv = false;
    };
  }, [id, data]);

  const entscheiden = async (entscheidung: 'approved' | 'declined') => {
    setFehler(null);
    try {
      await service.decideApproval(id, currentUserId, entscheidung, grund || undefined);
      setFertig(
        entscheidung === 'approved'
          ? `${name} kann jetzt weitermachen. Wir haben Bescheid gesagt.`
          : `${name} hat Ihre Antwort mit Ihrer Begründung bekommen.`,
      );
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    }
  };

  if (fertig) {
    return (
      <Screen title="Erledigt" onSpeak={speak}>
        <Callout tone="success" title="Ihre Antwort ist raus">
          {fertig}
        </Callout>
        <Button label="Zur Übersicht" onPress={() => router.replace('/verantwortlich')} />
      </Screen>
    );
  }

  if (!freigabe) {
    return (
      <Screen title="Freigabe">
        <Text muted>Wird geladen …</Text>
      </Screen>
    );
  }

  const bezeichnung = APPROVAL_KIND_LABELS[freigabe.kind];
  const jetzt = new Date().toISOString();
  const entschieden = freigabe.status !== 'pending';

  return (
    <Screen
      title={`${name}: ${bezeichnung.label}`}
      intro="Bitte lesen Sie in Ruhe. Ohne Ihre Antwort passiert nichts."
      easyIntro="Bitte lesen Sie das.\nDann sagen Sie Ja oder Nein."
      onSpeak={speak}
      footer={
        entschieden ? null : (
          <ButtonStack>
            <Button
              label="Ja, ich stimme zu"
              onPress={() => void entscheiden('approved')}
              accessibilityHint={`${name} kann danach weitermachen.`}
            />
            {ablehnenOffen ? (
              <Button
                label="Nein, mit dieser Begründung ablehnen"
                variant="danger"
                disabled={grund.trim().length < 3}
                onPress={() => void entscheiden('declined')}
              />
            ) : (
              <Button
                label="Nein, ich stimme nicht zu"
                variant="secondary"
                onPress={() => setAblehnenOffen(true)}
                accessibilityHint="Sie werden nach einer Begründung gefragt."
              />
            )}
          </ButtonStack>
        )
      }
    >
      {isApprovalOverdue(freigabe, jetzt) ? (
        <Callout tone="warning" title="Überfällig">
          Die Antwort wurde bis {formatDateTimeGerman(freigabe.respondBy)} erbeten. {name} wartet
          noch.
        </Callout>
      ) : null}

      <View
        style={{
          gap: theme.spacing.s,
          padding: theme.spacing.l,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="label">Worum es geht</Text>
        <Text>{prefs.easyLanguage ? freigabe.easySummary : freigabe.summary}</Text>
      </View>

      <Text variant="caption" muted>
        Angefragt am {formatDateTimeGerman(freigabe.createdAt)}. Antwort erbeten bis{' '}
        {formatDateTimeGerman(freigabe.respondBy)}.
      </Text>

      {ablehnenOffen && !entschieden ? (
        <TextField
          label="Warum stimmen Sie nicht zu?"
          hint={`${name} bekommt diesen Text zu lesen. Bitte schreiben Sie es so, wie Sie es auch sagen würden.`}
          value={grund}
          onChangeText={setGrund}
          multiline
          required
        />
      ) : null}

      {fehler ? (
        <Callout tone="danger" title="Das hat nicht geklappt">
          {fehler}
        </Callout>
      ) : null}

      <WhatHappensNext
        text={`Wenn Sie zustimmen, kann ${name} den Vorgang selbst abschließen – Sie entscheiden nicht an ihrer Stelle. Wenn Sie nicht zustimmen, bekommt ${name} Ihre Begründung zu lesen. Antworten Sie gar nicht, passiert nichts: der Vorgang bleibt offen und wir erinnern Sie.`}
      />

      <Callout tone="info" title="Sie entscheiden nicht allein über alles">
        Sie geben nur das frei, wofür {name} Sie benannt hat. Alles andere entscheidet {name}
        {' '}selbst.
      </Callout>
    </Screen>
  );
}

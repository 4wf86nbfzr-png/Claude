import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  appConfig,
  startListening,
  stopListening,
  voiceFallback,
  type Message,
  type MicrophoneState,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../../src/state/app-state';
import { useReadAloud } from '../../../src/state/speech';
import { DgsAbschnitt } from '../../../src/components/DgsAbschnitt';

/**
 * Screen 9: Chat, Sprachnachricht und Videoanruf.
 *
 * Eine Sprachnachricht wird nie ohne sichtbares Transkript verschickt --
 * sonst waere sie fuer gehoerlose Menschen wertlos. Das Transkript ist vor
 * dem Senden aenderbar, weil die Erkennung Fehler macht.
 */
export default function Chat() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { service, data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [transcript, setTranscript] = useState('');
  const [mic, setMic] = useState<MicrophoneState>(() => stopListening());
  const [error, setError] = useState<string | null>(null);
  const [micProblem, setMicProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setMessages(await data.conversations.messages(id));
  }, [data, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = async (kind: Message['kind']) => {
    setError(null);
    try {
      if (kind === 'voice') {
        await service.sendMessage(id, currentUserId, 'voice', '', { transcript, mediaPath: 'demo.m4a' });
        setTranscript('');
      } else {
        await service.sendMessage(id, currentUserId, 'text', text);
        setText('');
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nachricht konnte nicht gesendet werden.');
    }
  };

  return (
    <Screen
      title="Nachrichten"
      intro="Schreiben oder sprechen Sie. Ihre Telefonnummer bleibt geheim, bis ein Termin fest steht."
      easyIntro="Hier schreiben Sie mit der Person."
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="help.overview" />}
      footer={
        <ButtonStack>
          <Button label="Nachricht senden" onPress={() => void send('text')} disabled={!text.trim()} />
          {appConfig.features.videoCalls ? (
            <Button
              label="Videoanruf starten"
              variant="secondary"
              onPress={() => setError('Der Videoanruf ist im Demo-Modus nicht verbunden.')}
              accessibilityHint="Ein Videoanruf mit Bild. Gut für Gebärdensprache."
            />
          ) : null}
        </ButtonStack>
      }
    >
      <View
        style={{ gap: theme.spacing.m }}
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Unterhaltung mit ${messages.length} Nachrichten`}
      >
        {messages.length === 0 ? <Text muted>Noch keine Nachrichten.</Text> : null}
        {messages.map((message) => {
          const own = message.senderId === currentUserId;
          return (
            <View
              key={message.id}
              accessible
              accessibilityLabel={`${own ? 'Von Ihnen' : 'Von der anderen Person'}: ${
                message.transcript ?? message.body
              }`}
              style={{
                alignSelf: own ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: theme.spacing.m,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: own ? theme.colors.accent : theme.colors.border,
                backgroundColor: theme.colors.surface,
                gap: theme.spacing.xs,
              }}
            >
              <Text variant="caption" muted>
                {own ? 'Sie' : 'Andere Person'}
                {message.kind === 'voice' ? ' · Sprachnachricht' : ''}
              </Text>
              <Text>{message.transcript ?? message.body}</Text>
              {message.kind === 'voice' ? (
                <Button
                  label="Anhören"
                  variant="quiet"
                  fullWidth={false}
                  onPress={() => speak(message.transcript ?? '')}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      <TextField
        label="Ihre Nachricht"
        value={text}
        onChangeText={setText}
        multiline
        hint="Sie können auch die Spracheingabe nutzen."
      />

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Sprachnachricht
        </Text>
        <Text variant="caption" muted>
          Das Mikrofon läuft nur, solange Sie aufnehmen. Sie sehen das immer an der Anzeige.
        </Text>
        <Button
          label={mic.active ? 'Aufnahme beenden' : 'Aufnahme starten'}
          variant={mic.active ? 'danger' : 'secondary'}
          onPress={() => {
            if (mic.active) {
              setMic(stopListening());
            } else {
              setMic(startListening(new Date().toISOString()));
              setMicProblem(null);
              // Im Demo-Modus gibt es keine echte Erkennung.
              const fallback = voiceFallback('unsupported');
              setMicProblem(`${fallback.message} ${fallback.action}`);
            }
          }}
        />
        {mic.active ? (
          <Callout tone="warning" title="Aufnahme läuft">
            Das Mikrofon ist an. Es stoppt automatisch nach {mic.autoStopSeconds} Sekunden ohne
            Eingabe.
          </Callout>
        ) : null}
        {micProblem ? <Callout tone="info">{micProblem}</Callout> : null}

        <TextField
          label="Text zur Sprachnachricht"
          hint="Bitte prüfen Sie den Text, bevor Sie senden. Die Erkennung macht Fehler."
          value={transcript}
          onChangeText={setTranscript}
          multiline
        />
        <Button
          label="Sprachnachricht mit Text senden"
          variant="secondary"
          disabled={!transcript.trim()}
          onPress={() => void send('voice')}
        />
      </View>

      <Button
        label="Termin vorschlagen"
        onPress={() => router.push({ pathname: '/suchen/buchung/[id]', params: { id } })}
      />
    </Screen>
  );
}

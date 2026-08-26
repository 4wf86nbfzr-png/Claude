import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BEGLEITER,
  GEGENUEBER_ANTWORTEN,
  KARTENGRUPPEN,
  KEINE_UEBERSETZUNG,
  VERSTAENDIGUNGSWEGE,
  baueAeusserung,
  karte,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  EmergencyBar,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { announce, useReadAloud } from '../src/state/speech';
import { useZuhoeren, zuhoerMeldung, zuhoerenMoeglich } from '../src/state/zuhoeren';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';
import { Rueckfragen } from '../src/components/Rueckfragen';

/**
 * Verstaendigung -- Mikas zweite Aufgabe.
 *
 * Fuer Menschen, die nicht oder nicht gut sprechen koennen. Zwei Seiten
 * eines Gespraechs auf einem Geraet:
 *
 *   oben   Was ich sage   -- Karten und Text, die das Geraet laut spricht.
 *   unten  Was Sie sagen  -- die andere Seite antwortet mit Karten, tippt,
 *                            oder laesst sich zuhoeren.
 *
 * Was das ist und was es nicht ist, steht auf dem Bildschirm und nicht nur
 * in der Doku: Es ist kein Gebaerdensprach-Uebersetzer. Es ersetzt keine
 * Dolmetschung. Es ist der Weg, sich verstaendlich zu machen, wenn die
 * Stimme fehlt -- und der laeuft heute.
 *
 * Nichts von diesem Gespraech wird gespeichert oder verschickt. Es steht auf
 * dem Bildschirm und ist mit einem Tipp weg.
 */

interface Zeile {
  id: number;
  wer: 'ich' | 'gegenueber';
  text: string;
}

export default function MikaVerstaendigung() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs } = useAppState();
  const { speak, speaking, stop } = useReadAloud(prefs);

  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [freitext, setFreitext] = useState('');
  const [antwortText, setAntwortText] = useState('');
  const [verlauf, setVerlauf] = useState<Zeile[]>([]);
  const [naechsteId, setNaechsteId] = useState(1);
  const [wegeOffen, setWegeOffen] = useState(false);

  const satz = baueAeusserung(gewaehlt, freitext);

  const eintragen = useCallback(
    (wer: Zeile['wer'], text: string) => {
      setVerlauf((alt) => [{ id: naechsteId, wer, text }, ...alt]);
      setNaechsteId((n) => n + 1);
    },
    [naechsteId],
  );

  /** Der Kern: Das Geraet spricht fuer die Person. */
  const sagen = () => {
    if (!satz) return;
    speak(satz);
    eintragen('ich', satz);
    setGewaehlt([]);
    setFreitext('');
    announce(`Gesagt: ${satz}`);
  };

  const gegenueberSagt = useCallback(
    (text: string) => {
      const sauber = text.trim();
      if (!sauber) return;
      eintragen('gegenueber', sauber);
      setAntwortText('');
    },
    [eintragen],
  );

  const { stand, zwischenstand, starten, stoppen } = useZuhoeren(gegenueberSagt);
  const meldung = zuhoerMeldung(stand);

  return (
    <Screen
      title="Verständigung"
      intro="Sie wählen aus oder tippen – das Gerät spricht für Sie. Ihr Gegenüber antwortet hier auf demselben Bildschirm."
      easyIntro={'Sie wählen Karten aus.\nDas Gerät spricht für Sie.'}
      onSpeak={speak}
      /* Auch hier ohne Begleiter-Block: dieser Bildschirm ist Mika.
         Das geprüfte Video steht direkt unter der Überschrift. */
      dgs={<DgsAbschnitt schluessel="help.overview" standardOffen={prefs.signLanguage} />}
    >
      <Callout tone="info" title={`${BEGLEITER.name} – ${BEGLEITER.rolle}`}>
        {BEGLEITER.selbstauskunft}
      </Callout>

      {/* ---------- Oben: was ich sage ---------- */}
      <View style={{ gap: theme.spacing.s }}>
        <Text variant="heading" accessibilityRole="header">
          Was ich sagen möchte
        </Text>
        <Text muted>Tippen Sie Karten an. Zusammen ergeben sie einen Satz.</Text>
      </View>

      {/* Der gebaute Satz steht gross und vor dem Sprechen da -- niemand
          soll etwas sagen lassen, das er nicht gelesen hat. */}
      <View
        accessibilityLiveRegion="polite"
        style={{
          gap: theme.spacing.s,
          padding: theme.spacing.l,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: satz ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.surface,
        }}
      >
        <Text variant="label">Mein Satz</Text>
        <Text testID="mika-satz" variant="heading">
          {satz || 'Noch nichts ausgewählt.'}
        </Text>
      </View>

      <ButtonStack>
        <Button
          testID="mika-sprechen"
          label="Das laut sagen"
          onPress={sagen}
          disabled={!satz}
          accessibilityHint="Das Gerät spricht Ihren Satz."
        />
        {gewaehlt.length > 0 || freitext ? (
          <Button
            label="Satz löschen"
            variant="secondary"
            onPress={() => {
              setGewaehlt([]);
              setFreitext('');
            }}
          />
        ) : null}
        {speaking ? <Button label="Anhalten" variant="quiet" onPress={stop} /> : null}
      </ButtonStack>

      {/* Gewaehlte Karten einzeln zuruecknehmen -- sonst muesste man alles
          verwerfen, nur weil eine Karte zu viel ist. */}
      {gewaehlt.length > 0 ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label">Gewählt – zum Entfernen antippen</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.s }}>
            {gewaehlt.map((key, i) => (
              <Button
                key={`${key}-${i}`}
                label={`${karte(key)?.symbol ?? ''} ${karte(key)?.label ?? key} ✕`}
                variant="secondary"
                onPress={() => setGewaehlt((alt) => alt.filter((_, j) => j !== i))}
              />
            ))}
          </View>
        </View>
      ) : null}

      {KARTENGRUPPEN.map((gruppe) => (
        <View key={gruppe.key} style={{ gap: theme.spacing.s }}>
          <Text variant="label" accessibilityRole="header">
            {prefs.easyLanguage ? gruppe.titelLeicht : gruppe.titel}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.s }}>
            {gruppe.karten.map((k) => (
              <Pressable
                key={k.key}
                testID={`karte-${k.key}`}
                accessibilityRole="button"
                accessibilityLabel={k.label}
                accessibilityHint={`Hinzufügen. Gesprochen wird: ${k.gesprochen}`}
                onPress={() => setGewaehlt((alt) => [...alt, k.key])}
                style={({ pressed }) => ({
                  minWidth: 140,
                  minHeight: 88,
                  flexGrow: 1,
                  flexBasis: '30%',
                  paddingVertical: theme.spacing.m,
                  paddingHorizontal: theme.spacing.m,
                  gap: theme.spacing.xs,
                  borderRadius: 16,
                  borderWidth: 2,
                  borderColor: theme.colors.border,
                  backgroundColor: pressed ? theme.colors.surfaceRaised : theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text variant="heading" accessibilityElementsHidden>
                  {k.symbol}
                </Text>
                <Text style={{ textAlign: 'center' }}>{k.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <TextField
        testID="mika-freitext"
        label="Etwas anderes sagen"
        value={freitext}
        onChangeText={setFreitext}
        hint="Wird an den Satz angehängt und mitgesprochen."
        multiline
      />

      {/* ---------- Unten: was das Gegenüber sagt ---------- */}
      <View style={{ gap: theme.spacing.s, marginTop: theme.spacing.l }}>
        <Text variant="heading" accessibilityRole="header">
          Was mein Gegenüber sagt
        </Text>
        <Text muted>
          Geben Sie das Gerät weiter, oder lassen Sie es zuhören. Die Antwort erscheint als Text.
        </Text>
      </View>

      <ButtonStack>
        {stand === 'laeuft' ? (
          <Button label="Zuhören beenden" onPress={stoppen} />
        ) : (
          <Button
            testID="mika-zuhoeren"
            label={zuhoerenMoeglich() ? 'Zuhören – die andere Person spricht' : 'Zuhören geht hier nicht'}
            variant="secondary"
            onPress={starten}
            disabled={!zuhoerenMoeglich()}
          />
        )}
      </ButtonStack>

      {stand === 'laeuft' ? (
        <View accessibilityLiveRegion="polite">
          <Callout tone="info" title="Ich höre zu">
            {zwischenstand ? `… ${zwischenstand}` : 'Die andere Person kann jetzt sprechen.'}
          </Callout>
        </View>
      ) : null}

      {meldung ? <Callout tone="warning" title="Zum Zuhören">{meldung}</Callout> : null}

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="label">Schnelle Antworten für mein Gegenüber</Text>
        {GEGENUEBER_ANTWORTEN.map((k) => (
          <Button
            key={k.key}
            testID={`antwort-${k.key}`}
            label={`${k.symbol} ${k.label}`}
            variant="secondary"
            onPress={() => gegenueberSagt(k.gesprochen)}
          />
        ))}
      </View>

      <View style={{ gap: theme.spacing.s }}>
        <TextField
          testID="mika-antwort"
          label="Oder hier tippen lassen"
          value={antwortText}
          onChangeText={setAntwortText}
          hint="Die Antwort erscheint im Gespräch darunter."
          multiline
        />
        <Button
          label="Antwort eintragen"
          variant="secondary"
          onPress={() => gegenueberSagt(antwortText)}
          disabled={!antwortText.trim()}
        />
      </View>

      {/* ---------- Das Gespräch ---------- */}
      {verlauf.length > 0 ? (
        <View style={{ gap: theme.spacing.s, marginTop: theme.spacing.l }}>
          <Text variant="heading" accessibilityRole="header">
            Das Gespräch
          </Text>
          <Text variant="caption" muted>
            Steht nur auf diesem Bildschirm. Es wird nicht gespeichert und nicht verschickt.
          </Text>
          {verlauf.map((zeile) => (
            <View
              key={zeile.id}
              testID={`verlauf-${zeile.id}`}
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.m,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor:
                  zeile.wer === 'ich' ? theme.colors.surfaceRaised : theme.colors.surface,
              }}
            >
              <Text variant="label">{zeile.wer === 'ich' ? 'Ich' : 'Mein Gegenüber'}</Text>
              <Text>{zeile.text}</Text>
              <Button label="Vorlesen" variant="quiet" onPress={() => speak(zeile.text)} />
            </View>
          ))}
          <Button
            testID="mika-verlauf-loeschen"
            label="Gespräch löschen"
            variant="secondary"
            onPress={() => {
              setVerlauf([]);
              announce('Das Gespräch ist gelöscht.');
            }}
          />
        </View>
      ) : null}

<Rueckfragen schluessel="mika" />

      {/* ---------- Was das hier ist und was nicht ---------- */}
      <Callout tone="warning" title="Das ist kein Gebärdensprach-Übersetzer">
        {KEINE_UEBERSETZUNG}
      </Callout>

      <Button
        label={wegeOffen ? 'Wege zur Verständigung schließen' : 'Welche Wege gibt es noch?'}
        variant="secondary"
        onPress={() => setWegeOffen((o) => !o)}
      />

      {wegeOffen ? (
        <View style={{ gap: theme.spacing.m }}>
          {VERSTAENDIGUNGSWEGE.map((weg) => (
            <View
              key={weg.key}
              style={{
                gap: theme.spacing.xs,
                padding: theme.spacing.m,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text variant="label">
                {weg.stand === 'fertig' ? '✓ Läuft heute' : '○ Vorbereitet'} – {weg.titel}
              </Text>
              <Text muted>{weg.beschreibung}</Text>
              {weg.naechsterSchritt ? (
                <Text variant="caption" muted>
                  Was noch fehlt: {weg.naechsterSchritt}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <Button label="Zurück zum Start" variant="quiet" onPress={() => router.push('/')} />

      <EmergencyBar />
    </Screen>
  );
}

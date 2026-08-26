import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import {
  aktiveZeile,
  formatiereLaufzeit,
  type DgsContentItem,
} from '@miteinander/core';
import { Text, useTheme, usePreferences } from '@miteinander/ui';

/**
 * Abspieler für Gebärdensprach-Videos.
 *
 * Die Untertitel werden NICHT vom Betriebssystem gezeichnet und sind auch
 * nicht ins Video gebrannt, sondern gehören zur Oberfläche. Nur so folgen
 * sie der eingestellten Schriftgröße und dem Kontrastmodus -- eine fest
 * eingebrannte Zeile bliebe klein, egal was jemand eingestellt hat.
 *
 * Sie stehen UNTER dem Video, nicht darüber: Gebärden gehen bis in den
 * unteren Bildrand. Eine eingeblendete Zeile über dem Bild würde genau die
 * Hände verdecken, um die es geht.
 *
 * Alle Bedienelemente sind beschriftet und mindestens so groß wie im
 * Theme hinterlegt. Die Wiedergabe startet nie von selbst.
 */
export interface DgsPlayerProps {
  item: DgsContentItem;
  quelle: number | string;
}

const GESCHWINDIGKEITEN = [0.5, 0.75, 1] as const;

export function DgsPlayer({ item, quelle }: DgsPlayerProps) {
  const theme = useTheme();
  const prefs = usePreferences();

  const [laeuft, setLaeuft] = useState(false);
  const [zeit, setZeit] = useState(0);
  const [tempo, setTempo] = useState<number>(1);
  const [untertitelAn, setUntertitelAn] = useState(prefs.captions);
  const ansicht = useRef<VideoView>(null);

  const player = useVideoPlayer(quelle, (p: VideoPlayer) => {
    p.loop = false;
    // Viertelsekunden-Takt: fein genug für Untertitel, ohne dauernd neu zu zeichnen.
    p.timeUpdateEventInterval = 0.25;
  });

  useEffect(() => {
    const zeitZeiger = player.addListener('timeUpdate', ({ currentTime }) => {
      setZeit(currentTime);
    });
    const status = player.addListener('playingChange', ({ isPlaying }) => {
      setLaeuft(isPlaying);
    });
    const ende = player.addListener('playToEnd', () => {
      setLaeuft(false);
    });
    return () => {
      zeitZeiger.remove();
      status.remove();
      ende.remove();
    };
  }, [player]);

  const gesamt = item.untertitel.reduce((max, z) => Math.max(max, z.bis), 0);
  const zeile = untertitelAn ? aktiveZeile(item.untertitel, zeit) : undefined;

  const umschalten = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const tempoWechseln = useCallback(() => {
    const naechstes =
      GESCHWINDIGKEITEN[(GESCHWINDIGKEITEN.indexOf(tempo as never) + 1) % GESCHWINDIGKEITEN.length] ?? 1;
    setTempo(naechstes);
    player.playbackRate = naechstes;
  }, [player, tempo]);

  const knopf = (
    beschriftung: string,
    hinweis: string,
    beiDruck: () => void,
    hervorgehoben = false,
  ) => (
    <Pressable
      key={beschriftung}
      onPress={beiDruck}
      accessibilityRole="button"
      accessibilityLabel={beschriftung}
      accessibilityHint={hinweis}
      style={{
        minHeight: theme.touchTarget,
        paddingHorizontal: theme.spacing.m,
        justifyContent: 'center',
        borderRadius: 999,
        borderWidth: 2,
        borderColor: hervorgehoben ? theme.colors.accent : theme.colors.inputBorder,
        backgroundColor: hervorgehoben ? theme.colors.accent : 'transparent',
      }}
    >
      <Text variant="label" color={hervorgehoben ? theme.colors.textOnAccent : theme.colors.text}>
        {beschriftung}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.s }}>
      <View
        style={{
          borderRadius: 14,
          borderWidth: 2,
          borderColor: theme.colors.border,
          overflow: 'hidden',
          backgroundColor: '#000000',
        }}
      >
        <VideoView
          ref={ansicht}
          player={player}
          style={{ width: '100%', aspectRatio: 16 / 9 }}
          contentFit="contain"
          // Wir zeichnen die Bedienelemente selbst -- die eingebauten sind
          // je nach Betriebssystem zu klein und nicht beschriftet.
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      </View>

      {/* Untertitel unter dem Bild. Die Höhe ist reserviert, damit die
          Oberfläche beim Ein- und Ausblenden nicht springt. */}
      {untertitelAn ? (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            minHeight: theme.type('bodyStrong').lineHeight * 2 + theme.spacing.m,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.m,
            paddingVertical: theme.spacing.s,
            borderRadius: 10,
            backgroundColor: theme.colors.surfaceRaised,
            borderWidth: 2,
            borderColor: theme.colors.border,
          }}
        >
          <Text variant="bodyStrong" center>
            {zeile?.text ?? ''}
          </Text>
        </View>
      ) : null}

      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Wiedergabe bei ${formatiereLaufzeit(zeit)} von ${formatiereLaufzeit(gesamt)}`}
      >
        <Text variant="caption" muted>
          {formatiereLaufzeit(zeit)} von {formatiereLaufzeit(gesamt)}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        {knopf(
          laeuft ? 'Pause' : 'Abspielen',
          laeuft ? 'Hält das Video an.' : 'Startet das Video in Gebärdensprache.',
          umschalten,
          !laeuft,
        )}
        {knopf('5 Sekunden zurück', 'Springt fünf Sekunden zurück.', () => player.seekBy(-5))}
        {knopf('Von vorn', 'Startet das Video wieder von vorn.', () => {
          player.replay();
        })}
        {knopf(
          `Tempo ${tempo.toFixed(2).replace('.', ',').replace(/,00$/, '')}-fach`,
          'Wechselt die Abspielgeschwindigkeit. Langsamer hilft beim Mitlesen der Gebärden.',
          tempoWechseln,
        )}
        {knopf(
          untertitelAn ? 'Untertitel ausblenden' : 'Untertitel einblenden',
          untertitelAn
            ? 'Blendet den Text unter dem Video aus.'
            : 'Zeigt den Text unter dem Video an.',
          () => setUntertitelAn((an) => !an),
        )}
        {knopf('Vollbild', 'Zeigt das Video groß auf dem ganzen Bildschirm.', () => {
          void ansicht.current?.enterFullscreen();
        })}
      </View>
    </View>
  );
}

import React from 'react';
import { Image, ScrollView, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { useTheme } from './ThemeProvider';
import { Heading, Text } from './Text';
import { SpeakButton } from './SpeakButton';
import { breakpoints } from '../tokens/layout';

/**
 * Randloses Bild am Kopf eines Bildschirms.
 *
 * Die Bildbeschreibung ist Pflicht -- ein Bild ohne Beschreibung ist fuer
 * blinde Menschen eine Leerstelle und wird deshalb gar nicht erst
 * angeboten. Auf dem Bild steht nie Text: Schrift im Bild skaliert nicht
 * mit der Schriftgroesse und ist im Hochkontrastmodus nicht anpassbar.
 */
export interface HeroBild {
  source: ImageSourcePropType;
  /** Was auf dem Bild zu sehen ist, in ganzen Saetzen. */
  altText: string;
  /** Natuerliches Seitenverhaeltnis (Breite geteilt durch Hoehe). */
  seitenverhaeltnis?: number;
  /**
   * Bewegte Fassung. Wird nur uebergeben, wenn Bewegung erlaubt ist -- bei
   * "Bewegung reduzieren" bleibt es beim Standbild. Das Standbild zeigt das
   * ENDE der Animation, damit niemand etwas verpasst.
   */
  video?: React.ReactNode;
}

export interface ScreenProps {
  title: string;
  /** Kurze Erklaerung unter der Ueberschrift. */
  intro?: string;
  easyIntro?: string;
  onSpeak?: (text: string) => void;
  /** Feststehender Bereich am unteren Rand, z. B. "Weiter". */
  footer?: React.ReactNode;
  /** Grosses Bild ueber der Ueberschrift, randlos ueber die volle Breite. */
  hero?: HeroBild;
  /**
   * Gebaerdensprache zu diesem Bildschirm. Steht direkt unter der
   * Ueberschrift -- wer sie braucht, soll nicht scrollen muessen.
   */
  dgs?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Grundgeruest jedes Bildschirms.
 *
 * - Genau eine Hauptueberschrift, die den Fokus beim Wechsel erhaelt.
 * - Inhalt scrollt immer, damit bei grosser Schrift nichts abgeschnitten wird
 *   (WCAG 1.4.10 Reflow).
 * - Der Vorlesen-Knopf liest Ueberschrift und Einleitung.
 */
export function Screen({ title, intro, easyIntro, onSpeak, footer, hero, dgs, children }: ScreenProps) {
  const theme = useTheme();
  const fenster = useWindowDimensions();
  const introText = theme.easyLanguage && easyIntro ? easyIntro : intro;
  const spoken = [title, introText].filter(Boolean).join('. ');

  // Das Bild laeuft ueber die volle Breite, nimmt aber hoechstens 45 Prozent
  // der Hoehe ein. Sonst muesste man bei grosser Schrift erst am Bild
  // vorbeiscrollen, bevor die erste Schaltflaeche auftaucht.
  const heroBreite = Math.min(fenster.width, breakpoints.wide);
  const heroHoehe = hero
    ? Math.round(Math.min(heroBreite / (hero.seitenverhaeltnis ?? 16 / 9), fenster.height * 0.45))
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.l,
          // Platz fuer die schwebende Bedienhilfen-Schaltflaeche: sonst
          // verdeckt sie dauerhaft das letzte Bedienelement
          // (WCAG 2.4.11 Fokus nicht verdeckt).
          paddingBottom: theme.spacing.xxxl * 2,
          gap: theme.spacing.l,
          maxWidth: breakpoints.wide,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {hero ? (
          <View
            style={{
              marginHorizontal: -theme.spacing.l,
              marginTop: -theme.spacing.l,
              marginBottom: theme.spacing.s,
            }}
          >
            {hero.video ? (
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={hero.altText}
                style={{ width: '100%', height: heroHoehe, backgroundColor: theme.colors.surface }}
              >
                {hero.video}
              </View>
            ) : (
              <Image
                source={hero.source}
                accessible
                accessibilityRole="image"
                accessibilityLabel={hero.altText}
                resizeMode="cover"
                style={{ width: '100%', height: heroHoehe, backgroundColor: theme.colors.surface }}
              />
            )}
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.s }}>
          <Heading level={1} accessible accessibilityRole="header">
            {title}
          </Heading>
          {introText ? <Text muted>{introText}</Text> : null}
          {onSpeak ? <SpeakButton text={spoken} onSpeak={onSpeak} contentLabel={title} /> : null}
          {dgs}
        </View>
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            padding: theme.spacing.l,
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            backgroundColor: theme.colors.background,
            gap: theme.spacing.m,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

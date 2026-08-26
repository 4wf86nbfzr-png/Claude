import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BEGLEITER,
  begleiterSchritt,
  fragenFuer,
  vorleseText,
  type BegleiterFrage,
} from '@miteinander/core';
import { Button, Callout, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../state/app-state';
import { useReadAloud } from '../state/speech';
import { DgsAbschnitt } from './DgsAbschnitt';

/**
 * Die Begleitung durch die App.
 *
 * Sie sitzt auf jedem Bildschirm gleich oben unter der Überschrift und
 * beantwortet vier Fragen: Wo bin ich, was kann ich hier tun, was passiert
 * danach, und was ist der nächste Schritt. Dazu eine feste Liste von
 * Rückfragen.
 *
 * Sie stellt sich als Figur vor -- mit Namen, damit man sie ansprechen kann.
 * Und sie sagt in derselben Zeile, dass sie kein Mensch ist. Eine Begleitung,
 * die sich für einen Menschen ausgeben würde, wäre genau das Dark Pattern,
 * das dieses Produkt nicht haben soll.
 *
 * Sie erzeugt keine Gebärden. Gebärdensprache kommt aus den produzierten
 * Videos -- und fehlt eines, sagt sie das.
 */
export function Begleiter({ schluessel }: { schluessel: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  // Ist Gebaerdensprache eingeschaltet, ist die Begleitung von vornherein
  // offen -- dann ist das Video der Hauptweg und kein Zusatz.
  const [offen, setOffen] = useState(prefs.signLanguage);
  const [gebaerdenZuerst, setGebaerdenZuerst] = useState(prefs.signLanguage);
  const [frage, setFrage] = useState<BegleiterFrage | null>(null);

  const schritt = begleiterSchritt(schluessel);
  if (!schritt) return null;

  if (!offen) {
    // Zwei Einstiege nebeneinander. Der zweite ist kein Umweg über die
    // Begleitung: wer Gebärdensprache braucht, soll das Wort auf dem Knopf
    // lesen und nicht erraten müssen, dass es dahinter liegt.
    return (
      <View style={{ marginTop: theme.spacing.xs, gap: theme.spacing.s }}>
        <Button
          label={`${BEGLEITER.name} fragen: Was ist das hier?`}
          variant="secondary"
          onPress={() => {
            setGebaerdenZuerst(false);
            setOffen(true);
          }}
          accessibilityHint="Öffnet die Begleitung. Sie erklärt diesen Bildschirm."
        />
        <Button
          label="In Gebärdensprache ansehen"
          variant="secondary"
          onPress={() => {
            setGebaerdenZuerst(true);
            setOffen(true);
          }}
          accessibilityHint="Öffnet das Video und den Text zu diesem Bildschirm."
        />
      </View>
    );
  }

  const woBinIch = prefs.easyLanguage ? schritt.woBinIchLeicht : schritt.woBinIch;

  /* Gebärdensprache gehört zur Begleitung: damit „spricht" sie. */
  const gebaerden = (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" muted>
        {BEGLEITER.gebaerdenHinweis}
      </Text>
      <DgsAbschnitt schluessel={schritt.dgsKey} standardOffen={gebaerdenZuerst} />
    </View>
  );

  return (
    <View
      style={{
        gap: theme.spacing.m,
        padding: theme.spacing.l,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.surface,
      }}
    >
      {/* Vorstellung und Selbstauskunft stehen zusammen -- nie getrennt. */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.m, alignItems: 'flex-start' }}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            borderWidth: 2,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceRaised,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="heading">🧭</Text>
        </View>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          <Text variant="heading" accessibilityRole="header">
            {BEGLEITER.name} – {BEGLEITER.rolle}
          </Text>
          <Text variant="caption" muted>
            {BEGLEITER.selbstauskunft}
          </Text>
        </View>
      </View>

      {gebaerdenZuerst ? gebaerden : null}

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label">Wo Sie gerade sind</Text>
        <Text>{woBinIch}</Text>
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label">Das können Sie hier tun</Text>
        {schritt.wasKannIchTun.map((punkt) => (
          <Text key={punkt} muted>
            • {punkt}
          </Text>
        ))}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="label">Was danach passiert</Text>
        <Text muted>{schritt.wasPassiertDann}</Text>
      </View>

      <Button
        label={`${BEGLEITER.name} vorlesen lassen`}
        variant="secondary"
        onPress={() => speak(vorleseText(schritt, prefs.easyLanguage))}
      />

      {gebaerdenZuerst ? null : gebaerden}

      <View style={{ gap: theme.spacing.s }}>
        <Text variant="label">Sie können mich das fragen</Text>
        {fragenFuer(schluessel).map((eintrag) => (
          <Button
            key={eintrag.frage}
            label={eintrag.frage}
            variant={frage?.frage === eintrag.frage ? 'primary' : 'secondary'}
            onPress={() => setFrage(frage?.frage === eintrag.frage ? null : eintrag)}
          />
        ))}
      </View>

      {frage ? (
        <View accessibilityLiveRegion="polite" style={{ gap: theme.spacing.s }}>
          <Callout tone="info" title={frage.frage}>
            {prefs.easyLanguage ? frage.antwortLeicht : frage.antwort}
          </Callout>
          <Button
            label="Antwort vorlesen"
            variant="quiet"
            onPress={() => speak(prefs.easyLanguage ? frage.antwortLeicht : frage.antwort)}
          />
        </View>
      ) : null}

      {schritt.weiter && schritt.weiter.ziel ? (
        <Button
          label={schritt.weiter.label}
          onPress={() => router.push(schritt.weiter!.ziel as never)}
        />
      ) : null}

      <Button label="Begleitung schließen" variant="quiet" onPress={() => setOffen(false)} />
    </View>
  );
}

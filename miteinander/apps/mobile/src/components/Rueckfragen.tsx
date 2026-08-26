import React, { useState } from 'react';
import { View } from 'react-native';
import { fragenFuer, type BegleiterFrage } from '@miteinander/core';
import { Button, Callout, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../state/app-state';
import { useReadAloud } from '../state/speech';

/**
 * Rueckfragen zu einem Bildschirm.
 *
 * Dasselbe, was die Begleitung sonst hinter einem Knopf anbietet -- hier
 * offen auf der Seite. Auf Mikas eigenen Bildschirmen waere ein Knopf
 * „Mika fragen" neben Mika selbst nur eine Tuer zu dem Raum, in dem man
 * schon steht.
 */
export function Rueckfragen({ schluessel, titel = 'Sie können mich das fragen' }: {
  schluessel: string;
  titel?: string;
}) {
  const theme = useTheme();
  const { prefs } = useAppState();
  const { speak } = useReadAloud(prefs);
  const [offen, setOffen] = useState<BegleiterFrage | null>(null);

  const fragen = fragenFuer(schluessel);
  if (fragen.length === 0) return null;

  return (
    <View style={{ gap: theme.spacing.s }}>
      <Text variant="label" accessibilityRole="header">
        {titel}
      </Text>
      {fragen.map((eintrag) => (
        <Button
          key={eintrag.frage}
          label={eintrag.frage}
          variant={offen?.frage === eintrag.frage ? 'primary' : 'secondary'}
          onPress={() => setOffen(offen?.frage === eintrag.frage ? null : eintrag)}
        />
      ))}
      {offen ? (
        <View accessibilityLiveRegion="polite" style={{ gap: theme.spacing.s }}>
          <Callout tone="info" title={offen.frage}>
            {prefs.easyLanguage ? offen.antwortLeicht : offen.antwort}
          </Callout>
          <Button
            label="Antwort vorlesen"
            variant="quiet"
            onPress={() => speak(prefs.easyLanguage ? offen.antwortLeicht : offen.antwort)}
          />
        </View>
      ) : null}
    </View>
  );
}

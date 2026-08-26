import React, { useState } from 'react';
import { View } from 'react-native';
import { DgsVideo, Button, useTheme } from '@miteinander/ui';
import { useAppState } from '../state/app-state';
import { dgsVideoQuelle } from '../inhalte/dgs-videos';
import { DgsPlayer } from './DgsPlayer';

/**
 * Gebärdensprache auf einem Bildschirm.
 *
 * Steht auf jedem Bildschirm, der einen Kernablauf zeigt -- nicht nur dort,
 * wo jemand die Einstellung gefunden hat. Wer Gebärdensprache braucht, soll
 * sie nicht erst freischalten müssen.
 *
 * Ist die Einstellung an, ist der Bereich offen. Sonst steht dort eine
 * Schaltfläche, die ihn öffnet.
 */
export function DgsAbschnitt({ schluessel }: { schluessel: string }) {
  const theme = useTheme();
  const { dgs, prefs } = useAppState();
  const [offen, setOffen] = useState(prefs.signLanguage);

  const item = dgs.get(schluessel);
  if (!item) return null;

  const quelle = dgsVideoQuelle(schluessel);

  if (!offen) {
    return (
      <View style={{ marginTop: theme.spacing.s }}>
        <Button
          label="In Gebärdensprache ansehen"
          variant="secondary"
          onPress={() => setOffen(true)}
          accessibilityHint="Öffnet das Video und den Text zu diesem Bildschirm."
        />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.s }}>
      <DgsVideo
        item={item}
        hatVideo={quelle !== undefined}
        renderPlayer={(inhalt) =>
          quelle === undefined ? null : <DgsPlayer item={inhalt} quelle={quelle} />
        }
      />
      {!prefs.signLanguage ? (
        <Button
          label="Gebärdensprache ausblenden"
          variant="quiet"
          onPress={() => setOffen(false)}
        />
      ) : null}
    </View>
  );
}

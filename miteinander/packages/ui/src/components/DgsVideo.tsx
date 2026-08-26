import React from 'react';
import { View } from 'react-native';
import { dgsStatusNotice, type DgsContentItem } from '@miteinander/core';
import { useTheme } from './ThemeProvider';
import { Text, Heading } from './Text';
import { Callout } from './Callout';
import { radius } from '../tokens/layout';

export interface DgsVideoProps {
  item: DgsContentItem | undefined;
  /** Wiedergabe uebernimmt die App-Ebene (expo-av); hier nur die Huelle. */
  renderPlayer?: (item: DgsContentItem) => React.ReactNode;
  title?: string;
}

/**
 * Baustein fuer Gebaerdensprach-Videos.
 *
 * Fehlt ein geprueftes Video, wird das ausdruecklich gesagt -- statt ein
 * Symbol zu zeigen, das eine Uebersetzung suggeriert, die es nicht gibt.
 * Ein vorhandenes Video bringt immer Untertitel und Transkript mit.
 */
export function DgsVideo({ item, renderPlayer, title }: DgsVideoProps) {
  const theme = useTheme();
  const notice = dgsStatusNotice(item);

  return (
    <View style={{ gap: theme.spacing.s }}>
      <Heading level={3}>{title ?? 'In Gebärdensprache'}</Heading>

      {notice ? (
        <Callout tone="info" title="Noch nicht verfügbar">
          {notice}
        </Callout>
      ) : null}

      {item && item.status === 'approved' && item.videoUrl ? (
        <View
          style={{
            borderRadius: radius.m,
            borderWidth: 2,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}
        >
          {renderPlayer ? renderPlayer(item) : null}
        </View>
      ) : null}

      {item?.transcript ? (
        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="label">Text zum Video</Text>
          <Text muted>{item.transcript}</Text>
        </View>
      ) : null}

      {item?.reviewedBy ? (
        <Text variant="caption" muted>
          Fachlich geprüft von: {item.reviewedBy}
        </Text>
      ) : null}
    </View>
  );
}

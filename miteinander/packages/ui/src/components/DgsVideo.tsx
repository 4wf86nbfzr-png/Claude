import React, { useState } from 'react';
import { View } from 'react-native';
import { dgsStatusNotice, type DgsContentItem } from '@miteinander/core';
import { useTheme } from './ThemeProvider';
import { Text, Heading } from './Text';
import { Callout } from './Callout';
import { Button } from './Button';

export interface DgsVideoProps {
  item: DgsContentItem | undefined;
  /** Die Wiedergabe liegt in der App (expo-video); hier nur die Hülle. */
  renderPlayer?: (item: DgsContentItem) => React.ReactNode;
  title?: string;
  /** Ist ein Video hinterlegt? Entscheidet die App anhand ihrer Dateien. */
  hatVideo?: boolean;
}

/**
 * Gebärdensprach-Baustein.
 *
 * Drei Dinge, immer in dieser Reihenfolge:
 *
 * 1. Der ehrliche Stand. Solange kein fachlich geprüftes Video vorliegt,
 *    steht das hier -- ohne Beschönigung. Ein gekennzeichnetes
 *    Platzhaltervideo bleibt ein Platzhalter.
 * 2. Das Video, wenn eines hinterlegt ist, mit vollständiger Bedienung.
 * 3. Der Text zum Video. Der ist immer da, auch ohne Video, und ist damit
 *    das Einzige, worauf man sich heute schon verlassen kann.
 */
export function DgsVideo({ item, renderPlayer, title, hatVideo }: DgsVideoProps) {
  const theme = useTheme();
  const [textOffen, setTextOffen] = useState(false);
  const hinweis = dgsStatusNotice(item);

  if (!item) {
    return (
      <Callout tone="info" title="Noch nicht verfügbar">
        Für diesen Bereich ist noch kein Inhalt in Gebärdensprache angelegt.
      </Callout>
    );
  }

  return (
    <View style={{ gap: theme.spacing.m }}>
      <Heading level={3}>{title ?? 'In Gebärdensprache'}</Heading>

      {hinweis ? (
        <Callout tone="warning" title="Noch kein geprüftes Video">
          {hinweis}
        </Callout>
      ) : null}

      {hatVideo && renderPlayer ? renderPlayer(item) : null}

      {item.transcript ? (
        <View style={{ gap: theme.spacing.s }}>
          <Button
            label={textOffen ? 'Text ausblenden' : 'Text zum Video anzeigen'}
            variant="secondary"
            onPress={() => setTextOffen((offen) => !offen)}
            accessibilityHint="Der vollständige Text zu diesem Video, zum Lesen."
          />
          {textOffen ? (
            <View
              style={{
                padding: theme.spacing.m,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                gap: theme.spacing.xs,
              }}
            >
              <Text variant="label">Text zum Video</Text>
              {item.untertitel.length > 0 ? (
                item.untertitel.map((zeile, index) => (
                  <Text key={`${zeile.von}-${index}`}>{zeile.text}</Text>
                ))
              ) : (
                <Text>{item.transcript}</Text>
              )}
            </View>
          ) : null}
        </View>
      ) : null}

      {item.reviewedBy ? (
        <Text variant="caption" muted>
          Fachlich geprüft von: {item.reviewedBy}
        </Text>
      ) : null}
    </View>
  );
}

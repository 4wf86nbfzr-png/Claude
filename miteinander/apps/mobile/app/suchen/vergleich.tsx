import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { buildComparison, findMatches, type ComparisonRow } from '@miteinander/core';
import { Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

/**
 * Screen 8: Vergleich von bis zu drei Vorschlägen.
 *
 * Als echte Tabelle mit Zeilenbeschriftung -- so kann ein Screenreader
 * Zeile fuer Zeile vorlesen. Die Tabelle scrollt waagerecht, der Text
 * bleibt dabei vollstaendig lesbar (kein Abschneiden).
 */
export default function Comparison() {
  const theme = useTheme();
  const { requestId, ids } = useLocalSearchParams<{ requestId?: string; ids?: string }>();
  const { service, data, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ComparisonRow[]>([]);

  useEffect(() => {
    let active = true;
    if (!requestId) return;
    void (async () => {
      const request = await data.requests.get(requestId);
      if (!request) return;
      const records = await service.loadAllProviderRecords();
      const wanted = new Set((ids ?? '').split(',').filter(Boolean));
      const matches = findMatches(request, records, {
        today: new Date().toISOString().slice(0, 10),
      }).filter((m) => wanted.size === 0 || wanted.has(m.providerId));
      const comparison = buildComparison(matches, records);
      if (!active) return;
      setHeaders(comparison.headers);
      setRows(comparison.rows);
    })();
    return () => {
      active = false;
    };
  }, [requestId, ids, service, data]);

  const spoken = rows
    .map((row) => `${row.label}: ${row.values.map((v, i) => `${headers[i] ?? ''} ${v}`).join('; ')}`)
    .join('. ');

  return (
    <Screen
      title="Vergleich"
      intro="Hier sehen Sie die Vorschläge nebeneinander."
      easyIntro="Hier sehen Sie die Menschen nebeneinander."
      onSpeak={() => speak(spoken)}
    >
      {rows.length === 0 ? <Text muted>Wird geladen …</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ gap: theme.spacing.m }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.m }}>
            <View style={{ width: 160 }} />
            {headers.map((header) => (
              <Text key={header} variant="label" style={{ width: 220 }}>
                {header}
              </Text>
            ))}
          </View>

          {rows.map((row) => (
            <View
              key={row.label}
              accessible
              accessibilityLabel={`${row.label}. ${row.values
                .map((v, i) => `${headers[i] ?? ''}: ${v}`)
                .join('. ')}`}
              style={{
                flexDirection: 'row',
                gap: theme.spacing.m,
                paddingVertical: theme.spacing.s,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
              }}
            >
              <Text variant="label" style={{ width: 160 }}>
                {row.label}
              </Text>
              {row.values.map((value, index) => (
                <Text key={`${row.label}-${index}`} muted style={{ width: 220 }}>
                  {value}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Callout tone="info" title="Kein Ranking">
        Die Reihenfolge sagt nichts über den Wert eines Menschen. Sie zeigt nur, wie gut die Angaben
        zu Ihrer Anfrage passen.
      </Callout>
    </Screen>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  CONSENT_CATALOG,
  EXPORTABLE_ENTITIES,
  buildDeletionPlan,
  grantConsent,
  hasActiveConsent,
  revokeConsent,
  type ConsentRecord,
  type DeletionPlanItem,
} from '@miteinander/core';
import { Button, Callout, ChoiceCard, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';

/**
 * Screen 19: Datenschutz, Einwilligungen und Datenverwaltung.
 *
 * Jede Einwilligung steht fuer sich, ist erklaert und einzeln widerrufbar.
 * Vor einer Kontoloeschung sieht man genau, was wann geloescht wird -- und
 * was aus gesetzlichen Gruenden zunaechst nur gesperrt werden kann.
 */
export default function PrivacyScreen() {
  const theme = useTheme();
  const { data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [plan, setPlan] = useState<DeletionPlanItem[] | null>(null);

  const reload = useCallback(async () => {
    setConsents(await data.consents.forUser(currentUserId));
  }, [data, currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = async (purpose: (typeof CONSENT_CATALOG)[number]['purpose']) => {
    const existing = consents.find((c) => c.purpose === purpose && c.granted && !c.revokedAt);
    const now = new Date().toISOString();
    if (existing) {
      await data.consents.save(revokeConsent(existing, now));
    } else {
      await data.consents.save(
        grantConsent(currentUserId, purpose, now, { channel: 'tap', id: `c_${Date.now()}` }),
      );
    }
    await reload();
  };

  return (
    <Screen
      title="Ihre Daten"
      intro="Sie bestimmen, was wir verarbeiten dürfen. Jede Erlaubnis steht für sich."
      easyIntro="Hier bestimmen Sie über Ihre Daten."
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="privacy.overview" />}
    >
      <Text variant="heading" accessibilityRole="header">
        Ihre Erlaubnisse
      </Text>

      {CONSENT_CATALOG.map((item) => {
        const active = hasActiveConsent(consents, item.purpose);
        return (
          <View key={item.purpose} style={{ gap: theme.spacing.xs }}>
            <ChoiceCard
              title={item.title}
              description={item.explanation}
              easyDescription={item.easyExplanation}
              selected={active}
              onPress={() => void toggle(item.purpose)}
              onSpeak={speak}
            />
            {item.requiredForService ? (
              <Text variant="caption" muted>
                Ohne diese Zustimmung können Sie die App nicht nutzen.
              </Text>
            ) : null}
            {item.specialCategory ? (
              <Text variant="caption" muted>
                Besonders geschützte Angaben. Freiwillig und jederzeit widerrufbar.
              </Text>
            ) : null}
          </View>
        );
      })}

      <Text variant="heading" accessibilityRole="header">
        Ihre Daten mitnehmen
      </Text>
      <Text muted>
        Sie können alle Ihre Daten herunterladen: {EXPORTABLE_ENTITIES.join(', ')}.
      </Text>
      <Button
        label="Daten herunterladen"
        variant="secondary"
        onPress={() => speak('Der Export wird vorbereitet. Sie bekommen eine Nachricht, sobald er fertig ist.')}
      />

      <Text variant="heading" accessibilityRole="header">
        Konto löschen
      </Text>
      <Button
        label="Was passiert beim Löschen?"
        variant="secondary"
        onPress={() => setPlan(buildDeletionPlan(new Date().toISOString()))}
      />

      {plan ? (
        <View style={{ gap: theme.spacing.s }}>
          {plan.map((item) => (
            <View key={item.entity} style={{ gap: theme.spacing.xs }}>
              <Text variant="label">
                {item.entity} –{' '}
                {item.action === 'delete'
                  ? 'wird gelöscht'
                  : item.action === 'anonymize'
                    ? 'wird anonymisiert'
                    : 'wird gesperrt'}
              </Text>
              <Text variant="caption" muted>
                {item.explanation}
              </Text>
              <Text variant="caption" muted>
                Spätestens am {item.effectiveAt.slice(0, 10)}
              </Text>
            </View>
          ))}
          <Callout tone="warning" title="Das lässt sich nicht rückgängig machen">
            Bitte bestätigen Sie erst, wenn Sie sicher sind. Ein Sprachbefehl allein löscht Ihr
            Konto nie.
          </Callout>
          <Button
            label="Konto endgültig löschen"
            variant="danger"
            onPress={() => speak('Im Demo-Modus wird nichts gelöscht.')}
          />
        </View>
      ) : null}

      <Callout tone="info" title="Barrierefreiheits-Erklärung">
        Diese App wird nach WCAG 2.2 AA entwickelt. Der aktuelle Stand, bekannte Einschränkungen und
        der Weg zur Rückmeldung stehen unter „Hilfe“.
      </Callout>
    </Screen>
  );
}

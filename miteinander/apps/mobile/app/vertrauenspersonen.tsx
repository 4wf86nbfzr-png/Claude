import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { TrustedAccessGrant, TrustedScope } from '@miteinander/core';
import { Button, Callout, ChoiceCard, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';

/**
 * Screen 17: Vertrauenspersonen und Berechtigungen.
 *
 * Grundsatz: Die unterstuetzungssuchende Person bleibt im Mittelpunkt. Sie
 * legt fest, was eine Vertrauensperson darf, sieht das jederzeit und kann es
 * jederzeit widerrufen. Nichts davon passiert im Hintergrund.
 */
const SCOPES: Array<{ key: TrustedScope; label: string; easy: string }> = [
  { key: 'view_profile', label: 'Mein Profil ansehen', easy: 'Die Person darf mein Profil sehen.' },
  { key: 'edit_profile', label: 'Mein Profil ändern', easy: 'Die Person darf mein Profil ändern.' },
  { key: 'create_requests', label: 'Anfragen für mich stellen', easy: 'Die Person darf Hilfe für mich suchen.' },
  { key: 'read_messages', label: 'Meine Nachrichten lesen', easy: 'Die Person darf meine Nachrichten lesen.' },
  { key: 'write_messages', label: 'Für mich schreiben', easy: 'Die Person darf für mich schreiben.' },
  { key: 'confirm_bookings', label: 'Termine für mich bestätigen', easy: 'Die Person darf Termine für mich zusagen.' },
  { key: 'manage_payments', label: 'Zahlungen verwalten', easy: 'Die Person darf sich um das Geld kümmern.' },
];

export default function TrustedPeople() {
  const theme = useTheme();
  const { data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);
  const [grants, setGrants] = useState<TrustedAccessGrant[]>([]);

  const reload = useCallback(async () => {
    setGrants(await data.trust.forSeeker(currentUserId));
  }, [data, currentUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = async (grant: TrustedAccessGrant, scope: TrustedScope) => {
    const has = grant.scopes.includes(scope);
    await data.trust.save({
      ...grant,
      scopes: has ? grant.scopes.filter((s) => s !== scope) : [...grant.scopes, scope],
    });
    await reload();
  };

  const revoke = async (grant: TrustedAccessGrant) => {
    await data.trust.save({ ...grant, revokedAt: new Date().toISOString() });
    await reload();
  };

  return (
    <Screen
      title="Vertrauenspersonen"
      intro="Sie entscheiden, wer Ihnen helfen darf und was diese Person darf."
      easyIntro="Hier bestimmen Sie: Wer darf mir helfen? Und was darf die Person?"
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="privacy.overview" />}
    >
      <Callout tone="info" title="Sie behalten die Entscheidung">
        Eine Vertrauensperson unterstützt Sie. Sie entscheidet nicht an Ihrer Stelle. Sie können
        jede Erlaubnis jederzeit beenden.
      </Callout>

      {grants.length === 0 ? (
        <Text muted>Sie haben noch niemandem eine Erlaubnis gegeben.</Text>
      ) : null}

      {grants.map((grant) => (
        <View key={grant.id} style={{ gap: theme.spacing.m }}>
          <Text variant="heading" accessibilityRole="header">
            {grant.trustedPersonId === 'u_trusted_1' ? 'Herr Kessler (Demo)' : grant.trustedPersonId}
          </Text>
          {grant.revokedAt ? (
            <Callout tone="warning" title="Beendet">
              Diese Erlaubnis wurde beendet. Die Person hat keinen Zugriff mehr.
            </Callout>
          ) : (
            <>
              {SCOPES.map((scope) => (
                <ChoiceCard
                  key={scope.key}
                  title={scope.label}
                  description={scope.easy}
                  selected={grant.scopes.includes(scope.key)}
                  onPress={() => void toggle(grant, scope.key)}
                />
              ))}
              {grant.legalBasisNote ? (
                <Text variant="caption" muted>
                  Vermerk: {grant.legalBasisNote}
                </Text>
              ) : null}
              <Button
                label="Erlaubnis jetzt beenden"
                variant="danger"
                onPress={() => void revoke(grant)}
                accessibilityHint="Die Person hat danach sofort keinen Zugriff mehr."
              />
            </>
          )}
        </View>
      ))}

      <Callout tone="info" title="Bei gesetzlicher Betreuung">
        Besteht eine rechtliche Betreuung, wird das gesondert vermerkt und geprüft. Auch dann gilt:
        Sie werden gefragt und einbezogen, soweit das möglich ist.
      </Callout>
    </Screen>
  );
}

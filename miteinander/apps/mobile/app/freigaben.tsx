import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  APPROVAL_KIND_LABELS,
  formatDateTimeGerman,
  mayEndApprovalAlone,
  type ApprovalRequest,
  type TrustedAccessGrant,
} from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../src/state/app-state';
import { useReadAloud } from '../src/state/speech';
import { DgsAbschnitt } from '../src/components/DgsAbschnitt';

/**
 * Was gerade auf eine Freigabe wartet -- aus Sicht der Person, um die es geht.
 *
 * Der Gegenpol zum Bereich für Verantwortliche: Es gibt keine Freigabe, von
 * der die Person nichts weiß, und keinen Einblick, den sie nicht sieht.
 * Ohne diesen Bildschirm wäre die Übersicht der verantwortlichen Person eine
 * heimliche Beobachtung.
 */
interface Eintrag {
  request: ApprovalRequest;
  responsibleName: string;
  text: string;
  easyText: string;
  ton: 'info' | 'warning' | 'success' | 'danger';
}

export default function MeineFreigaben() {
  const theme = useTheme();
  const { service, data, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [berechtigungen, setBerechtigungen] = useState<TrustedAccessGrant[]>([]);
  const [namen, setNamen] = useState<Record<string, string>>({});

  const laden = useCallback(async () => {
    setEintraege(await service.approvalStatusForSeeker(currentUserId));
    const grants = await data.trust.forSeeker(currentUserId);
    setBerechtigungen(grants);
    const zuordnung: Record<string, string> = {};
    for (const grant of grants) {
      const person = await data.users.get(grant.trustedPersonId);
      zuordnung[grant.trustedPersonId] = person?.displayName ?? grant.trustedPersonId;
    }
    setNamen(zuordnung);
  }, [service, data, currentUserId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const zurueckziehen = async (id: string) => {
    await service.withdrawApproval(id, currentUserId);
    await laden();
  };

  const beenden = async (grant: TrustedAccessGrant) => {
    await data.trust.save({ ...grant, approvalRequired: [], approvalLegalBasis: null });
    await laden();
  };

  return (
    <Screen
      title="Wer entscheidet mit"
      intro="Hier sehen Sie, was gerade auf eine Antwort wartet und wer was sehen darf."
      easyIntro="Hier sehen Sie:\nWer muss noch Ja sagen?\nUnd wer darf was sehen?"
      onSpeak={speak}
      dgs={<DgsAbschnitt schluessel="privacy.overview" />}
    >
      <Text variant="heading" accessibilityRole="header">
        Wartet auf eine Antwort
      </Text>
      {eintraege.filter((e) => e.request.status === 'pending').length === 0 ? (
        <Text muted>Gerade wartet nichts.</Text>
      ) : null}

      {eintraege
        .filter((e) => e.request.status === 'pending')
        .map((eintrag) => (
          <View key={eintrag.request.id} style={{ gap: theme.spacing.s }}>
            <Callout tone={eintrag.ton} title={APPROVAL_KIND_LABELS[eintrag.request.kind].label}>
              {prefs.easyLanguage ? eintrag.easyText : eintrag.text}
            </Callout>
            <Text variant="caption" muted>
              Angefragt am {formatDateTimeGerman(eintrag.request.createdAt)}
            </Text>
            <Button
              label="Ich möchte das doch nicht"
              variant="secondary"
              onPress={() => void zurueckziehen(eintrag.request.id)}
              accessibilityHint="Sie ziehen Ihr Anliegen zurück. Das können Sie immer."
            />
          </View>
        ))}

      <Text variant="heading" accessibilityRole="header">
        Schon beantwortet
      </Text>
      {eintraege.filter((e) => e.request.status !== 'pending').length === 0 ? (
        <Text muted>Noch nichts.</Text>
      ) : null}
      {eintraege
        .filter((e) => e.request.status !== 'pending')
        .map((eintrag) => (
          <Callout
            key={eintrag.request.id}
            tone={eintrag.ton}
            title={APPROVAL_KIND_LABELS[eintrag.request.kind].label}
          >
            {prefs.easyLanguage ? eintrag.easyText : eintrag.text}
          </Callout>
        ))}

      <Text variant="heading" accessibilityRole="header">
        Wer darf was
      </Text>
      {berechtigungen.length === 0 ? (
        <Text muted>Niemand hat Zugriff auf Ihre Angaben.</Text>
      ) : null}
      {berechtigungen.map((grant) => {
        const beendbar = mayEndApprovalAlone(grant);
        return (
          <View
            key={grant.id}
            style={{
              gap: theme.spacing.xs,
              padding: theme.spacing.l,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.surface,
            }}
          >
            <Text variant="heading" accessibilityRole="header">
              {namen[grant.trustedPersonId] ?? grant.trustedPersonId}
            </Text>
            <Text variant="caption" muted>
              {grant.revokedAt
                ? 'Beendet. Diese Person hat keinen Zugriff mehr.'
                : grant.responsibilityLevel === 'verantwortung'
                  ? 'Trägt Verantwortung und gibt bestimmte Schritte frei.'
                  : 'Hilft beim Bedienen. Entscheidet nichts.'}
            </Text>
            <Text muted>Darf sehen: {grant.scopes.join(', ') || 'nichts'}</Text>
            {grant.approvalRequired.length > 0 ? (
              <Text muted>
                Muss zustimmen bei:{' '}
                {grant.approvalRequired.map((k) => APPROVAL_KIND_LABELS[k].label).join(', ')}
              </Text>
            ) : null}
            {grant.legalBasisNote ? (
              <Text variant="caption" muted>
                {grant.legalBasisNote}
              </Text>
            ) : null}

            {!grant.revokedAt && grant.approvalRequired.length > 0 ? (
              beendbar.allowed ? (
                <Button
                  label="Ich möchte wieder allein entscheiden"
                  variant="secondary"
                  onPress={() => void beenden(grant)}
                  accessibilityHint={beendbar.reason}
                />
              ) : (
                <Callout tone="info" title="Das kann nur das Gericht ändern">
                  {beendbar.reason}
                </Callout>
              )
            ) : null}
          </View>
        );
      })}

      <Callout tone="info" title="Ihr gutes Recht">
        Sie können jederzeit fragen, warum jemand Nein gesagt hat. Und Sie können eine Erlaubnis,
        die Sie selbst gegeben haben, jederzeit wieder beenden.
      </Callout>
    </Screen>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  SERVICE_CATEGORIES,
  WIZARD_STEPS,
  buildRequestSummary,
  createDraft,
  finalizeDraft,
  stepProgress,
  validateStep,
  type FieldError,
  type RequestDraft,
  type WizardStepKey,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  EmergencyBar,
  ProgressSteps,
  Screen,
  Text,
  TextField,
  WhatHappensNext,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { Begleiter } from '../../src/components/Begleiter';
import { announce, useReadAloud } from '../../src/state/speech';

/**
 * Screen 5: "Wobei brauchst du Hilfe?" -- der gefuehrte Ablauf.
 *
 * Ein Hauptschritt pro Ansicht. Der Entwurf wird bei jeder Aenderung
 * gespeichert; niemand verliert Eingaben, weil die App wechselt oder das
 * Netz weg ist. Vor dem Absenden steht eine Zusammenfassung in Text,
 * Leichter Sprache, als Vorlese-Text und -- sobald produziert -- in DGS.
 */
export default function RequestWizard() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs, service, currentUserId, setActiveRequestId, sprachWunsch, setSprachWunsch } =
    useAppState();
  const { speak } = useReadAloud(prefs);

  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<RequestDraft>(() =>
    createDraft(`req_${Date.now()}`, currentUserId, new Date().toISOString()),
  );
  const [errors, setErrors] = useState<FieldError[]>([]);
  // Was die Sprachführung verstanden hat, steht sichtbar über der Auswahl --
  // solange, bis jemand es wegtippt.
  const [ausSprache, setAusSprache] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Vorbelegung aus der Sprachführung.
   *
   * Sie trägt ein, was verstanden wurde -- mehr nicht. Der Wunsch wird dabei
   * sofort geleert, damit er beim nächsten Mal nicht noch einmal greift, und
   * was er bewirkt hat, steht als Hinweis über der Auswahl. Wer die Anfrage
   * ohne Sprachführung öffnet, merkt von alldem nichts.
   */
  useEffect(() => {
    if (!sprachWunsch) return;
    const kategorien = sprachWunsch.kategorien;
    setDraft((current) => ({
      ...current,
      categoryKeys: kategorien,
      updatedAt: new Date().toISOString(),
    }));
    setAusSprache(sprachWunsch.gehoert);
    setSprachWunsch(null);
    announce(
      `Aus Ihrem Satz übernommen: ${kategorien
        .map((k) => SERVICE_CATEGORIES.find((c) => c.key === k)?.label ?? k)
        .join(', ')}. Sie können das ändern.`,
    );
  }, [sprachWunsch, setSprachWunsch]);

  const step = WIZARD_STEPS[stepIndex]!;
  const progress = stepProgress(step.key as WizardStepKey);
  const now = new Date().toISOString();

  /** Jede Aenderung ist sofort ein gespeicherter Entwurf. */
  const patch = useCallback((changes: Partial<RequestDraft>) => {
    setDraft((current) => ({ ...current, ...changes, updatedAt: new Date().toISOString() }));
    announce('Ihre Eingaben sind als Entwurf gespeichert.');
  }, []);

  const errorFor = (field: string) => errors.find((e) => e.field === field);

  const goNext = () => {
    const found = validateStep(step.key as WizardStepKey, draft, now);
    setErrors(found);
    if (found.length > 0) {
      announce(`${found.length} Angabe fehlt noch. ${found[0]?.message ?? ''}`);
      return;
    }
    setStepIndex((i) => Math.min(WIZARD_STEPS.length - 1, i + 1));
  };

  const summary = useMemo(() => {
    if (step.key !== 'summary') return null;
    try {
      return buildRequestSummary(finalizeDraft(draft, now));
    } catch {
      return null;
    }
  }, [step.key, draft, now]);

  const submit = async () => {
    setSubmitError(null);
    try {
      const request = await service.submitRequest(draft);
      setActiveRequestId(request.id);
      router.push({ pathname: '/suchen/vorschlaege', params: { requestId: request.id } });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Es hat nicht geklappt.');
    }
  };

  return (
    <Screen
      title={prefs.easyLanguage ? step.title : step.formalTitle}
      intro={step.help}
      onSpeak={speak}
      dgs={<Begleiter schluessel={`anfrage.${step.key}`} />}
      footer={
        <ButtonStack>
          {step.key === 'summary' ? (
            <Button
              label="Anfrage jetzt absenden"
              onPress={() => void submit()}
              accessibilityHint="Ihre Anfrage geht an passende Personen. Sie können sie später zurückziehen."
            />
          ) : (
            <Button label="Weiter" onPress={goNext} />
          )}
          {stepIndex > 0 ? (
            <Button label="Zurück" variant="secondary" onPress={() => setStepIndex((i) => i - 1)} />
          ) : null}
        </ButtonStack>
      }
    >
      <ProgressSteps index={progress.index} total={progress.total} label={step.formalTitle} />

      {step.key === 'what' ? (
        <View style={{ gap: theme.spacing.m }}>
          {ausSprache ? (
            <Callout tone="info" title={`Aus Ihrem Satz: „${ausSprache.trim()}“`}>
              Ich habe schon angekreuzt, worum es geht. Stimmt das nicht? Tippen Sie es einfach an
              oder wieder ab – nichts davon ist schon abgeschickt.
            </Callout>
          ) : null}
          {SERVICE_CATEGORIES.map((category) => {
            const selected = draft.categoryKeys.includes(category.key);
            return (
              <ChoiceCard
                key={category.key}
                testID={`cat-${category.key}`}
                title={category.label}
                description={
                  category.requiresLicensedProfessional
                    ? `${category.easyLabel} Diese Anfrage sehen nur geprüfte Fachkräfte.`
                    : category.easyLabel
                }
                easyDescription={category.easyLabel}
                selected={selected}
                onSpeak={speak}
                onPress={() =>
                  patch({
                    categoryKeys: selected
                      ? draft.categoryKeys.filter((k) => k !== category.key)
                      : [...draft.categoryKeys, category.key],
                  })
                }
              />
            );
          })}
          {errorFor('categoryKeys') ? (
            <Callout tone="danger" title="Das fehlt noch">
              {`${errorFor('categoryKeys')!.message} ${errorFor('categoryKeys')!.howToFix}`}
            </Callout>
          ) : null}
        </View>
      ) : null}

      {step.key === 'when' ? (
        <View style={{ gap: theme.spacing.l }}>
          <TextField
            testID="feld-zeitpunkt"
            label="Tag und Uhrzeit"
            hint="Zum Beispiel: 2026-03-04 10:00. Sie können auch die Spracheingabe nutzen."
            value={draft.startsAt ?? ''}
            onChangeText={(v) => patch({ startsAt: v })}
            required
            {...(errorFor('startsAt') ? { error: errorFor('startsAt')! } : {})}
          />
          <View style={{ gap: theme.spacing.s }}>
            <Text variant="label">Wie lange soll die Unterstützung dauern?</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
              {[30, 60, 90, 120, 180].map((minutes) => (
                <Button
                  key={minutes}
                  label={minutes < 60 ? `${minutes} Min.` : `${minutes / 60} Std.`}
                  variant={draft.durationMinutes === minutes ? 'primary' : 'secondary'}
                  fullWidth={false}
                  onPress={() => patch({ durationMinutes: minutes })}
                />
              ))}
            </View>
            {errorFor('durationMinutes') ? (
              <Callout tone="danger">{errorFor('durationMinutes')!.howToFix}</Callout>
            ) : null}
          </View>
          <View style={{ gap: theme.spacing.s }}>
            <Text variant="label">Wie oft?</Text>
            <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
              {(
                [
                  ['once', 'Einmal'],
                  ['weekly', 'Jede Woche'],
                  ['biweekly', 'Alle zwei Wochen'],
                  ['monthly', 'Jeden Monat'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  label={label}
                  variant={draft.recurrence === key ? 'primary' : 'secondary'}
                  fullWidth={false}
                  onPress={() => patch({ recurrence: key, recurrenceCount: key === 'once' ? undefined : 4 })}
                />
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {step.key === 'where' ? (
        <View style={{ gap: theme.spacing.l }}>
          <Callout tone="info" title="Ihre Adresse bleibt geheim">
            Andere sehen nur Ihren Ort und die ersten Ziffern der Postleitzahl. Die genaue Adresse
            geben Sie erst frei, wenn ein Termin fest steht.
          </Callout>
          <TextField
            testID="feld-ort"
            label="Ort"
            value={draft.region?.city ?? ''}
            autoComplete="off"
            onChangeText={(city) =>
              patch({
                region: {
                  postalPrefix: draft.region?.postalPrefix ?? '',
                  city,
                  approxLat: draft.region?.approxLat ?? 53.55,
                  approxLon: draft.region?.approxLon ?? 9.99,
                },
              })
            }
            required
            {...(errorFor('region') ? { error: errorFor('region')! } : {})}
          />
          <TextField
            testID="feld-postleitzahl"
            label="Erste Ziffern Ihrer Postleitzahl"
            hint="Zwei oder drei Ziffern genügen, zum Beispiel 221."
            keyboardType="number-pad"
            autoComplete="postal-code"
            value={draft.region?.postalPrefix ?? ''}
            onChangeText={(postalPrefix) =>
              patch({
                region: {
                  postalPrefix,
                  city: draft.region?.city ?? '',
                  approxLat: draft.region?.approxLat ?? 53.55,
                  approxLon: draft.region?.approxLon ?? 9.99,
                },
              })
            }
            required
          />
        </View>
      ) : null}

      {step.key === 'important' ? (
        <View style={{ gap: theme.spacing.l }}>
          <Text muted>
            Alle Angaben hier sind freiwillig. Sie helfen uns, passende Menschen zu finden.
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
            {[
              'Rollator',
              'Rollstuhl',
              'Leichte Sprache',
              'Gebärdensprache',
              'In Ruhe sprechen',
              'Geduld',
              'Erfahrung mit Demenz',
            ].map((tag) => {
              const selected = draft.importantToMe.includes(tag);
              return (
                <Button
                  key={tag}
                  label={selected ? `${tag} ✓` : tag}
                  variant={selected ? 'primary' : 'secondary'}
                  fullWidth={false}
                  onPress={() =>
                    patch({
                      importantToMe: selected
                        ? draft.importantToMe.filter((t) => t !== tag)
                        : [...draft.importantToMe, tag],
                    })
                  }
                />
              );
            })}
          </View>
          <TextField
            label="Möchten Sie noch etwas dazu sagen?"
            hint="Zum Beispiel: Ich brauche etwas mehr Zeit beim Gehen."
            multiline
            value={draft.description}
            onChangeText={(description) => patch({ description })}
          />
        </View>
      ) : null}

      {step.key === 'summary' && summary ? (
        <View style={{ gap: theme.spacing.l }}>
          <View style={{ gap: theme.spacing.s }}>
            {summary.lines.map((line) => (
              <View key={line.label} style={{ gap: theme.spacing.xs }}>
                <Text variant="label">{line.label}</Text>
                <Text muted>{line.value}</Text>
              </View>
            ))}
          </View>

          <Callout tone="info" title="In Leichter Sprache">
            {summary.easyText}
          </Callout>

          <Button
            label="Zusammenfassung vorlesen"
            variant="secondary"
            onPress={() => speak(summary.speechText)}
          />

          <WhatHappensNext text={summary.whatHappensNext} />

          {submitError ? (
            <Callout tone="danger" title="Es hat nicht geklappt">
              {submitError}
            </Callout>
          ) : null}
        </View>
      ) : null}

      <EmergencyBar compact />
    </Screen>
  );
}

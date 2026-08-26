import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  PROVIDER_KIND_LABELS,
  QUALIFICATIONS,
  appConfig,
  type ProviderKind,
} from '@miteinander/core';
import {
  Button,
  ButtonStack,
  Callout,
  ChoiceCard,
  ProgressSteps,
  Screen,
  Text,
  TextField,
  useTheme,
} from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';

/**
 * Screen 13: Anbieter-Onboarding.
 *
 * Die gewaehlte Rolle ist zunaechst nur eine Selbstauskunft. Oeffentlich
 * angezeigt wird sie erst, wenn die Nachweise geprueft sind -- bis dahin
 * steht im Profil "private Unterstuetzungsperson".
 */
const KINDS: ProviderKind[] = ['professional', 'qualified_companion', 'private_helper'];

const KIND_DESCRIPTIONS: Record<ProviderKind, string> = {
  professional:
    'Sie haben eine Ausbildung, zum Beispiel Heilerziehungspflege oder Pflegefachkraft. Nur mit geprüftem Nachweis dürfen Sie pflegerische Anfragen sehen.',
  qualified_companion:
    'Sie haben eine Qualifikation als Alltagsbegleitung, aber keine pflegerische Ausbildung.',
  private_helper:
    'Sie möchten ehrenamtlich oder nebenbei helfen. Sie brauchen keine Ausbildung, aber eine geprüfte Identität.',
};

export default function ProviderOnboarding() {
  const theme = useTheme();
  const router = useRouter();
  const { prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<ProviderKind | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [uploaded, setUploaded] = useState<string[]>([]);

  const steps = ['Rolle', 'Angaben', 'Nachweise'];

  return (
    <Screen
      title="Unterstützung anbieten"
      intro="In drei Schritten. Sie können jederzeit unterbrechen – Ihre Angaben bleiben gespeichert."
      onSpeak={speak}
      footer={
        <ButtonStack>
          {step < 2 ? (
            <Button
              label="Weiter"
              onPress={() => setStep((s) => s + 1)}
              disabled={step === 0 ? !kind : !ageConfirmed || !name.trim() || !email.trim()}
            />
          ) : (
            <Button label="Zu meinem Leistungsprofil" onPress={() => router.push('/anbieten/leistungen')} />
          )}
          {step > 0 ? (
            <Button label="Zurück" variant="secondary" onPress={() => setStep((s) => s - 1)} />
          ) : null}
        </ButtonStack>
      }
    >
      <ProgressSteps index={step + 1} total={steps.length} label={steps[step]} />

      {step === 0 ? (
        <View style={{ gap: theme.spacing.m }}>
          {KINDS.map((k) => (
            <ChoiceCard
              key={k}
              title={PROVIDER_KIND_LABELS[k]}
              description={KIND_DESCRIPTIONS[k]}
              selected={kind === k}
              onPress={() => setKind(k)}
              onSpeak={speak}
            />
          ))}
          <Callout tone="info" title="Titel erst nach Prüfung">
            Fachliche Bezeichnungen erscheinen im Profil erst, wenn wir Ihre Nachweise geprüft
            haben. Vorher steht dort „private Unterstützungsperson“.
          </Callout>
        </View>
      ) : null}

      {step === 1 ? (
        <View style={{ gap: theme.spacing.l }}>
          <TextField label="Ihr Name" value={name} onChangeText={setName} autoComplete="name" required />
          <TextField
            label="E-Mail-Adresse"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            keyboardType="email-address"
            required
          />
          <ChoiceCard
            title={`Ich bin mindestens ${appConfig.minimumAge} Jahre alt`}
            description="Für dieses Angebot müssen Sie volljährig sein."
            selected={ageConfirmed}
            onPress={() => setAgeConfirmed((v) => !v)}
          />
          <Callout tone="info" title="Warum wir das fragen">
            Die App vermittelt Unterstützung im persönlichen Umfeld. Deshalb prüfen wir Identität
            und Alter, bevor Sie Anfragen sehen.
          </Callout>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: theme.spacing.m }}>
          <Text muted>
            Laden Sie Ihre Nachweise hoch. Wir prüfen jeden einzeln und sagen Ihnen, was geprüft
            wurde.
          </Text>
          {QUALIFICATIONS.map((q) => {
            const done = uploaded.includes(q.key);
            return (
              <ChoiceCard
                key={q.key}
                title={q.label}
                description={
                  q.licensesProfessionalWork
                    ? 'Berechtigt zu pflegerischen Tätigkeiten. Wird von zwei Personen geprüft.'
                    : q.expires
                      ? 'Muss regelmäßig erneuert werden. Wir erinnern Sie rechtzeitig.'
                      : 'Einmalige Prüfung.'
                }
                selected={done}
                onPress={() =>
                  setUploaded((current) =>
                    done ? current.filter((k) => k !== q.key) : [...current, q.key],
                  )
                }
              />
            );
          })}
          <Callout tone="warning" title="Noch rechtlich zu klären">
            Welche Nachweise verpflichtend sind – erweitertes Führungszeugnis, Versicherung,
            Gewerbeanmeldung, steuerliche Einordnung – hängt von der Tätigkeit ab und muss vor dem
            Produktivstart von einer Fachperson festgelegt werden. Der Prüfprozess ist dafür
            konfigurierbar angelegt.
          </Callout>
        </View>
      ) : null}
    </Screen>
  );
}

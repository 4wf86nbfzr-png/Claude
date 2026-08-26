import React, { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  NIE_IM_KALENDER,
  baueEinzelEintrag,
  baueKalenderFeed,
  baueKalenderVerbindung,
  eintragsTitel,
  formatDateTimeGerman,
  formatDuration,
  type Booking,
  type Notification,
} from '@miteinander/core';
import { Button, Callout, Screen, Text, useTheme } from '@miteinander/ui';
import { useAppState } from '../../src/state/app-state';
import { useReadAloud } from '../../src/state/speech';
import { Begleiter } from '../../src/components/Begleiter';
import { legeInKalender, teileDatei } from '../../src/kalender/geraetekalender';

/**
 * Planer für Anbietende.
 *
 * Zwei Wege in den Kalender auf dem privaten Handy:
 *
 *  1. Einzelner Einsatz -- eine .ics-Datei, die jeder Kalender versteht.
 *     Gut, wenn man nur einen Termin übernehmen will.
 *  2. Dauerhaft verbinden -- ein Abo-Link. Der Kalender holt sich Änderungen
 *     dann selbst, auch Absagen.
 *
 * Was im Kalender landet, ist bewusst wenig: Tätigkeit, Zeit, Treffpunkt.
 * Kein Name, keine Adresse, nichts zur Gesundheit. Ein Handy-Kalender ist
 * kein geschützter Ort -- Einträge stehen auf dem Sperrbildschirm und werden
 * oft mit einem Firmenkonto abgeglichen.
 */
function wochenStart(datum: Date): Date {
  const d = new Date(datum);
  const tag = (d.getUTCDay() + 6) % 7; // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export default function Planer() {
  const theme = useTheme();
  const router = useRouter();
  const { data, service, currentUserId, prefs } = useAppState();
  const { speak } = useReadAloud(prefs);

  const [einsaetze, setEinsaetze] = useState<Booking[]>([]);
  const [anfragen, setAnfragen] = useState<Notification[]>([]);
  const [versatz, setVersatz] = useState(0);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [verbindungOffen, setVerbindungOffen] = useState(false);
  const [schluessel, setSchluessel] = useState('demo-schluessel');

  const laden = useCallback(async () => {
    const alle = await data.bookings.forUser(currentUserId);
    setEinsaetze(
      alle
        .filter((b) => b.providerId === currentUserId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    );
    setAnfragen((await service.unreadNotifications(currentUserId)).filter((n) => n.kind === 'message'));
  }, [data, service, currentUserId]);

  useEffect(() => {
    void laden();
  }, [laden]);

  const start = wochenStart(new Date(Date.now() + versatz * 7 * 86_400_000));
  const tage = Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const inWoche = einsaetze.filter((b) => {
    const t = new Date(b.startsAt).getTime();
    return t >= start.getTime() && t < start.getTime() + 7 * 86_400_000;
  });

  const inDenKalender = async (booking: Booking) => {
    const ics = baueEinzelEintrag(booking, { jetzt: new Date().toISOString() });
    const ergebnis = await legeInKalender(booking, ics);
    setMeldung(ergebnis.meldung);
  };

  const alleTeilen = async () => {
    const ics = baueKalenderFeed(einsaetze, { jetzt: new Date().toISOString() });
    const ergebnis = await teileDatei('miteinander-einsaetze.ics', ics);
    setMeldung(ergebnis.meldung);
  };

  const verbindung = baueKalenderVerbindung('https://app.miteinander.example', schluessel);

  return (
    <Screen
      title="Mein Planer"
      intro="Ihre Einsätze als Woche. Sie können sie in den Kalender auf Ihrem Handy legen."
      easyIntro={'Hier sehen Sie Ihre Arbeit.\nEine Woche auf einen Blick.'}
      onSpeak={speak}
      dgs={<Begleiter schluessel="planer" />}
    >
      {anfragen.length > 0 ? (
        <Callout tone="warning" title={`${anfragen.length} neue Anfrage${anfragen.length === 1 ? '' : 'n'}`}>
          {'Jemand sucht Unterstützung, die zu Ihnen passt. Was genau, sehen Sie erst, wenn Sie die Anfrage öffnen – in der Mitteilung steht nie der Inhalt.'}
        </Callout>
      ) : null}
      {anfragen.length > 0 ? (
        <Button
          label="Neue Anfragen ansehen"
          onPress={() => router.push('/anbieten/auftraege')}
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.s, flexWrap: 'wrap' }}>
        <Button
          label="Woche zurück"
          variant="secondary"
          fullWidth={false}
          onPress={() => setVersatz((v) => v - 1)}
        />
        <Button
          label="Diese Woche"
          variant={versatz === 0 ? 'primary' : 'secondary'}
          fullWidth={false}
          onPress={() => setVersatz(0)}
        />
        <Button
          label="Woche vor"
          variant="secondary"
          fullWidth={false}
          onPress={() => setVersatz((v) => v + 1)}
        />
      </View>

      <Text variant="heading" accessibilityRole="header">
        {`Woche ab ${start.getUTCDate()}. ${start.toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' })}`}
      </Text>

      {tage.map((tag, index) => {
        const desTages = inWoche.filter(
          (b) => new Date(b.startsAt).toISOString().slice(0, 10) === tag.toISOString().slice(0, 10),
        );
        return (
          <View
            key={tag.toISOString()}
            style={{
              gap: theme.spacing.s,
              paddingVertical: theme.spacing.m,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <Text variant="label">
              {WOCHENTAGE[index]}, {tag.getUTCDate()}.{tag.getUTCMonth() + 1}.
            </Text>
            {desTages.length === 0 ? (
              <Text variant="caption" muted>
                Kein Einsatz.
              </Text>
            ) : null}
            {desTages.map((booking) => (
              <View
                key={booking.id}
                style={{
                  gap: theme.spacing.xs,
                  padding: theme.spacing.m,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor:
                    booking.status === 'confirmed' ? theme.colors.accent : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <Text variant="label">
                  {booking.status === 'confirmed' ? '✓ Fest' : '● Noch nicht fest'}
                </Text>
                <Text variant="heading" accessibilityRole="header">
                  {eintragsTitel(booking)}
                </Text>
                <Text muted>{formatDateTimeGerman(booking.startsAt)}</Text>
                <Text muted>Dauer: {formatDuration(booking.durationMinutes)}</Text>
                <Text muted>Treffpunkt: {booking.meetingPointDescription}</Text>
                <Button
                  label="In meinen Kalender legen"
                  variant="secondary"
                  onPress={() => void inDenKalender(booking)}
                  accessibilityHint="Legt Tätigkeit, Zeit und Treffpunkt in den Kalender auf Ihrem Gerät. Ohne Namen."
                />
              </View>
            ))}
          </View>
        );
      })}

      {meldung ? <Callout tone="info" title="Kalender">{meldung}</Callout> : null}

      <Text variant="heading" accessibilityRole="header">
        Kalender dauerhaft verbinden
      </Text>
      <Text muted>
        Statt jeden Einsatz einzeln zu übertragen, können Sie Ihren Kalender einmal verbinden. Er
        holt sich Änderungen dann selbst – auch Absagen.
      </Text>
      <Button
        label={verbindungOffen ? 'Verbindung ausblenden' : 'Kalender verbinden'}
        variant="secondary"
        onPress={() => setVerbindungOffen((v) => !v)}
      />

      {verbindungOffen ? (
        <View style={{ gap: theme.spacing.m }}>
          <Callout tone="warning" title="Dieser Link ist wie ein Schlüssel">
            {verbindung.hinweis}
          </Callout>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="label">Adresse zum Abonnieren</Text>
            <Text selectable variant="caption">
              {verbindung.webcalUrl}
            </Text>
            <Text variant="caption" muted>
              Alternativ, falls Ihr Programm webcal nicht kennt: {verbindung.httpsUrl}
            </Text>
          </View>
          <Button
            label="Neuen Link erzeugen"
            variant="danger"
            onPress={() => {
              setSchluessel(`s${Math.abs(Date.now() % 1e9)}`);
              setMeldung('Der alte Link funktioniert ab sofort nicht mehr.');
            }}
            accessibilityHint="Der bisherige Link wird sofort ungültig."
          />
          <Button label="Alle Einsätze als Datei teilen" variant="secondary" onPress={() => void alleTeilen()} />
        </View>
      ) : null}

      <Callout tone="info" title="Was im Kalender steht">
        {`Nur Tätigkeit, Zeit und Treffpunkt. Nicht im Kalender stehen: ${NIE_IM_KALENDER.join(', ')}. Namen und Kontaktdaten bleiben in der App.`}
      </Callout>

      {Platform.OS === 'web' ? (
        <Text variant="caption" muted>
          In der Web-Fassung wird die Datei heruntergeladen. Auf dem Handy fragt die App den
          Kalender direkt.
        </Text>
      ) : null}
    </Screen>
  );
}

import type { Booking, ProviderProfile, SupportRequest } from '../domain/types';
import { getCategory } from '../domain/service-categories';
import { formatEuro } from './state-machine';

/**
 * Zusammenfassung vor jeder verbindlichen Handlung.
 *
 * Die App liefert denselben Inhalt in vier Formen: normaler Text, Leichte
 * Sprache, Vorlese-Skript und -- sofern produziert -- ein DGS-Video. Ohne
 * ausdrueckliche Bestaetigung passiert nichts.
 */
export interface ConfirmationSummary {
  title: string;
  /** Zeilen fuer die Anzeige: Beschriftung + Wert. */
  lines: Array<{ label: string; value: string }>;
  plainText: string;
  easyText: string;
  /** Fuer Text-zu-Sprache optimiert: kurze Saetze, ausgeschriebene Zahlen. */
  speechText: string;
  /** Schluessel im DGS-Katalog. Kann noch Platzhalter sein -- Status kommt aus dgs.ts. */
  dgsKey: string;
  /** Was nach der Bestaetigung passiert. */
  whatHappensNext: string;
  requiresExplicitConfirmation: true;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

export function formatDateTimeGerman(iso: string): string {
  const d = new Date(iso);
  const weekday = WEEKDAYS[d.getUTCDay()] ?? '';
  const month = MONTHS[d.getUTCMonth()] ?? '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${weekday}, ${d.getUTCDate()}. ${month} ${d.getUTCFullYear()}, ${hh}:${mm} Uhr`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} Minuten`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hoursLabel = h === 1 ? '1 Stunde' : `${h} Stunden`;
  return m === 0 ? hoursLabel : `${hoursLabel} und ${m} Minuten`;
}

export function buildBookingSummary(
  booking: Booking,
  provider: ProviderProfile,
  providerName: string,
): ConfirmationSummary {
  const activities = booking.categoryKeys.map((k) => getCategory(k)?.label ?? k).join(', ');
  const price = booking.volunteer ? 'ehrenamtlich, kostenlos' : formatEuro(booking.priceCents);
  const when = formatDateTimeGerman(booking.startsAt);
  const duration = formatDuration(booking.durationMinutes);

  const lines = [
    { label: 'Wer hilft', value: `${providerName} (${provider.headline})` },
    { label: 'Wobei', value: activities },
    { label: 'Wann', value: when },
    { label: 'Wie lange', value: duration },
    { label: 'Treffpunkt', value: booking.meetingPointDescription },
    { label: 'Kosten', value: price },
    { label: 'Wenn Sie absagen', value: booking.cancellationPolicy },
  ];
  if (booking.notes) lines.push({ label: 'Ihre Notiz', value: booking.notes });

  const plainText = lines.map((l) => `${l.label}: ${l.value}`).join('\n');

  const easyText = [
    `${providerName} hilft Ihnen.`,
    `Wobei: ${activities}.`,
    `Wann: ${when}.`,
    `Wie lange: ${duration}.`,
    `Wo: ${booking.meetingPointDescription}.`,
    booking.volunteer ? 'Es kostet nichts.' : `Es kostet ${price}.`,
    'Sie können den Termin später absagen.',
  ].join('\n');

  const speechText = [
    'Bitte hören Sie sich Ihre Buchung an.',
    `${providerName} hilft Ihnen bei ${activities}.`,
    `Der Termin ist am ${when}.`,
    `Er dauert ${duration}.`,
    `Sie treffen sich hier: ${booking.meetingPointDescription}.`,
    booking.volunteer ? 'Der Termin ist kostenlos.' : `Der Termin kostet ${price}.`,
    'Wenn alles stimmt, bestätigen Sie bitte.',
  ].join(' ');

  return {
    title: 'Bitte prüfen Sie Ihre Buchung',
    lines,
    plainText,
    easyText,
    speechText,
    dgsKey: 'booking.summary',
    whatHappensNext: `Nach Ihrer Bestätigung bekommt ${providerName} eine Nachricht. Erst wenn ${providerName} auch bestätigt, ist der Termin fest. Sie sehen den Termin dann unter "Meine Termine".`,
    requiresExplicitConfirmation: true,
  };
}

/** Dieselbe Logik fuer die Unterstuetzungsanfrage vor dem Absenden. */
export function buildRequestSummary(request: SupportRequest): ConfirmationSummary {
  const activities = request.categoryKeys.map((k) => getCategory(k)?.label ?? k).join(', ');
  const when = formatDateTimeGerman(request.startsAt);
  const duration = formatDuration(request.durationMinutes);
  const recurrence =
    request.recurrence === 'once'
      ? 'einmalig'
      : request.recurrence === 'weekly'
        ? 'jede Woche'
        : request.recurrence === 'biweekly'
          ? 'alle zwei Wochen'
          : 'jeden Monat';

  const lines = [
    { label: 'Wobei brauchen Sie Hilfe', value: activities },
    { label: 'Wann', value: when },
    { label: 'Wie lange', value: duration },
    { label: 'Wie oft', value: recurrence },
    { label: 'Wo ungefähr', value: `${request.region.city} (${request.region.postalPrefix}…)` },
    { label: 'Was Ihnen wichtig ist', value: request.importantToMe.join(', ') || 'keine Angabe' },
  ];
  if (request.requiresLicensedProfessional) {
    lines.push({
      label: 'Hinweis',
      value: 'Diese Anfrage sehen nur geprüfte Fachkräfte.',
    });
  }

  return {
    title: 'Bitte prüfen Sie Ihre Anfrage',
    lines,
    plainText: lines.map((l) => `${l.label}: ${l.value}`).join('\n'),
    easyText: [
      `Sie brauchen Hilfe bei: ${activities}.`,
      `Wann: ${when}.`,
      `Wie lange: ${duration}.`,
      `Wo: in ${request.region.city}.`,
      'Sie können die Anfrage danach noch ändern.',
    ].join('\n'),
    speechText: `Sie brauchen Hilfe bei ${activities}. Der Termin ist am ${when} und dauert ${duration}. Der Ort ist ${request.region.city}. Wenn das stimmt, senden Sie die Anfrage ab.`,
    dgsKey: 'request.summary',
    whatHappensNext:
      'Ihre Anfrage wird an passende Personen geschickt. Sie bekommen eine Nachricht, sobald jemand antwortet. Ihre genaue Adresse und Ihre Telefonnummer bleiben geheim.',
    requiresExplicitConfirmation: true,
  };
}

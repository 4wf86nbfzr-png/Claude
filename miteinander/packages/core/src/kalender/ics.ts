import type { Booking, IsoDateTime } from '../domain/types';
import { getCategory } from '../domain/service-categories';

/**
 * Kalendereintraege nach RFC 5545 (iCalendar).
 *
 * Zweck: Einsaetze aus dem Planer landen im privaten Kalender auf dem Handy
 * -- iOS, Android, Outlook, alles versteht dieses Format.
 *
 * Der wichtigste Teil dieses Moduls ist, was NICHT im Eintrag steht.
 * Ein Handy-Kalender ist kein geschuetzter Ort: Eintraege erscheinen auf dem
 * Sperrbildschirm, werden mit Firmenkonten synchronisiert und von anderen
 * Apps gelesen. Deshalb enthaelt ein Eintrag nur Taetigkeit, Zeit und
 * Treffpunkt -- nie den Namen der unterstuetzten Person, nie ihre
 * Wohnadresse, nie Angaben zu ihrer Gesundheit.
 */

/** Angaben, die niemals in einen Kalendereintrag gehoeren. */
export const NIE_IM_KALENDER = [
  'Name der unterstützten Person',
  'Genaue Adresse',
  'Telefonnummer',
  'Angaben zum Unterstützungsbedarf',
  'Nachrichteninhalte',
] as const;

/** Zeitstempel im iCalendar-Format: 20260904T100000Z */
export function icsZeit(iso: IsoDateTime): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Ungültiger Zeitpunkt: ${iso}`);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Maskiert Sonderzeichen nach RFC 5545.
 * Ohne das zerreisst ein Komma im Text den ganzen Eintrag.
 */
export function icsText(wert: string): string {
  return wert
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// TextEncoder statt Buffer: React Native kennt Buffer nicht.
const oktette = (wert: string): number => new TextEncoder().encode(wert).length;

/**
 * Zeilen laenger als 75 Oktett muessen umbrochen werden. Manche Programme
 * verzeihen das nicht und verwerfen den Eintrag stillschweigend.
 */
export function falteZeile(zeile: string): string {
  if (oktette(zeile) <= 75) return zeile;

  const teile: string[] = [];
  let rest = zeile;
  let grenze = 75;
  while (oktette(rest) > grenze) {
    let schnitt = Math.min(grenze, rest.length);
    // Nie mitten in ein Mehrbyte-Zeichen schneiden.
    while (schnitt > 1 && oktette(rest.slice(0, schnitt)) > grenze) schnitt--;
    teile.push(rest.slice(0, schnitt));
    rest = rest.slice(schnitt);
    grenze = 74; // Folgezeilen beginnen mit einem Leerzeichen
  }
  teile.push(rest);
  return teile.join('\r\n ');
}

export interface IcsOptionen {
  /** Erinnerung in Minuten vor Beginn. 0 schaltet sie ab. */
  erinnerungMinuten?: number;
  /** Wird in der Kennung verwendet, damit Aktualisierungen greifen. */
  domain?: string;
  /** Fassung des Eintrags. Hoehere Zahl ersetzt die vorherige im Kalender. */
  sequenz?: number;
  /** Zeitpunkt der Erzeugung. Fuer Tests uebergebbar. */
  jetzt?: IsoDateTime;
}

/**
 * Titel eines Eintrags. Bewusst ohne Namen.
 * "Begleitung zu Terminen" sagt genug, um den Tag zu planen.
 */
export function eintragsTitel(booking: Booking): string {
  const taetigkeiten = booking.categoryKeys.map((k) => getCategory(k)?.label ?? k);
  return taetigkeiten.length > 0 ? taetigkeiten.join(', ') : 'Einsatz';
}

function endzeit(booking: Booking): string {
  return new Date(
    new Date(booking.startsAt).getTime() + booking.durationMinutes * 60_000,
  ).toISOString();
}

/** Ein einzelner Termin als VEVENT-Zeilen. */
export function baueEreignis(booking: Booking, optionen: IcsOptionen = {}): string[] {
  const domain = optionen.domain ?? 'helpmate.example';
  const jetzt = optionen.jetzt ?? new Date().toISOString();
  const erinnerung = optionen.erinnerungMinuten ?? 60;

  const zeilen = [
    'BEGIN:VEVENT',
    `UID:${booking.id}@${domain}`,
    `DTSTAMP:${icsZeit(jetzt)}`,
    `SEQUENCE:${optionen.sequenz ?? 0}`,
    `DTSTART:${icsZeit(booking.startsAt)}`,
    `DTEND:${icsZeit(endzeit(booking))}`,
    `SUMMARY:${icsText(eintragsTitel(booking))}`,
    // Nur der vereinbarte Treffpunkt -- nie die Wohnadresse.
    `LOCATION:${icsText(booking.meetingPointDescription)}`,
    `DESCRIPTION:${icsText(
      [
        booking.volunteer ? 'Ehrenamtlicher Einsatz.' : 'Vereinbarter Einsatz.',
        `Dauer: ${booking.durationMinutes} Minuten.`,
        'Namen und Kontaktdaten stehen nur in der App.',
      ].join('\n'),
    )}`,
    `STATUS:${
      booking.status === 'confirmed'
        ? 'CONFIRMED'
        : booking.status.startsWith('cancelled')
          ? 'CANCELLED'
          : 'TENTATIVE'
    }`,
    // Andere sollen im Kalender sehen, dass die Zeit belegt ist -- mehr nicht.
    'TRANSP:OPAQUE',
    'CLASS:PRIVATE',
  ];

  if (erinnerung > 0) {
    zeilen.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-PT${erinnerung}M`,
      `DESCRIPTION:${icsText(eintragsTitel(booking))}`,
      'END:VALARM',
    );
  }

  zeilen.push('END:VEVENT');
  return zeilen;
}

function huelle(inhalt: string[], name: string): string {
  return (
    [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Helpmate//Planer//DE',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsText(name)}`,
      'X-WR-TIMEZONE:Europe/Berlin',
      ...inhalt,
      'END:VCALENDAR',
    ]
      .map(falteZeile)
      .join('\r\n') + '\r\n'
  );
}

/** Ein einzelner Termin -- zum einmaligen Hinzufuegen. */
export function baueEinzelEintrag(booking: Booking, optionen: IcsOptionen = {}): string {
  return huelle(baueEreignis(booking, optionen), eintragsTitel(booking));
}

/** Alle Termine -- fuer den dauerhaft verbundenen Kalender. */
export function baueKalenderFeed(bookings: readonly Booking[], optionen: IcsOptionen = {}): string {
  const ereignisse = bookings.flatMap((b) => baueEreignis(b, optionen));
  return huelle(ereignisse, 'Helpmate – meine Einsätze');
}

/**
 * Adresse des verbundenen Kalenders.
 *
 * Der Schluessel im Link ist ein Ausweis: Wer ihn hat, sieht den Kalender.
 * Deshalb enthaelt der Feed nur das oben beschriebene Minimum, und der
 * Schluessel muss jederzeit neu vergeben werden koennen.
 */
export interface KalenderVerbindung {
  /** Zum Abonnieren im Kalender des Handys. */
  webcalUrl: string;
  /** Dieselbe Adresse als https -- manche Programme wollen das. */
  httpsUrl: string;
  schluessel: string;
  hinweis: string;
}

export function baueKalenderVerbindung(basisUrl: string, schluessel: string): KalenderVerbindung {
  const pfad = `${basisUrl.replace(/\/$/, '')}/kalender/${schluessel}.ics`;
  return {
    webcalUrl: pfad.replace(/^https?:/, 'webcal:'),
    httpsUrl: pfad,
    schluessel,
    hinweis:
      'Wer diesen Link hat, kann Ihre Einsatzzeiten sehen. Geben Sie ihn nicht weiter. Sie können jederzeit einen neuen Link erzeugen – der alte hört dann sofort auf zu funktionieren.',
  };
}

/**
 * Pruefung fuer den Test: Steht wirklich nichts Persoenliches im Eintrag?
 * Wird gegen die tatsaechlichen Personendaten gefahren.
 */
export function enthaeltPersonenbezug(ics: string, verbotene: readonly string[]): string[] {
  return verbotene.filter((wert) => wert.trim().length > 2 && ics.includes(wert));
}

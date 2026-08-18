import { foldUmlauts } from '../util/text';

export type FreigabeDeutung = 'FREIGEBEN' | 'ABLEHNEN' | 'UNKLAR';

/** Eindeutige Sendeaufforderungen (§2). */
const SENDEN = [
  'senden',
  'sende',
  'sende sie',
  'abschicken',
  'schick sie ab',
  'schick ab',
  'schicke sie ab',
  'rausschicken',
  'raus damit',
  'freigeben',
  'freigabe erteilen',
  'gib frei',
  'versand freigeben',
  'mail abschicken',
  'mail senden',
  'los schick',
  'jetzt senden'
];

/** Klare Absagen. */
const ABBRUCH = [
  'abbrechen',
  'abbruch',
  'stopp',
  'stop',
  'nicht senden',
  'nichts senden',
  'kein versand',
  'nicht abschicken',
  'verwerfen',
  'loeschen',
  'lieber nicht',
  'doch nicht',
  'halt',
  'warte',
  'nein'
];

/** Kurze Bestätigungen – zählen nur als Antwort auf eine gestellte Rückfrage. */
const KURZE_ZUSTIMMUNG = [
  'ja',
  'jawohl',
  'jup',
  'jep',
  'klar',
  'ok',
  'okay',
  'passt',
  'perfekt',
  'genau',
  'einverstanden',
  'bestaetigt',
  'bestaetige',
  'mach das',
  'genau so'
];

/** Signalisiert offene Änderungswünsche – dann nie freigeben. */
const VORBEHALT = [
  'aber',
  'vorher',
  'zuerst',
  'erst noch',
  'aendere',
  'aendern',
  'kuerzer',
  'laenger',
  'anders',
  'umschreiben',
  'ueberarbeite',
  'nochmal',
  'spaeter',
  'moment',
  'vielleicht',
  'eventuell',
  'glaube',
  'denke schon',
  'wohl',
  'koennte man'
];

function normalisieren(text: string): string {
  return ` ${foldUmlauts(text.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const enthaelt = (haystack: string, needle: string): boolean => haystack.includes(` ${needle} `);

/**
 * Deutet eine gesprochene oder getippte Äußerung als Freigabe, Absage oder
 * als unklar.
 *
 * Grundhaltung: im Zweifel UNKLAR. Lieber einmal zu viel nachfragen als eine
 * Mail zu senden, die so nicht gemeint war. Ein bloßes "ja" gilt nur, wenn
 * JARVIS unmittelbar zuvor die Freigabe erfragt hat.
 */
export function interpretApprovalUtterance(
  text: string,
  kontext: { frageGestellt: boolean } = { frageGestellt: false }
): FreigabeDeutung {
  const value = normalisieren(text);
  if (value.trim().length === 0) return 'UNKLAR';

  // Verneinung direkt vor einem Sendewort schlägt alles andere.
  for (const wort of SENDEN) {
    if (new RegExp(`\\b(nicht|kein|keine|niemals|noch nicht)\\b[^.]{0,20}\\b${wort}\\b`).test(value)) {
      return 'ABLEHNEN';
    }
  }
  for (const wort of ABBRUCH) {
    if (enthaelt(value, wort)) return 'ABLEHNEN';
  }

  const hatVorbehalt = VORBEHALT.some((wort) => enthaelt(value, wort));
  const hatSendewort = SENDEN.some((wort) => enthaelt(value, wort));

  if (hatSendewort) return hatVorbehalt ? 'UNKLAR' : 'FREIGEBEN';

  if (kontext.frageGestellt && !hatVorbehalt) {
    const woerter = value.trim().split(' ');
    // Kurze Antworten sind Antworten auf die Frage; lange Sätze sind neue Aufträge.
    if (woerter.length <= 4 && KURZE_ZUSTIMMUNG.some((wort) => enthaelt(value, wort))) {
      return 'FREIGEBEN';
    }
  }

  return 'UNKLAR';
}

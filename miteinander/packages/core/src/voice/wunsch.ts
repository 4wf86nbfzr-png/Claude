import { SERVICE_CATEGORIES, getCategory } from '../domain/service-categories';

/**
 * Absichtserkennung fuer die Sprachfuehrung.
 *
 * Jemand sagt "Ich moechte einen begleiteten Arztbesuch" -- daraus wird eine
 * Kategorie und ein Ziel in der App. Die Erkennung arbeitet mit einer festen
 * Wortliste, nicht mit einem Sprachmodell.
 *
 * Warum fest und nicht gelernt:
 *  - Sie ist pruefbar. Jede Zuordnung steht unten im Klartext, und der Test
 *    faehrt echte Saetze dagegen.
 *  - Sie irrt sich nachvollziehbar. Ein Modell, das "Arzt" mit "Pflege"
 *    verwechselt, wuerde eine erlaubnispflichtige Anfrage ausloesen.
 *  - Sie laeuft auf dem Geraet. Nichts von dem, was jemand sagt, verlaesst
 *    das Handy.
 *
 * Grundregel bleibt: Die Sprachfuehrung fuehrt hin und fuellt aus. Bestaetigt
 * wird immer auf dem Bildschirm (siehe IRREVERSIBLE_ACTIONS).
 */

export type WunschArt =
  | 'dienstleistung'
  | 'anbieten'
  | 'verantwortlich'
  | 'bedienhilfen'
  | 'termine'
  | 'hilfe'
  | 'notfall'
  | 'unklar';

export interface Wunsch {
  art: WunschArt;
  /** Erkannte Leistungskategorien, dringlichste zuerst. */
  kategorien: string[];
  /** Wohin die Fuehrung geht. Leer bei "unklar". */
  ziel: string;
  /** Was die Stimme daraufhin sagt. */
  antwort: string;
  antwortLeicht: string;
  /** 0 bis 1. Unter SICHER_AB wird nachgefragt statt gefuehrt. */
  sicherheit: number;
  /** Wortlaut, wie er verstanden wurde -- immer sichtbar. */
  gehoert: string;
}

/** Ab hier wird gefuehrt. Darunter fragt die Stimme nach. */
export const SICHER_AB = 0.5;

/**
 * Woerter je Kategorie. Bewusst Alltagssprache, nicht Fachsprache --
 * niemand sagt "Begleitung zu Terminen", man sagt "zum Arzt".
 */
const KATEGORIE_WOERTER: Record<string, string[]> = {
  begleitung_termine: [
    'arzt', 'aerztin', 'arztbesuch', 'arzttermin', 'praxis', 'krankenhaus', 'klinik',
    'amt', 'behoerde', 'buergeramt', 'jobcenter', 'termin begleiten', 'mitkommen',
    'begleiten', 'begleitung', 'zum arzt', 'zur aerztin', 'zahnarzt', 'therapie',
  ],
  einkaufen: ['einkauf', 'einkaufen', 'supermarkt', 'besorgung', 'lebensmittel', 'markt', 'apotheke'],
  freizeit_teilhabe: ['kino', 'cafe', 'kaffee trinken', 'verein', 'freizeit', 'konzert', 'ausflug', 'museum'],
  spaziergang: ['spazieren', 'spaziergang', 'frische luft', 'draussen', 'runde drehen', 'gassi'],
  vorlesen: ['vorlesen', 'brief lesen', 'post', 'buch', 'zeitung', 'lesen'],
  haushaltshilfe: ['haushalt', 'putzen', 'aufraeumen', 'waesche', 'abwasch', 'saubermachen'],
  technische_hilfe: ['handy', 'smartphone', 'computer', 'laptop', 'fernseher', 'technik', 'internet', 'wlan', 'drucker'],
  kommunikation: ['formular', 'antrag', 'brief verstehen', 'ausfuellen', 'erklaeren', 'behoerdenbrief', 'telefonieren'],
  fahrbegleitung: ['bus', 'bahn', 'zug', 'fahren', 'fahrt', 'auto', 'taxi', 'unterwegs'],
  alltagshilfe: ['alltag', 'kleinigkeit', 'etwas anderes', 'sonstiges'],
  pflegerische_unterstuetzung: ['pflege', 'koerperpflege', 'waschen', 'duschen', 'anziehen', 'windel'],
  medizinische_unterstuetzung: ['medikament', 'tablette', 'tabletten', 'spritze', 'verband', 'insulin', 'blutzucker'],
};

const ART_WOERTER: Array<{ art: WunschArt; woerter: string[]; ziel: string }> = [
  {
    art: 'notfall',
    woerter: ['notruf', 'notfall', 'gefahr', 'hundertzwoelf', '112', '110', 'polizei', 'krankenwagen', 'feuerwehr'],
    ziel: '/hilfe',
  },
  {
    art: 'anbieten',
    woerter: [
      'ich moechte helfen', 'ich will helfen', 'selbst helfen', 'anderen helfen',
      'ich biete', 'anbieten', 'helfen als', 'arbeiten als', 'ehrenamt', 'freiwillig',
    ],
    ziel: '/anbieten/onboarding',
  },
  {
    art: 'verantwortlich',
    woerter: ['verantwortlich', 'betreuer', 'betreuerin', 'fuer meine mutter', 'fuer meinen vater', 'angehoerige', 'vollmacht', 'freigabe'],
    ziel: '/verantwortlich',
  },
  {
    art: 'bedienhilfen',
    woerter: ['groesser', 'schrift', 'einstellen', 'einstellung', 'kontrast', 'vorlesen einschalten', 'leichte sprache', 'gebaerdensprache', 'bedienung'],
    ziel: '/bedienhilfen',
  },
  {
    art: 'termine',
    woerter: ['meine termine', 'welchen termin', 'wann habe ich', 'terminuebersicht', 'kalender'],
    ziel: '/suchen/termine',
  },
  {
    art: 'hilfe',
    woerter: ['beschwerde', 'problem melden', 'melden', 'ich komme nicht weiter', 'hilfe zur app'],
    ziel: '/hilfe',
  },
];

export function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function treffer(text: string, woerter: readonly string[]): number {
  return woerter.filter((w) => text.includes(normalisiere(w))).length;
}

/**
 * Wertet aus, was jemand gesagt hat.
 *
 * Reihenfolge ist Absicht: Der Notfall wird zuerst geprueft. Wer "Notruf"
 * sagt, soll nicht in einem Formular landen.
 */
export function ersteWunsch(gesagt: string): Wunsch {
  const text = normalisiere(gesagt);

  if (text.length === 0) {
    return {
      art: 'unklar',
      kategorien: [],
      ziel: '',
      antwort: 'Ich habe nichts verstanden. Sagen Sie es gern noch einmal – oder tippen Sie es.',
      antwortLeicht: 'Ich habe nichts gehört.\nBitte noch einmal.\nOder tippen Sie.',
      sicherheit: 0,
      gehoert: gesagt,
    };
  }

  const notfall = ART_WOERTER[0]!;
  if (treffer(text, notfall.woerter) > 0) {
    return {
      art: 'notfall',
      kategorien: [],
      ziel: notfall.ziel,
      antwort:
        'Wenn jemand in Gefahr ist, rufen Sie bitte 112 oder 110 an. Diese App ist kein Notruf. Ich zeige Ihnen die Nummern.',
      antwortLeicht: 'Ist jemand in Gefahr?\nDann rufen Sie an: 1 1 2.\nDiese App ist kein Notruf.',
      sicherheit: 1,
      gehoert: gesagt,
    };
  }

  // Leistungskategorien
  const bewertet = Object.entries(KATEGORIE_WOERTER)
    .map(([key, woerter]) => ({ key, punkte: treffer(text, woerter) }))
    .filter((e) => e.punkte > 0)
    .sort((a, b) => b.punkte - a.punkte);

  if (bewertet.length > 0) {
    const kategorien = bewertet.map((e) => e.key);
    const beste = kategorien[0]!;
    const label = getCategory(beste)?.label ?? beste;
    const erlaubnispflichtig = getCategory(beste)?.requiresLicensedProfessional === true;

    return {
      art: 'dienstleistung',
      kategorien,
      ziel: '/suchen/anfrage',
      antwort: erlaubnispflichtig
        ? `Verstanden: ${label}. Das darf nur eine geprüfte Fachkraft übernehmen – ich zeige Ihnen nur solche. Ich habe das schon ausgewählt. Als Nächstes brauche ich den Tag und die Uhrzeit.`
        : `Verstanden: ${label}. Ich habe das schon für Sie ausgewählt. Als Nächstes brauche ich den Tag und die Uhrzeit.`,
      antwortLeicht: `Sie brauchen Hilfe bei: ${label}.\nIch habe das schon eingetragen.\nJetzt kommt der Tag und die Uhrzeit.`,
      sicherheit: Math.min(1, 0.55 + 0.2 * (bewertet[0]?.punkte ?? 1)),
      gehoert: gesagt,
    };
  }

  // Andere Absichten
  for (const eintrag of ART_WOERTER.slice(1)) {
    const punkte = treffer(text, eintrag.woerter);
    if (punkte > 0) {
      return {
        art: eintrag.art,
        kategorien: [],
        ziel: eintrag.ziel,
        antwort: antwortFuer(eintrag.art),
        antwortLeicht: antwortLeichtFuer(eintrag.art),
        sicherheit: Math.min(1, 0.55 + 0.2 * punkte),
        gehoert: gesagt,
      };
    }
  }

  return {
    art: 'unklar',
    kategorien: [],
    ziel: '',
    antwort: `Ich habe „${gesagt.trim()}“ verstanden, weiß damit aber noch nichts anzufangen. Sagen Sie mir gern, wobei Sie Hilfe brauchen – zum Beispiel: Ich möchte zum Arzt begleitet werden.`,
    antwortLeicht: 'Das habe ich nicht verstanden.\nSagen Sie zum Beispiel:\nIch möchte zum Arzt.',
    sicherheit: 0.2,
    gehoert: gesagt,
  };
}

function antwortFuer(art: WunschArt): string {
  switch (art) {
    case 'anbieten':
      return 'Sie möchten anderen Menschen helfen. Ich bringe Sie zur Einrichtung Ihres Profils.';
    case 'verantwortlich':
      return 'Sie sind für einen Menschen verantwortlich. Ich bringe Sie zu Ihrer Übersicht.';
    case 'bedienhilfen':
      return 'Ich bringe Sie zu den Bedienhilfen. Dort stellen Sie Schrift, Farben, Vorlesen und Gebärdensprache ein.';
    case 'termine':
      return 'Ich zeige Ihnen Ihre Termine.';
    case 'hilfe':
      return 'Ich bringe Sie zur Hilfe. Dort können Sie auch ein Problem melden.';
    default:
      return 'Ich bringe Sie hin.';
  }
}

function antwortLeichtFuer(art: WunschArt): string {
  switch (art) {
    case 'anbieten':
      return 'Sie wollen helfen.\nIch zeige Ihnen, wie das geht.';
    case 'verantwortlich':
      return 'Sie kümmern sich um einen Menschen.\nIch zeige Ihnen Ihre Übersicht.';
    case 'bedienhilfen':
      return 'Ich zeige Ihnen die Einstellungen.';
    case 'termine':
      return 'Ich zeige Ihnen Ihre Termine.';
    case 'hilfe':
      return 'Ich zeige Ihnen die Hilfe.';
    default:
      return 'Ich bringe Sie hin.';
  }
}

/** Beispielsätze für den Bildschirm -- damit niemand raten muss. */
export const BEISPIEL_SAETZE = [
  'Ich möchte zum Arzt begleitet werden.',
  'Ich brauche Hilfe beim Einkaufen.',
  'Jemand soll mir die Post vorlesen.',
  'Ich möchte spazieren gehen.',
  'Ich möchte selbst helfen.',
  'Mach die Schrift größer.',
] as const;

/** Die Begrüßung, mit der die Sprachführung beginnt. */
export function begruessung(appName: string, leichteSprache: boolean): string {
  return leichteSprache
    ? `Hallo. Ich bin Mika von ${appName}. Was kann ich für Sie tun?`
    : `Hallo, ich bin Mika von ${appName}. Was kann ich für Sie tun? Sagen Sie es einfach – zum Beispiel: Ich möchte zum Arzt begleitet werden.`;
}

/** Kategorien, die aus einem Wunsch in den Anfrage-Entwurf uebernommen werden. */
export function kategorienFuerEntwurf(wunsch: Wunsch): string[] {
  const gueltig = new Set(SERVICE_CATEGORIES.map((c) => c.key));
  return wunsch.kategorien.filter((k) => gueltig.has(k)).slice(0, 3);
}

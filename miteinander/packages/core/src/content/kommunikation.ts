/**
 * Unterstuetzte Kommunikation.
 *
 * Fuer Menschen, die nicht oder nicht gut sprechen koennen. Die Person waehlt
 * Karten oder tippt, und das Geraet spricht fuer sie. Das Gegenueber
 * antwortet, und die Antwort erscheint als Text und -- wo ein geprueftes
 * Video vorliegt -- in Gebaerdensprache.
 *
 * Das ist kein Gebaerdensprach-Uebersetzer. Es ersetzt keine Dolmetschung.
 * Es ist das, was heute tatsaechlich funktioniert: ein Weg, sich verstaendlich
 * zu machen, wenn die Stimme fehlt.
 *
 * Die Saetze sind kurz und in der Ich-Form. Wer fuer sich selbst spricht,
 * soll nicht klingen wie ein Formular.
 */

export interface Karte {
  key: string;
  /** Was auf der Karte steht. */
  label: string;
  /** Was gesprochen wird -- oft laenger als die Beschriftung. */
  gesprochen: string;
  symbol: string;
}

export interface Kartengruppe {
  key: string;
  titel: string;
  titelLeicht: string;
  karten: Karte[];
}

export const KARTENGRUPPEN: Kartengruppe[] = [
  {
    key: 'antworten',
    titel: 'Kurze Antworten',
    titelLeicht: 'Ja und Nein',
    karten: [
      { key: 'ja', label: 'Ja', gesprochen: 'Ja.', symbol: '👍' },
      { key: 'nein', label: 'Nein', gesprochen: 'Nein.', symbol: '👎' },
      { key: 'vielleicht', label: 'Vielleicht', gesprochen: 'Vielleicht. Ich bin nicht sicher.', symbol: '🤔' },
      { key: 'moment', label: 'Einen Moment', gesprochen: 'Bitte warten Sie einen Moment.', symbol: '✋' },
      { key: 'danke', label: 'Danke', gesprochen: 'Danke.', symbol: '💛' },
      { key: 'bitte', label: 'Bitte', gesprochen: 'Bitte.', symbol: '🙏' },
    ],
  },
  {
    key: 'verstaendigung',
    titel: 'Verständigung',
    titelLeicht: 'Ich verstehe nicht',
    karten: [
      {
        key: 'nicht_verstanden',
        label: 'Ich habe das nicht verstanden',
        gesprochen: 'Ich habe das nicht verstanden. Bitte sagen Sie es noch einmal.',
        symbol: '❓',
      },
      {
        key: 'langsamer',
        label: 'Bitte langsamer',
        gesprochen: 'Bitte sprechen Sie langsamer.',
        symbol: '🐢',
      },
      {
        key: 'aufschreiben',
        label: 'Bitte aufschreiben',
        gesprochen: 'Bitte schreiben Sie es auf.',
        symbol: '✍️',
      },
      {
        key: 'gebaerdensprache',
        label: 'Ich nutze Gebärdensprache',
        gesprochen: 'Ich bin gehörlos und nutze Deutsche Gebärdensprache. Bitte schreiben Sie oder holen Sie eine dolmetschende Person dazu.',
        symbol: '🤟',
      },
      {
        key: 'nicht_sprechen',
        label: 'Ich kann nicht sprechen',
        gesprochen: 'Ich kann nicht sprechen. Ich antworte über dieses Gerät.',
        symbol: '💬',
      },
      {
        key: 'zeit',
        label: 'Ich brauche mehr Zeit',
        gesprochen: 'Ich brauche etwas mehr Zeit zum Antworten. Bitte warten Sie.',
        symbol: '⏳',
      },
    ],
  },
  {
    key: 'beim_termin',
    titel: 'Beim Termin',
    titelLeicht: 'Beim Treffen',
    karten: [
      { key: 'los', label: 'Wir können los', gesprochen: 'Wir können losgehen.', symbol: '🚶' },
      { key: 'pause', label: 'Ich brauche eine Pause', gesprochen: 'Ich brauche bitte eine Pause.', symbol: '🪑' },
      { key: 'langsam_gehen', label: 'Bitte langsam gehen', gesprochen: 'Bitte gehen Sie langsamer. Ich komme sonst nicht mit.', symbol: '🐌' },
      { key: 'toilette', label: 'Ich muss zur Toilette', gesprochen: 'Ich muss bitte zur Toilette.', symbol: '🚻' },
      { key: 'durst', label: 'Ich habe Durst', gesprochen: 'Ich habe Durst.', symbol: '🥤' },
      { key: 'nach_hause', label: 'Ich möchte nach Hause', gesprochen: 'Ich möchte gern nach Hause.', symbol: '🏠' },
    ],
  },
  {
    key: 'befinden',
    titel: 'Wie es mir geht',
    titelLeicht: 'Wie geht es mir',
    karten: [
      { key: 'gut', label: 'Mir geht es gut', gesprochen: 'Mir geht es gut.', symbol: '🙂' },
      { key: 'schmerzen', label: 'Ich habe Schmerzen', gesprochen: 'Ich habe Schmerzen.', symbol: '😣' },
      { key: 'unwohl', label: 'Mir ist unwohl', gesprochen: 'Mir ist nicht gut.', symbol: '😖' },
      { key: 'kalt', label: 'Mir ist kalt', gesprochen: 'Mir ist kalt.', symbol: '🥶' },
      { key: 'angst', label: 'Ich habe Angst', gesprochen: 'Ich habe Angst. Bitte bleiben Sie bei mir.', symbol: '😨' },
      { key: 'ueberfordert', label: 'Es ist mir zu viel', gesprochen: 'Es ist mir gerade zu viel. Ich brauche Ruhe.', symbol: '😵' },
    ],
  },
  {
    key: 'grenzen',
    titel: 'Meine Grenzen',
    titelLeicht: 'Das will ich nicht',
    karten: [
      { key: 'nicht_anfassen', label: 'Bitte nicht anfassen', gesprochen: 'Bitte fassen Sie mich nicht an.', symbol: '🚫' },
      { key: 'das_will_ich_nicht', label: 'Das möchte ich nicht', gesprochen: 'Das möchte ich nicht.', symbol: '✋' },
      { key: 'aufhoeren', label: 'Bitte aufhören', gesprochen: 'Bitte hören Sie damit auf.', symbol: '🛑' },
      { key: 'selbst', label: 'Das mache ich selbst', gesprochen: 'Das mache ich selbst, danke.', symbol: '💪' },
      { key: 'jemand_anders', label: 'Ich möchte mit jemand anderem sprechen', gesprochen: 'Ich möchte bitte mit jemand anderem sprechen.', symbol: '🔁' },
    ],
  },
];

const ALLE = new Map(KARTENGRUPPEN.flatMap((g) => g.karten.map((k) => [k.key, k] as const)));

export function karte(key: string): Karte | undefined {
  return ALLE.get(key);
}

/**
 * Baut aus gewaehlten Karten einen Satz zum Vorlesen.
 * Bewusst schlicht: aneinandergereihte Saetze, keine Grammatik-Akrobatik.
 * Wer etwas Genaueres sagen will, tippt es.
 */
export function baueAeusserung(keys: readonly string[], freitext = ''): string {
  const teile = keys.map((k) => ALLE.get(k)?.gesprochen).filter((t): t is string => !!t);
  const text = freitext.trim();
  if (text) teile.push(text.endsWith('.') || text.endsWith('?') ? text : `${text}.`);
  return teile.join(' ');
}

/**
 * Schnelle Antworten fuer das Gegenueber.
 * Damit die andere Seite nicht tippen muss und das Gespraech in Gang bleibt.
 */
export const GEGENUEBER_ANTWORTEN: Karte[] = [
  { key: 'verstanden', label: 'Ich habe Sie verstanden', gesprochen: 'Ich habe Sie verstanden.', symbol: '👌' },
  { key: 'wiederholen', label: 'Können Sie das wiederholen?', gesprochen: 'Können Sie das bitte wiederholen?', symbol: '🔁' },
  { key: 'zeit_lassen', label: 'Lassen Sie sich Zeit', gesprochen: 'Lassen Sie sich Zeit. Ich warte.', symbol: '⏳' },
  { key: 'ja_gerne', label: 'Ja, gerne', gesprochen: 'Ja, gerne.', symbol: '👍' },
  { key: 'nein_leider', label: 'Nein, das geht leider nicht', gesprochen: 'Nein, das geht leider nicht.', symbol: '👎' },
  { key: 'hole_hilfe', label: 'Ich hole jemanden dazu', gesprochen: 'Ich hole jemanden dazu, der helfen kann.', symbol: '🙋' },
];

/**
 * Wege zu echter Gebaerdensprach-Kommunikation.
 *
 * Ehrlich benannt: Was diese App leistet, und was sie nicht leistet.
 */
export interface Verstaendigungsweg {
  key: string;
  titel: string;
  beschreibung: string;
  /** "fertig" laeuft heute. "vorbereitet" braucht noch eine Anbindung. */
  stand: 'fertig' | 'vorbereitet';
  naechsterSchritt?: string;
}

export const VERSTAENDIGUNGSWEGE: Verstaendigungsweg[] = [
  {
    key: 'karten',
    titel: 'Karten und Text, die gesprochen werden',
    beschreibung:
      'Sie wählen Karten oder tippen. Das Gerät spricht für Sie. Das Gegenüber antwortet mit Karten oder Text.',
    stand: 'fertig',
  },
  {
    key: 'dgs_videos',
    titel: 'Geprüfte Videos in Gebärdensprache',
    beschreibung:
      'Zu allen Kernabläufen gibt es Videos, die von gehörlosen Menschen aufgenommen und geprüft werden. Sie erklären, was gerade passiert.',
    stand: 'vorbereitet',
    naechsterSchritt: 'Die Aufnahmen müssen produziert werden. Bis dahin sind es gekennzeichnete Platzhalter.',
  },
  {
    key: 'dolmetschen',
    titel: 'Dolmetschende Person per Video dazuholen',
    beschreibung:
      'Für Gespräche, in denen es auf jedes Wort ankommt – Arzt, Amt, Vertrag. Ein Mensch dolmetscht in Echtzeit.',
    stand: 'vorbereitet',
    naechsterSchritt:
      'Anbindung an einen Ferndolmetschdienst. Das ist der einzige Weg zu vollwertiger Gebärdensprache in beide Richtungen.',
  },
  {
    key: 'gebaerden_erkennung',
    titel: 'Gebärden mit der Kamera erkennen',
    beschreibung:
      'Die Kamera erkennt Gebärden und macht Text daraus. Das gibt es hier nicht.',
    stand: 'vorbereitet',
    naechsterSchritt:
      'Es gibt derzeit kein Verfahren, das zuverlässig genug wäre. Eine falsch erkannte Gebärde in einer Buchung oder Einwilligung hätte Folgen, die niemand bemerkt. Wir bauen das erst, wenn es trägt.',
  },
];

/** Was die App an dieser Stelle ausdruecklich NICHT behauptet. */
export const KEINE_UEBERSETZUNG =
  'Dies ist kein Gebärdensprach-Übersetzer. Deutsche Gebärdensprache ist eine eigene Sprache mit eigener Grammatik. Was Sie hier sehen, ist geschriebenes Deutsch und – wo vorhanden – ein geprüftes Video. Für wichtige Gespräche holen Sie bitte eine dolmetschende Person dazu.';

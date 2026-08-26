import type { RequiredDgsKey } from './dgs-skripte';

/**
 * Die Begleitung durch die App.
 *
 * Was sie ist: eine feste, nachvollziehbare Fuehrung. Sie sagt auf jedem
 * Bildschirm, wo man ist, was man hier tun kann, was danach passiert, und
 * bietet den naechsten Schritt an. Sie antwortet auf eine feste Liste von
 * Fragen -- in normaler Sprache, in Leichter Sprache, vorgelesen und in
 * Gebaerdensprache.
 *
 * Was sie NICHT ist:
 *
 *  - Kein Mensch. Sie sagt das selbst, auf jedem Bildschirm.
 *  - Keine gebaerdende Person. Sie erzeugt keine Gebaerden. Sie zeigt
 *    Videos, die von gehoerlosen Menschen aufgenommen und geprueft wurden.
 *    Fehlt ein Video, sagt sie das -- statt eine Uebersetzung vorzutaeuschen.
 *  - Kein Sprachmodell. Die Antworten stehen hier im Klartext. Nichts wird
 *    zur Laufzeit erzeugt, nichts verlaesst das Geraet. Eine Begleitung, die
 *    frei formuliert, koennte einer Person etwas Falsches ueber eine
 *    Buchung sagen -- und die haette es geglaubt.
 */

export interface BegleiterProfil {
  name: string;
  rolle: string;
  /** Was die Begleitung ist. Steht sichtbar in der Oberflaeche. */
  selbstauskunft: string;
  /** Wie sie es mit Gebaerdensprache haelt. Ebenfalls sichtbar. */
  gebaerdenHinweis: string;
}

export const BEGLEITER: BegleiterProfil = {
  name: 'Mika',
  rolle: 'Ihre Begleitung durch die App',
  selbstauskunft:
    'Ich bin ein Teil dieser App und kein Mensch. Ich zeige Ihnen, wo Sie gerade sind und was Sie hier tun können.',
  gebaerdenHinweis:
    'Ich gebärde nicht selbst. Ich zeige Ihnen Videos in Deutscher Gebärdensprache, die von gehörlosen Menschen aufgenommen und geprüft wurden. Solange ein Video fehlt, sage ich Ihnen das.',
};

export interface BegleiterFrage {
  frage: string;
  antwort: string;
  antwortLeicht: string;
}

export interface BegleiterSchritt {
  /** Bildschirm, zu dem diese Fuehrung gehoert. */
  key: string;
  titel: string;
  /** Wo bin ich? Ein Satz. */
  woBinIch: string;
  woBinIchLeicht: string;
  /** Was kann ich hier tun? Kurze Punkte. */
  wasKannIchTun: string[];
  /** Was passiert danach? */
  wasPassiertDann: string;
  dgsKey: RequiredDgsKey;
  /** Angebot fuer den naechsten Schritt. */
  weiter?: { label: string; ziel: string };
  fragen: BegleiterFrage[];
}

/** Fragen, die auf jedem Bildschirm gelten. */
export const ALLGEMEINE_FRAGEN: BegleiterFrage[] = [
  {
    frage: 'Ich verstehe das nicht.',
    antwort:
      'Das ist in Ordnung. Tippen Sie auf „Vorlesen“, dann lese ich Ihnen alles vor. Oder schalten Sie in den Bedienhilfen die Leichte Sprache ein – dann werden die Texte kürzer.',
    antwortLeicht:
      'Das ist nicht schlimm.\nTippen Sie auf: Vorlesen.\nOder stellen Sie Leichte Sprache ein.',
  },
  {
    frage: 'Wie komme ich zurück?',
    antwort:
      'Oben links ist ein Pfeil. Damit gehen Sie einen Schritt zurück. Ihre Eingaben bleiben gespeichert.',
    antwortLeicht: 'Oben links ist ein Pfeil.\nDamit gehen Sie zurück.\nIhre Eingaben bleiben da.',
  },
  {
    frage: 'Muss ich das jetzt entscheiden?',
    antwort:
      'Nein. Sie können jederzeit aufhören und später weitermachen. Nichts wird verschickt, bevor Sie ausdrücklich bestätigen.',
    antwortLeicht: 'Nein.\nSie können später weitermachen.\nEs passiert nichts ohne Ihr Ja.',
  },
  {
    frage: 'Ich brauche sofort Hilfe.',
    antwort:
      'Diese App ist kein Notruf. Wenn jemand in Gefahr ist, rufen Sie 112 oder 110 an. Für Probleme in der App tippen Sie unten auf „Hilfe“.',
    antwortLeicht:
      'Diese App ist kein Notruf.\nIst jemand in Gefahr?\nDann rufen Sie an: 1 1 2.',
  },
];

const SCHRITTE: BegleiterSchritt[] = [
  {
    key: 'start',
    titel: 'Start',
    woBinIch: 'Sie sind am Anfang. Hier entscheiden Sie, was Sie tun möchten.',
    woBinIchLeicht: 'Sie sind am Anfang.\nHier wählen Sie aus.',
    wasKannIchTun: [
      'Unterstützung suchen, wenn Sie Hilfe im Alltag brauchen.',
      'Unterstützung anbieten, wenn Sie anderen helfen möchten.',
      'Verantwortung übernehmen, wenn Sie für einen Menschen da sind.',
      'Die Bedienung einstellen: Schrift, Farben, Vorlesen, Gebärdensprache.',
    ],
    wasPassiertDann:
      'Sie kommen in den passenden Bereich. Wechseln können Sie jederzeit – es geht nichts verloren.',
    dgsKey: 'onboarding.mode_choice',
    weiter: { label: 'Ich suche Unterstützung', ziel: '/suchen/anfrage' },
    fragen: [
      {
        frage: 'Was kostet die App?',
        antwort:
          'Die App selbst kostet nichts. Manche Menschen helfen ehrenamtlich, andere bekommen Geld für ihre Arbeit. Der Preis steht immer vorher im Profil.',
        antwortLeicht: 'Die App kostet nichts.\nManche Hilfe kostet Geld.\nDer Preis steht vorher da.',
      },
      {
        frage: 'Wer sieht meine Daten?',
        antwort:
          'Nur so wenige wie möglich. Ihre genaue Adresse und Ihre Telefonnummer sieht niemand, bevor ein Termin fest steht und Sie das freigegeben haben.',
        antwortLeicht: 'Ihre Adresse sieht niemand.\nErst wenn ein Termin fest ist.\nUnd nur wenn Sie Ja sagen.',
      },
    ],
  },
  {
    key: 'bedienhilfen',
    titel: 'Bedienhilfen',
    woBinIch: 'Hier stellen Sie ein, wie die App für Sie aussehen und sprechen soll.',
    woBinIchLeicht: 'Hier stellen Sie die App ein.',
    wasKannIchTun: [
      'Den Bedienmodus wählen: Einfach, Standard oder Individuell.',
      'Die Schrift größer oder kleiner machen.',
      'Vorlesen, Leichte Sprache und Gebärdensprache einschalten.',
      'Die Schaltflächen größer machen.',
    ],
    wasPassiertDann:
      'Jede Änderung wirkt sofort. Die Einstellungen bleiben gespeichert, auch wenn Sie die App schließen.',
    dgsKey: 'onboarding.accessibility',
    fragen: [
      {
        frage: 'Was ist der Einfach-Modus?',
        antwort:
          'Sehr große Schaltflächen, ein Schritt pro Seite, Leichte Sprache und Vorlesen von Anfang an. Sie können jederzeit zurückwechseln, ohne etwas zu verlieren.',
        antwortLeicht:
          'Sehr große Knöpfe.\nWenig Text auf einer Seite.\nSie können zurück wechseln.',
      },
    ],
  },
  {
    key: 'anfrage.what',
    titel: 'Wobei brauchen Sie Hilfe?',
    woBinIch: 'Sie sind bei Schritt 1 von 5. Hier sagen Sie, wobei Sie Hilfe brauchen.',
    woBinIchLeicht: 'Das ist Schritt 1.\nWobei brauchen Sie Hilfe?',
    wasKannIchTun: [
      'Auf eine Karte tippen, die passt.',
      'Mehrere Karten auswählen.',
      'Sich jede Karte vorlesen lassen.',
    ],
    wasPassiertDann: 'Danach fragen wir nach dem Tag und der Uhrzeit.',
    dgsKey: 'request.step.what',
    weiter: { label: 'Weiter zu Tag und Uhrzeit', ziel: '' },
    fragen: [
      {
        frage: 'Was heißt „nur für geprüfte Fachkräfte“?',
        antwort:
          'Manche Aufgaben darf nur jemand mit einer Ausbildung machen, zum Beispiel Körperpflege. Solche Anfragen sehen nur Menschen, deren Ausbildung wir geprüft haben.',
        antwortLeicht:
          'Manche Hilfe darf nur eine Fachkraft machen.\nZum Beispiel bei der Körper-Pflege.',
      },
      {
        frage: 'Ich weiß nicht, was passt.',
        antwort:
          'Wählen Sie ruhig mehrere Karten. Sie können später noch schreiben, was Ihnen wichtig ist. Und Sie können alles wieder ändern.',
        antwortLeicht: 'Wählen Sie mehrere Karten.\nSie können alles wieder ändern.',
      },
    ],
  },
  {
    key: 'anfrage.when',
    titel: 'Wann brauchen Sie Hilfe?',
    woBinIch: 'Sie sind bei Schritt 2 von 5. Hier geht es um den Tag und die Uhrzeit.',
    woBinIchLeicht: 'Das ist Schritt 2.\nWann brauchen Sie Hilfe?',
    wasKannIchTun: [
      'Tag und Uhrzeit eingeben.',
      'Sagen, wie lange es dauern soll.',
      'Wählen, ob der Termin sich wiederholt.',
    ],
    wasPassiertDann: 'Danach fragen wir, wo Sie ungefähr wohnen.',
    dgsKey: 'request.step.when',
    fragen: [
      {
        frage: 'Was, wenn ich noch keinen Tag weiß?',
        antwort:
          'Wählen Sie einen Tag, der ungefähr passt. Sie können ihn später mit der Person absprechen und ändern.',
        antwortLeicht: 'Wählen Sie einen Tag.\nSie können ihn später ändern.',
      },
    ],
  },
  {
    key: 'anfrage.where',
    titel: 'Wo ungefähr?',
    woBinIch: 'Sie sind bei Schritt 3 von 5. Hier geht es um Ihren Ort.',
    woBinIchLeicht: 'Das ist Schritt 3.\nWo wohnen Sie ungefähr?',
    wasKannIchTun: ['Ihren Ort eingeben.', 'Die ersten Ziffern Ihrer Postleitzahl eingeben.'],
    wasPassiertDann: 'Danach fragen wir, was Ihnen wichtig ist. Das ist freiwillig.',
    dgsKey: 'request.step.where',
    fragen: [
      {
        frage: 'Warum wollen Sie meinen Ort wissen?',
        antwort:
          'Damit wir Menschen in Ihrer Nähe finden. Wir speichern nur den Ort und die ersten Ziffern der Postleitzahl. Ihre genaue Adresse sieht niemand.',
        antwortLeicht:
          'Wir suchen Menschen in Ihrer Nähe.\nIhre genaue Adresse sieht niemand.',
      },
    ],
  },
  {
    key: 'anfrage.important',
    titel: 'Was ist Ihnen wichtig?',
    woBinIch: 'Sie sind bei Schritt 4 von 5. Alles hier ist freiwillig.',
    woBinIchLeicht: 'Das ist Schritt 4.\nAlles hier ist freiwillig.',
    wasKannIchTun: [
      'Wörter antippen, die passen – zum Beispiel Rollstuhl oder Gebärdensprache.',
      'Etwas dazu schreiben.',
      'Diesen Schritt überspringen.',
    ],
    wasPassiertDann: 'Danach zeigen wir Ihnen alles noch einmal, bevor Sie absenden.',
    dgsKey: 'request.step.important',
    fragen: [
      {
        frage: 'Muss ich eine Diagnose angeben?',
        antwort:
          'Nein, niemals. Uns interessiert nur, was Ihnen im Alltag hilft. Eine Diagnose fragen wir nicht ab.',
        antwortLeicht: 'Nein.\nSie müssen keine Krankheit angeben.',
      },
    ],
  },
  {
    key: 'anfrage.summary',
    titel: 'Stimmt alles?',
    woBinIch: 'Sie sind bei Schritt 5 von 5. Hier steht Ihre Anfrage noch einmal zusammen.',
    woBinIchLeicht: 'Das ist Schritt 5.\nBitte prüfen Sie alles.',
    wasKannIchTun: [
      'Alles in Ruhe durchlesen.',
      'Sich die Anfrage vorlesen lassen.',
      'Zurückgehen und etwas ändern.',
      'Die Anfrage absenden.',
    ],
    wasPassiertDann:
      'Ihre Anfrage geht an passende Menschen. Ihre Adresse und Ihre Telefonnummer bleiben geheim. Sie bekommen eine Nachricht, sobald jemand antwortet.',
    dgsKey: 'request.summary',
    fragen: [
      {
        frage: 'Kann ich das rückgängig machen?',
        antwort:
          'Ja. Sie können die Anfrage später zurückziehen. Bis dahin sieht niemand Ihre Kontaktdaten.',
        antwortLeicht: 'Ja.\nSie können die Anfrage zurückziehen.',
      },
    ],
  },
  {
    key: 'vorschlaege',
    titel: 'Vorschläge',
    woBinIch: 'Hier sehen Sie Menschen, die zu Ihrer Anfrage passen.',
    woBinIchLeicht: 'Hier sehen Sie Menschen.\nSie können Ihnen helfen.',
    wasKannIchTun: [
      'Bei jedem Vorschlag lesen, warum wir ihn machen.',
      'Ein Profil ansehen.',
      'Bis zu drei Vorschläge vergleichen.',
      'Eine Nachricht schreiben.',
    ],
    wasPassiertDann:
      'Sie entscheiden. Sie müssen niemanden nehmen. Erst wenn Sie schreiben, erfährt die Person von Ihnen.',
    dgsKey: 'search.overview',
    fragen: [
      {
        frage: 'Nach welcher Reihenfolge ist das sortiert?',
        antwort:
          'Nach sechs Punkten: angebotene Leistung, Qualifikation, Zeit, Nähe, Erfahrung mit Barrierefreiheit und Verständigung. Bei jedem Vorschlag steht, was davon passt. Es gibt keine geheime Rangfolge.',
        antwortLeicht:
          'Wir zeigen Ihnen immer:\nWarum passt diese Person?\nEs gibt kein Geheimnis dabei.',
      },
      {
        frage: 'Was heißt „verifizierte Fachkraft“?',
        antwort:
          'Wir haben genau die Ausbildung geprüft, die dort steht. Das ist kein allgemeines Urteil über einen Menschen.',
        antwortLeicht: 'Wir haben die Ausbildung geprüft.\nMehr nicht.',
      },
    ],
  },
  {
    key: 'profil.person',
    titel: 'Profil einer Person',
    woBinIch: 'Hier steht alles über diese Person.',
    woBinIchLeicht: 'Hier steht alles über die Person.',
    wasKannIchTun: [
      'Lesen, was geprüft wurde.',
      'Lesen, was diese Person ausdrücklich nicht macht.',
      'Die Absage-Regel und den Preis ansehen.',
      'Eine Nachricht schreiben.',
    ],
    wasPassiertDann:
      'Wenn Sie schreiben, beginnt eine Unterhaltung. Ihre Telefonnummer bleibt dabei geheim.',
    dgsKey: 'provider.profile_explained',
    fragen: [
      {
        frage: 'Warum steht da, was die Person nicht macht?',
        antwort:
          'Damit es beim Termin keine Missverständnisse gibt. Jede anbietende Person muss das angeben.',
        antwortLeicht: 'Damit Sie vorher wissen:\nWas macht die Person nicht?',
      },
    ],
  },
  {
    key: 'buchung',
    titel: 'Termin bestätigen',
    woBinIch: 'Hier steht Ihre Buchung zusammen. Noch ist nichts verbindlich.',
    woBinIchLeicht: 'Hier steht der Termin.\nEr ist noch nicht fest.',
    wasKannIchTun: [
      'Alles noch einmal prüfen.',
      'Sich die Buchung vorlesen lassen.',
      'Bestätigen – oder abbrechen.',
    ],
    wasPassiertDann:
      'Nach Ihrer Bestätigung bekommt die andere Person eine Nachricht. Erst wenn beide bestätigt haben, ist der Termin fest. Dann sieht die Person Ihren Treffpunkt.',
    dgsKey: 'booking.summary',
    fragen: [
      {
        frage: 'Was kostet eine Absage?',
        antwort:
          'Das steht in der Absage-Regel oben. Sagen Sie früh ab, kostet es meistens nichts. Vor jeder Absage sagen wir Ihnen vorher, ob und was es kostet.',
        antwortLeicht: 'Sagen Sie früh ab.\nDann kostet es nichts.\nWir sagen es Ihnen vorher.',
      },
      {
        frage: 'Kann jemand für mich buchen?',
        antwort:
          'Nur wenn Sie das erlaubt haben. Unter „Wer entscheidet mit“ sehen Sie jederzeit, wer was darf, und können es ändern.',
        antwortLeicht: 'Nur wenn Sie Ja gesagt haben.\nSie können das ändern.',
      },
    ],
  },
  {
    key: 'termine',
    titel: 'Meine Termine',
    woBinIch: 'Hier stehen alle Ihre Termine.',
    woBinIchLeicht: 'Hier sind Ihre Termine.',
    wasKannIchTun: [
      'Sehen, welche Termine fest sind.',
      'Nachsehen, was eine Absage kostet.',
      'Einen Termin absagen.',
      'Nach dem Termin eine Rückmeldung geben.',
    ],
    wasPassiertDann: 'Absagen sind immer möglich. Die andere Person bekommt eine Nachricht.',
    dgsKey: 'booking.cancellation',
    fragen: [],
  },
  {
    key: 'planer',
    titel: 'Mein Planer',
    woBinIch: 'Hier sehen Sie Ihre Einsätze als Woche.',
    woBinIchLeicht: 'Hier sehen Sie Ihre Arbeit.\nEine Woche auf einen Blick.',
    wasKannIchTun: [
      'Die Woche durchblättern.',
      'Einen Einsatz in den Kalender auf Ihrem Handy legen.',
      'Den Planer dauerhaft mit Ihrem Kalender verbinden.',
      'Neue Anfragen ansehen.',
    ],
    wasPassiertDann:
      'Ein Eintrag im Handy-Kalender enthält nur Zeit, Ort und Tätigkeit – keine Namen und keine Angaben zur Gesundheit.',
    dgsKey: 'help.overview',
    fragen: [
      {
        frage: 'Was steht im Kalender-Eintrag?',
        antwort:
          'Die Tätigkeit, die Zeit und der ungefähre Ort. Kein Name, keine Adresse, keine Angaben zur Gesundheit. Das schützt die Menschen, die Sie unterstützen.',
        antwortLeicht:
          'Im Kalender steht:\nWas Sie tun.\nWann.\nUnd ungefähr wo.\nMehr nicht.',
      },
    ],
  },
  {
    key: 'verantwortlich',
    titel: 'Meine Verantwortung',
    woBinIch: 'Hier sehen Sie, was ansteht, und geben frei, was vereinbart wurde.',
    woBinIchLeicht: 'Hier sehen Sie:\nWo müssen Sie Ja sagen?',
    wasKannIchTun: [
      'Offene Freigaben ansehen und entscheiden.',
      'Sehen, was bei den Menschen ansteht, für die Sie da sind.',
      'Eine Person neu einrichten.',
    ],
    wasPassiertDann:
      'Ihre Antwort geht sofort an die Person. Antworten Sie nicht, passiert nichts – der Vorgang bleibt offen und wir erinnern Sie.',
    dgsKey: 'privacy.overview',
    fragen: [
      {
        frage: 'Darf ich für die Person entscheiden?',
        antwort:
          'Sie geben nur das frei, wofür die Person Sie benannt hat. Danach entscheidet sie weiterhin selbst. Alles andere geht Sie nichts an – so ist es auch gebaut.',
        antwortLeicht:
          'Sie sagen nur bei manchen Sachen Ja.\nDie Person entscheidet selbst.',
      },
    ],
  },
];

const INDEX = new Map(SCHRITTE.map((s) => [s.key, s]));

export function begleiterSchritt(key: string): BegleiterSchritt | undefined {
  return INDEX.get(key);
}

export function alleBegleiterSchritte(): BegleiterSchritt[] {
  return [...SCHRITTE];
}

/** Fragen zu einem Bildschirm plus die, die ueberall gelten. */
export function fragenFuer(key: string): BegleiterFrage[] {
  return [...(INDEX.get(key)?.fragen ?? []), ...ALLGEMEINE_FRAGEN];
}

/**
 * Was die Begleitung sagt, wenn sie vorliest.
 * Kurze Saetze, ausgeschriebene Zahlen, in der Reihenfolge des Bildschirms.
 */
export function vorleseText(schritt: BegleiterSchritt, leichteSprache: boolean): string {
  return [
    `${BEGLEITER.name}. ${BEGLEITER.rolle}.`,
    leichteSprache ? schritt.woBinIchLeicht.replace(/\n/g, ' ') : schritt.woBinIch,
    'Das können Sie hier tun.',
    ...schritt.wasKannIchTun,
    'Was danach passiert.',
    schritt.wasPassiertDann,
  ].join(' ');
}

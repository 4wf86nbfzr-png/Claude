/**
 * Inhalte fuer die Gebaerdensprach-Videos: welche Kernablaeufe es gibt,
 * wie sie heissen und was gesagt wird.
 *
 * Bewusst ohne Querverweise auf andere Module -- so kann das Werkzeug,
 * das die Platzhalter baut, diese Datei direkt einlesen.
 */

/** Kernablaeufe, fuer die DGS-Videos zwingend produziert werden muessen. */
export const REQUIRED_DGS_KEYS = [
  'onboarding.welcome',
  'onboarding.mode_choice',
  'onboarding.accessibility',
  'profile.create',
  'search.overview',
  'request.step.what',
  'request.step.when',
  'request.step.where',
  'request.step.important',
  'request.summary',
  'provider.profile_explained',
  'booking.summary',
  'booking.cancellation',
  'payment.overview',
  'complaint.how_to',
  'safety.emergency',
  'privacy.overview',
  'help.overview',
] as const;
export type RequiredDgsKey = (typeof REQUIRED_DGS_KEYS)[number];

export const DGS_TITEL: Record<RequiredDgsKey, string> = {
  'onboarding.welcome': 'Willkommen',
  'onboarding.mode_choice': 'Was möchten Sie tun?',
  'onboarding.accessibility': 'Bedienung einstellen',
  'profile.create': 'Ihr Profil anlegen',
  'search.overview': 'So finden Sie Unterstützung',
  'request.step.what': 'Wobei brauchen Sie Hilfe?',
  'request.step.when': 'Wann brauchen Sie Hilfe?',
  'request.step.where': 'Wo ungefähr?',
  'request.step.important': 'Was ist Ihnen wichtig?',
  'request.summary': 'Ihre Anfrage im Überblick',
  'provider.profile_explained': 'Das Profil verstehen',
  'booking.summary': 'Ihre Buchung im Überblick',
  'booking.cancellation': 'Einen Termin absagen',
  'payment.overview': 'Bezahlen',
  'complaint.how_to': 'Sich beschweren',
  'safety.emergency': 'Notfall und Sicherheit',
  'privacy.overview': 'Ihre Daten',
  'help.overview': 'Hilfe',
};


/**
 * Skripte fuer die Gebaerdensprach-Videos.
 *
 * Ein Text, drei Verwendungen:
 *  1. Transkript -- jederzeit lesbar, auch ohne Video.
 *  2. Untertitel -- getaktet zur Wiedergabe.
 *  3. Produktionsvorlage fuer die gebaerdenden Personen.
 *
 * Deshalb sind es kurze, einzeln stehende Saetze. Deutsche Gebaerdensprache
 * hat eine eigene Grammatik; die Uebersetzung ist Aufgabe der
 * DGS-Muttersprachler:innen bei der Produktion. Dieser Text ist die
 * inhaltliche Vorlage, nicht die Uebersetzung.
 */
export const DGS_SKRIPTE: Record<RequiredDgsKey, string[]> = {
  'onboarding.welcome': [
    'Herzlich willkommen.',
    'Diese App bringt Menschen zusammen.',
    'Sie suchen Unterstützung im Alltag? Hier finden Sie Menschen, die helfen.',
    'Sie möchten anderen helfen? Auch dafür sind Sie hier richtig.',
    'Wichtig: Diese App ist kein Notruf. Bei Gefahr rufen Sie 112 oder 110 an.',
  ],
  'onboarding.mode_choice': [
    'Sie haben drei Möglichkeiten.',
    'Erstens: Ich suche Unterstützung. Jemand hilft Ihnen im Alltag.',
    'Zweitens: Ich biete Unterstützung an. Sie helfen anderen Menschen.',
    'Drittens: Jemand unterstützt mich bei der Bedienung.',
    'Sie können Ihre Wahl später ändern.',
  ],
  'onboarding.accessibility': [
    'Hier stellen Sie ein, wie die App für Sie aussehen soll.',
    'Sie können die Schrift größer machen.',
    'Sie können den Kontrast erhöhen.',
    'Sie können sich alles vorlesen lassen.',
    'Sie können Gebärdensprache und Untertitel einschalten.',
    'Diese Einstellungen erreichen Sie immer oben über die Schaltfläche Bedienung.',
  ],
  'profile.create': [
    'Jetzt legen Sie Ihr Profil an.',
    'Wir fragen nur wenig ab.',
    'Sie müssen keine Diagnose angeben. Niemals.',
    'Sie schreiben nur, was Ihnen im Alltag hilft.',
    'Sie bestimmen selbst, was andere Menschen sehen dürfen.',
    'Ihre Telefonnummer und Ihre Adresse sieht niemand.',
  ],
  'search.overview': [
    'So finden Sie Unterstützung.',
    'Sie sagen, wobei Sie Hilfe brauchen.',
    'Sie sagen, wann und wo ungefähr.',
    'Wir suchen passende Menschen für Sie.',
    'Zu jedem Vorschlag steht, warum wir ihn machen.',
    'Sie entscheiden. Sie müssen nichts annehmen.',
  ],
  'request.step.what': [
    'Erste Frage: Wobei brauchen Sie Hilfe?',
    'Sie sehen Karten mit Bildern.',
    'Tippen Sie auf alles, was passt.',
    'Sie können mehrere Karten auswählen.',
    'Manche Aufgaben dürfen nur ausgebildete Fachkräfte machen. Das steht dann dabei.',
  ],
  'request.step.when': [
    'Zweite Frage: Wann brauchen Sie Hilfe?',
    'Wählen Sie einen Tag und eine Uhrzeit.',
    'Sagen Sie auch, wie lange es dauern soll.',
    'Sie können den Termin einmal machen oder regelmäßig.',
  ],
  'request.step.where': [
    'Dritte Frage: Wo ungefähr?',
    'Wir brauchen nur Ihren Ort.',
    'Und die ersten Ziffern Ihrer Postleitzahl.',
    'Ihre genaue Adresse sieht niemand.',
    'Andere sehen nur: ungefähr in Ihrer Nähe.',
  ],
  'request.step.important': [
    'Vierte Frage: Was ist Ihnen wichtig?',
    'Zum Beispiel: Ich benutze einen Rollstuhl.',
    'Zum Beispiel: Bitte in Ruhe sprechen.',
    'Zum Beispiel: Ich brauche Gebärdensprache.',
    'Alle Angaben hier sind freiwillig.',
  ],
  'request.summary': [
    'Bitte prüfen Sie Ihre Anfrage.',
    'Hier steht alles noch einmal zusammen.',
    'Stimmt der Tag? Stimmt die Uhrzeit?',
    'Wenn etwas falsch ist, gehen Sie zurück und ändern es.',
    'Erst wenn Sie auf Absenden tippen, geht die Anfrage raus.',
    'Ihre Adresse und Ihre Telefonnummer bleiben geheim.',
  ],
  'provider.profile_explained': [
    'So lesen Sie ein Profil.',
    'Oben steht der Name und die Rolle.',
    'Verifizierte Fachkraft bedeutet: Die Ausbildung wurde geprüft.',
    'Geprüfte Alltagsbegleitung bedeutet: Eine Qualifikation wurde geprüft.',
    'Private Unterstützungsperson bedeutet: Nur die Identität wurde geprüft.',
    'Geprüft ist immer nur das, was dort steht.',
    'Wichtig: Es steht auch dabei, was diese Person nicht macht.',
  ],
  'booking.summary': [
    'Bitte prüfen Sie Ihre Buchung.',
    'Hier steht: Wer hilft Ihnen.',
    'Hier steht: Wann und wie lange.',
    'Hier steht: Wo Sie sich treffen.',
    'Hier steht: Was es kostet.',
    'Der Termin ist erst fest, wenn beide Seiten zustimmen.',
    'Erst dann sieht die andere Person Ihre Adresse.',
  ],
  'booking.cancellation': [
    'Sie können einen Termin immer absagen.',
    'Vorher sagen wir Ihnen, ob es etwas kostet.',
    'Wenn Sie früh absagen, kostet es meistens nichts.',
    'Wenn Sie sehr kurzfristig absagen, kann es Geld kosten.',
    'Nach der Absage sieht die andere Person Ihre Adresse nicht mehr.',
  ],
  'payment.overview': [
    'Manche Menschen helfen ehrenamtlich. Dann kostet es nichts.',
    'Andere Menschen bekommen Geld für ihre Arbeit.',
    'Der Preis steht immer vorher im Profil.',
    'Es gibt keine versteckten Kosten.',
    'Vor jeder Zahlung fragen wir Sie noch einmal.',
  ],
  'complaint.how_to': [
    'Sie sind unzufrieden? Dann sagen Sie es uns.',
    'Tippen Sie unten auf Hilfe.',
    'Dort können Sie ein Problem melden.',
    'Wir sagen Ihnen, wann wir uns melden.',
    'Eine Beschwerde hat keine Nachteile für Sie.',
  ],
  'safety.emergency': [
    'Ganz wichtig: Diese App ist kein Notruf.',
    'Ist jemand in Gefahr? Dann rufen Sie sofort an.',
    'Feuerwehr und Rettungsdienst: 1 1 2.',
    'Polizei: 1 1 0.',
    'Sie können auch das Notruf-Fax oder die Notruf-App nutzen.',
    'In der App können Sie jede Person melden und blockieren.',
  ],
  'privacy.overview': [
    'Hier geht es um Ihre Daten.',
    'Wir speichern so wenig wie möglich.',
    'Ihre genaue Adresse sieht niemand.',
    'Sie entscheiden bei jeder Erlaubnis selbst.',
    'Sie können jede Erlaubnis wieder zurücknehmen.',
    'Sie können alle Ihre Daten herunterladen.',
    'Sie können Ihr Konto löschen. Vorher zeigen wir Ihnen genau, was passiert.',
  ],
  'help.overview': [
    'Hier bekommen Sie Hilfe.',
    'Sie finden Antworten auf häufige Fragen.',
    'Sie können ein Problem melden.',
    'Sie sehen die Notrufnummern.',
    'Sie können uns schreiben, wenn etwas nicht barrierefrei ist.',
    'Wir antworten Ihnen.',
  ],
};

/** Sekunden pro Satz im Platzhaltervideo. Bewusst ruhig getaktet. */
export const SEKUNDEN_PRO_SATZ = 3;

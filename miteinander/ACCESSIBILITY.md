# Barrierefreiheit

## Zielstandard

- **WCAG 2.2, Stufe AA** als Mindestmaß für alle Oberflächen.
- **EN 301 549** in der jeweils geltenden Fassung, soweit auf mobile
  Anwendungen anwendbar.
- **Barrierefreiheitsstärkungsgesetz (BFSG)** und **BFSGV**. Ob und ab wann das
  Produkt in den Anwendungsbereich fällt, muss vor dem Start rechtlich geprüft
  werden – siehe [`MENSCHLICHE_PRUEFUNGEN.md`](MENSCHLICHE_PRUEFUNGEN.md).

Barrierefreiheit ist hier keine Prüfliste am Ende, sondern die Grundlage jeder
Komponente. Wo etwas noch nicht erfüllt ist, steht es unten unter „Bekannte
Lücken" – und die Oberfläche selbst sagt es den Nutzenden.

## Bedienmodi

| Modus | Was er bedeutet |
| --- | --- |
| **Einfach** | Ein Hauptschritt pro Ansicht, Tippflächen ab 72 dp, Schrift 140 %, Leichte Sprache und Vorlesen von Anfang an aktiv, Bewegung aus, doppelte Bedienzeit |
| **Standard** | Vollständig und übersichtlich, Tippflächen ab 48 dp |
| **Individuell** | Schriftgröße, Kontrast, Farbschema, Bewegung, Vorlesen, Geschwindigkeit, Gebärdensprache, Untertitel, Haptik, Tippflächengröße und Bedienzeit einzeln einstellbar |

Der Modus ist über die Schaltfläche **Bedienung** in der Kopfzeile von jedem
Bildschirm erreichbar und jederzeit wechselbar. Ein Wechsel verliert keine
Daten: nach `individuell` bleiben alle Werte erhalten, und eine einmal bewusst
abgeschaltete Bewegung bleibt abgeschaltet (`switchMode` in
`packages/core/src/a11y/preferences.ts`).

## Systemeinstellungen haben Vorrang

`resolvePreferences` verbindet die App-Einstellungen mit dem, was das
Betriebssystem meldet. Systemseitige Einschränkungen gewinnen immer:

- „Bewegung reduzieren" des Systems setzt alle Animationsdauern auf 0 – auch
  wenn die App-Einstellung etwas anderes sagt.
- Eine größere Systemschriftgröße wird übernommen und nie nach unten
  überschrieben.
- Läuft VoiceOver oder TalkBack, schweigt der eigene Vorlesemodus. Sonst
  sprächen zwei Stimmen übereinander. Stattdessen geht der Text als Ansage an
  den Screenreader.

## Wahrnehmbar

- **Kontrast:** drei vollständige Paletten (hell, dunkel, Hochkontrast). 17
  Farbpaare werden je Palette automatisch geprüft – Text gegen 4,5:1,
  Bedienelemente und Fokus gegen 3:1. Der Hochkontrastmodus erreicht für
  Fließtext AAA (7:1). Der Test (`packages/ui/test/tokens.test.ts`) schlägt
  fehl, sobald ein Farbwert die Schwelle reißt.
- **Nie nur Farbe:** Auswahl trägt zusätzlich einen dicken Rahmen, ein
  Haken-Symbol und den Zustand `selected` für den Screenreader. Statuswerte
  tragen ein Zeichen (✓ ⏳ ⌛ ✕) und ein Wort. Hinweisblöcke nennen ihre Art im
  Text („Achtung", „Fehler").
- **Schrift:** Grundschrift 18 dp, skalierbar bis 250 %. Zeilenhöhen wachsen
  mit. Ausgeliefert wird *Atkinson Hyperlegible* – für Menschen mit
  Sehbeeinträchtigung entworfen, mit deutlich unterscheidbaren Zeichen.
- **Reflow:** jeder Bildschirm scrollt. Breite Inhalte (Vergleichstabelle)
  scrollen in sich; die Seite selbst nie waagerecht.
- **Bilder:** ein Foto ohne Beschreibung wird nicht angezeigt – das ist in der
  Datenbank als Prüfbedingung hinterlegt. Ohne Foto erscheint ein neutraler
  Platzhalter mit Initialen, kein erfundenes Symbol.

## Bedienbar

- **Tippflächen:** mindestens 48 dp, im Einfach-Modus 72 dp. Der Browser-Test
  prüft, dass kein Bedienelement darunter liegt.
- **Fokus:** immer sichtbar, 3 dp Ring mit Abstand. Kein `outline: none`.
- **Tastatur und Switch Control:** alle Elemente sind Pressables mit Rolle,
  Label und Zustand. Der Adminbereich hat eine Sprungmarke „Direkt zum Inhalt".
- **Keine Zeitfallen:** keine automatisch verschwindenden Inhalte, keine
  Zeitlimits. Hinweisdauern werden mit `extraTimeFactor` verlängert (im
  Einfach-Modus doppelt).
- **Die Bedienhilfen liegen in der Kopfzeile**, nicht als schwebender Knopf über
  dem Inhalt: ein Overlay würde je nach Schriftgröße dauerhaft ein Bedienelement
  verdecken (WCAG 2.4.11).

## Verständlich

- Ein Hauptschritt pro Ansicht, Fortschritt als Text („Schritt 3 von 5"), nicht
  nur als Balken.
- Fehler stehen **am Feld**, erklären das Problem und nennen den Weg zur
  Korrektur. Sie werden dem Screenreader aktiv angesagt.
- Jede Eingabe ist sofort ein gespeicherter Entwurf.
- An jeder Entscheidung steht „Was passiert jetzt?".
- Vor jeder verbindlichen Handlung eine Zusammenfassung in vier Formen: Text,
  Leichte Sprache, Vorlese-Skript und – sobald produziert – Gebärdensprache.

## Sprache und Vorlesen

- Jede wichtige Überschrift, Erklärung, Fehlermeldung und Zusammenfassung ist
  vorlesbar.
- Der Vorlese-Text ist ein eigener Text, kein Auslesen des Bildschirms: kurze
  Sätze, ausgeschriebene Beträge.
- Spracheingabe: das Transkript ist **immer sichtbar und änderbar**, bevor
  etwas passiert.
- **Folgenreiche Handlungen laufen nie allein über die Stimme.** Geld,
  Buchungen, Datenfreigaben, Kontaktfreigaben und Löschungen brauchen zusätzlich
  eine Bestätigung am Bildschirm (`IRREVERSIBLE_ACTIONS`).
- Bei fehlender Mikrofonberechtigung, Lärm, fehlender Verbindung oder nicht
  unterstütztem Gerät nennt die App den Grund **und** einen vollwertigen Weg
  ohne Stimme.
- Keine dauerhafte Aufnahme. Das Mikrofon läuft nur nach bewusster Aktivierung,
  sichtbar, und stoppt automatisch.

## Deutsche Gebärdensprache

**Stand: 0 von 18 Kernabläufen haben ein produziertes und fachlich geprüftes
Video.**

Das ist der ehrliche Zustand, und die App sagt ihn: An jeder Stelle, an der ein
Video fehlen würde, steht „Für diesen Bereich gibt es noch kein Video in
Gebärdensprache. Es wird gerade produziert."

Die Regeln des Content-Systems (`packages/core/src/content/dgs.ts`):

- Ein Eintrag gilt nur als geprüft, wenn **Video, Untertitel, Transkript und der
  Name der prüfenden Person** vorliegen. Fehlt eines, wirft die Freigabe.
- Ein neues Video setzt die Prüfung zurück und erhöht die Version.
- Eine automatische Übersetzung ist nie eine gültige Quelle – nicht für
  Verträge, Buchungen, Sicherheit oder Einwilligungen.
- Anbietende können Gebärdensprach-Kompetenz angeben; öffentlich als Stufe
  erscheint sie erst mit Nachweis. Ohne Nachweis steht am Profil ausdrücklich
  „Diese Person gibt Kenntnisse in Gebärdensprache an. Ein Nachweis liegt dafür
  noch nicht vor."

Produktionsanforderungen stehen in `DGS_PRODUCTION_REQUIREMENTS` und im
Adminbereich unter „Inhalte".

## Leichte Sprache

Alle Texte sind Entwürfe des Produktteams. Leichte Sprache muss nach dem
Regelwerk des Netzwerks Leichte Sprache von einer Prüfgruppe aus Menschen mit
Lernschwierigkeiten geprüft werden. Bis dahin steht in der Oberfläche: „Dieser
Text ist ein Entwurf. Er wird noch von einer Prüfgruppe geprüft."

`checkEasyLanguage` prüft automatisch auf lange Sätze, lange Wörter ohne
Trennung, Abkürzungen und Passiv. Das ist ein Netz für offensichtliche Fehler,
kein Ersatz für die Prüfgruppe.

## Was automatisch geprüft wird

| Prüfung | Wo |
| --- | --- |
| Kontrast aller Farbpaare in drei Paletten | `packages/ui/test/tokens.test.ts` |
| Tippflächen nie unter 48 dp | `packages/core/test/a11y.test.ts`, Browser-Test |
| Systemeinstellungen haben Vorrang | `packages/core/test/a11y.test.ts` |
| Vorlesemodus schweigt bei aktivem Screenreader | `packages/core/test/a11y.test.ts` |
| Fehler stehen am Feld und nennen die Korrektur | `packages/core/test/wizard.test.ts` |
| Sprachbefehle lösen keine Buchung aus | `packages/core/test/voice.test.ts` |
| Sprachnachricht ohne Transkript wird abgelehnt | `packages/core/test/flow.test.ts` |
| Gebärdensprache wird nicht als fertig behauptet | `packages/core/test/content.test.ts` |
| Bedienbarkeit im echten Browser | `apps/mobile/e2e/` |

**Automatisierte Tests finden höchstens einen Teil der Barrieren.** Der
manuelle Testplan steht in [`TESTPLAN.md`](TESTPLAN.md).

## Bekannte Lücken

1. Gebärdensprach-Videos fehlen vollständig (siehe oben).
2. Leichte-Sprache-Texte sind ungeprüfte Entwürfe.
3. Die Spracherkennung ist noch nicht an eine Engine angebunden; die Auswertung
   und alle Ersatzwege stehen.
4. Es hat noch kein Test mit Betroffenen stattgefunden. Das Konzept dafür steht
   in [`docs/RESEARCH.md`](docs/RESEARCH.md).
5. Ein unabhängiges Barrierefreiheits-Audit steht aus.
6. Die Vergleichstabelle scrollt waagerecht. Für Screenreader ist jede Zeile als
   Ganzes beschriftet; mit sehr großer Schrift bleibt das Format trotzdem
   anspruchsvoll und gehört im Nutzungstest überprüft.

## Barrierefreiheits-Erklärung und Rückmeldung

Eine prüfbare Erklärung ist in der App unter „Hilfe" angelegt und nennt den
tatsächlichen Stand einschließlich der Lücken. Rückmeldungen gehen an die unter
`EXPO_PUBLIC_A11Y_EMAIL` hinterlegte Adresse. Vor dem Start muss die Erklärung
um die gesetzlich vorgeschriebenen Angaben ergänzt und die Bearbeitungszusage
verbindlich gemacht werden.

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
Bildschirm erreichbar und jederzeit wechselbar. **Alle Einstellungen werden
gespeichert und überleben den Neustart** – wer 200 Prozent Schrift braucht,
darf sie nicht bei jedem Öffnen neu einstellen müssen. Ist kein Speicher
verfügbar (privates Fenster, Datei-Fassung), läuft die App weiter, nur eben
ohne Gedächtnis. Ein Wechsel verliert keine
Daten: nach `individuell` bleiben alle Werte erhalten, und eine einmal bewusst
abgeschaltete Bewegung bleibt abgeschaltet (`switchMode` in
`packages/core/src/a11y/preferences.ts`).

## Zwei Ansprüche, eine Grundlage

Der Bereich für verantwortliche Personen ist dichter: Listen, Kennzahlen,
mehrere Menschen auf einem Bildschirm. Der Bereich für Menschen mit
Unterstützungsbedarf bleibt bei einem Hauptschritt pro Ansicht.

Was **nicht** unterschiedlich ist: Tippflächen, Kontrast, Fokus, Vorlesen,
Gebärdensprache, Leichte Sprache. Eine verantwortliche Person kann selbst
Unterstützungsbedarf haben – „umfangreicher" heißt mehr Inhalt, nicht weniger
Barrierefreiheit. Beide Bereiche nutzen dieselben Komponenten und dasselbe
Theme.

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
  Datenbank als Prüfbedingung hinterlegt. Das große Bild auf der Startseite
  trägt eine Beschreibung in ganzen Sätzen und nimmt höchstens 45 Prozent der
  Bildschirmhöhe ein, damit die erste Schaltfläche auch bei großer Schrift
  sichtbar bleibt. Auf dem Bild steht kein Text: Schrift im Bild skaliert nicht
  mit und lässt sich im Hochkontrastmodus nicht anpassen. Ohne Foto erscheint ein neutraler
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

## Die Begleitung

Auf jedem Bildschirm führt „Mika" durch die App: wo Sie sind, was Sie hier tun
können, was danach passiert, was der nächste Schritt ist – dazu eine feste
Liste von Rückfragen. Alles in normaler Sprache, in Leichter Sprache,
vorlesbar und in Gebärdensprache.

Drei Festlegungen, die dahinterstehen:

- Mika sagt auf jedem Bildschirm, **kein Mensch** zu sein.
- Mika **gebärdet nicht selbst**, sondern zeigt geprüfte Videos. Fehlt eines,
  wird das gesagt.
- Die Antworten sind **geschrieben, nicht erzeugt**. Kein Sprachmodell, kein
  Netzabruf – eine frei formulierende Begleitung könnte einer Person etwas
  Falsches über eine Buchung sagen.

Gebärdensprache steht **daneben** und nicht nur darin: neben „Mika fragen"
gibt es auf jedem Bildschirm einen eigenen Knopf „In Gebärdensprache
ansehen". Ist die Einstellung eingeschaltet, ist der Bereich von vornherein
offen.

Auf Mikas eigenen beiden Bildschirmen – Sprachführung und Verständigung –
entfällt der Knopf „Mika fragen": Dort ist der ganze Bildschirm Mika. Die
Rückfragen stehen offen auf der Seite, das geprüfte Video direkt unter der
Überschrift.

### Sprachführung

„Sagen Sie einfach, was Sie brauchen" steht oben auf der Startseite. Mika
begrüßt, fragt „Was kann ich für Sie tun?", und wertet aus, was gesagt oder
getippt wurde.

- Der **Wortlaut, wie er verstanden wurde, steht immer als Text da** – vor
  jedem weiteren Schritt.
- Unter 50 Prozent Sicherheit wird **nachgefragt statt geführt**.
- Erkannt wird mit einer festen Wortliste auf dem Gerät, nicht mit einem
  Sprachmodell. Der **Notfall wird vor jeder Kategorie geprüft**: Wer
  „Notruf" sagt, bekommt 112 und 110, kein Formular.
- Mika **führt hin und füllt aus**. Abgeschickt, gebucht und eingewilligt
  wird immer mit einem Fingertipp auf dem Bildschirm.
- **Tippen und antippbare Beispielsätze stehen gleichberechtigt daneben**,
  auf jedem Gerät. Das ist keine Notlösung: Erkennung versteht genau die
  Menschen schlecht, für die diese App gebaut ist – nach einem Schlaganfall,
  bei Dysarthrie, bei Sprechapraxie.

### Verständigung – wenn jemand nicht sprechen kann

Ein eigener Bildschirm für unterstützte Kommunikation. Die Person wählt
Karten oder tippt, das Gerät spricht laut; das Gegenüber antwortet mit
Karten, tippt, oder lässt sich zuhören.

- Der gebaute Satz steht **groß und vollständig da, bevor** er gesprochen
  wird. Niemand soll etwas sagen lassen, das er nicht gelesen hat.
- Die Karten sind in der **Ich-Form**, und eine ganze Gruppe heißt
  „Meine Grenzen": „Bitte nicht anfassen", „Bitte aufhören", „Das mache ich
  selbst". Wer nicht sprechen kann, muss zuerst Nein sagen können.
- Das Gespräch steht **nur auf dem Bildschirm** – nicht gespeichert, nicht
  verschickt, mit einem Tipp gelöscht.
- Auf demselben Bildschirm steht, dass dies **kein
  Gebärdensprach-Übersetzer** ist, und welche Wege es zu echter
  Gebärdensprache gibt – mit dem, was daran jeweils noch fehlt.

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

**Der Ablauf funktioniert vollständig. Die Aufnahmen fehlen.**

Was heute funktioniert:

- Auf **jedem** Bildschirm gibt es den Einstieg „In Gebärdensprache ansehen".
  Wer Gebärdensprache braucht, muss sie nicht erst in den Einstellungen
  finden. Ist die Einstellung an, ist der Bereich von vornherein offen.
- Ein eigener Abspieler mit beschrifteten, ausreichend großen Bedienelementen:
  Abspielen und Pause, fünf Sekunden zurück, von vorn, Geschwindigkeit
  (0,5 / 0,75 / 1,0), Untertitel ein und aus, Vollbild. Die Wiedergabe startet
  nie von selbst.
- **Untertitel als eigene Ebene**, nicht ins Video gebrannt und nicht vom
  Betriebssystem gezeichnet. Nur so folgen sie der eingestellten Schriftgröße
  und dem Kontrastmodus. Der Browser-Test prüft genau das: bei 160 Prozent
  Schrift wächst die Untertitelzeile von 18 auf 29 Punkt mit.
- Die Untertitel stehen **unter** dem Video, nicht darüber. Gebärden reichen
  bis in den unteren Bildrand; eine eingeblendete Zeile über dem Bild würde
  genau die Hände verdecken, um die es geht.
- Ein vollständiges Transkript zu jedem Ablauf, jederzeit lesbar, auch ohne
  Video und ohne Wiedergabe.

**Stand der Aufnahmen: 0 von 18 Kernabläufen sind produziert und fachlich
geprüft.** Ausgeliefert werden gekennzeichnete Platzhalter – eine Textkarte,
die im Bild „PLATZHALTER" und „Dies ist kein Gebärdensprach-Video" trägt. In
der Oberfläche steht darüber: „Für diesen Bereich gibt es noch kein Video in
Gebärdensprache. Es wird gerade produziert." Der Adminbereich zeigt
unverändert 0 von 18 geprüft.

Warum überhaupt Platzhalter: ohne abspielbares Material lässt sich nicht
prüfen, ob der Abspieler taugt – Untertitel, Fokusreihenfolge, Vollbild,
Screenreader. Die Platzhalter machen den Ablauf prüfbar, ohne eine
Übersetzung vorzutäuschen.

Die Regeln des Content-Systems (`packages/core/src/content/dgs.ts`):

- Ein Eintrag gilt nur als geprüft, wenn **Video, Untertitel, Transkript und
  der Name der prüfenden Person** vorliegen.
- Ein Platzhaltervideo ändert den Status nicht und kann ein freigegebenes
  Video nicht überschreiben.
- Ein neues Video setzt die Prüfung zurück und erhöht die Version.
- Eine automatische Übersetzung ist nie eine gültige Quelle – nicht für
  Verträge, Buchungen, Sicherheit oder Einwilligungen.
- Anbietende können Gebärdensprach-Kompetenz angeben; öffentlich als Stufe
  erscheint sie erst mit Nachweis.

Die Skripte für alle 18 Abläufe stehen in
`packages/core/src/content/dgs-skripte.ts`. Sie sind die inhaltliche Vorlage
für die Produktion – **nicht die Übersetzung**. Deutsche Gebärdensprache hat
eine eigene Grammatik; die Übertragung ist Aufgabe der DGS-Muttersprachler:innen
bei der Aufnahme. Produktionsanforderungen: `DGS_PRODUCTION_REQUIREMENTS` und
Adminbereich unter „Inhalte".

Austausch gegen echte Aufnahmen: Dateien in `apps/mobile/assets/dgs/`
ersetzen und im Adminbereich freigeben. Am Code ändert sich nichts.

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
| Untertitel folgen der Schriftgröße | `apps/mobile/e2e/gebaerdensprache.mjs` |
| Bedieneinstellungen überleben den Neustart | `apps/mobile/e2e/gebaerdensprache.mjs` |
| Begleitung erklärt jeden Bildschirm und nennt sich nicht Mensch | `apps/mobile/e2e/begleiter-planer.mjs` |
| Kalendereintrag enthält keine Namen oder Adressen | `packages/core/test/`, `apps/mobile/e2e/begleiter-planer.mjs` |
| Bedienbarkeit im echten Browser | `apps/mobile/e2e/` |

**Automatisierte Tests finden höchstens einen Teil der Barrieren.** Der
manuelle Testplan steht in [`TESTPLAN.md`](TESTPLAN.md).

## Bekannte Lücken

1. Gebärdensprach-**Aufnahmen** fehlen vollständig – Abspieler, Untertitel und
   Transkripte sind fertig, die Videos sind gekennzeichnete Platzhalter.
2. Leichte-Sprache-Texte sind ungeprüfte Entwürfe.
3. Zuhören läuft im Browser über die Web Speech API; in der nativen App fehlt
   die Anbindung noch. Die Auswertung, das Tippen und die antippbaren
   Beispielsätze stehen überall.
4. Die App **erkennt keine Gebärden und erzeugt keine**. Die Verständigung
   über Karten und Text ist ein Werkzeug daneben, kein Ersatz für
   Dolmetschung. Der Weg zu vollwertiger DGS in beide Richtungen ist ein
   Ferndolmetschdienst mit Menschen (offene Entscheidung O-13).
5. Es hat noch kein Test mit Betroffenen stattgefunden. Das Konzept dafür steht
   in [`docs/RESEARCH.md`](docs/RESEARCH.md).
6. Ein unabhängiges Barrierefreiheits-Audit steht aus.
7. Die Vergleichstabelle scrollt waagerecht. Für Screenreader ist jede Zeile als
   Ganzes beschriftet; mit sehr großer Schrift bleibt das Format trotzdem
   anspruchsvoll und gehört im Nutzungstest überprüft.

## Barrierefreiheits-Erklärung und Rückmeldung

Eine prüfbare Erklärung ist in der App unter „Hilfe" angelegt und nennt den
tatsächlichen Stand einschließlich der Lücken. Rückmeldungen gehen an die unter
`EXPO_PUBLIC_A11Y_EMAIL` hinterlegte Adresse. Vor dem Start muss die Erklärung
um die gesetzlich vorgeschriebenen Angaben ergänzt und die Bearbeitungszusage
verbindlich gemacht werden.

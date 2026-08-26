# Entscheidungen

Getroffene Entscheidungen mit Begründung. Wer etwas ändern will, sollte hier
zuerst nachlesen, warum es so ist.

---

## E-01 Der Produktname steht an einer Stelle

**Entscheidung:** „MITEINANDER" ist ein Arbeitstitel und liegt ausschließlich in
`packages/core/src/config/app-config.ts`, überschreibbar per Umgebungsvariable.

**Warum:** Der Name wird sich ändern. Ein über 90 Dateien verstreuter Name wird
bei einem Rebrand nie vollständig ersetzt, und übrig bleiben peinliche Reste.

---

## E-02 Der Anwendungskern kennt weder React noch eine Datenbank

**Entscheidung:** Die gesamte Fachlogik liegt in `packages/core` und spricht
Daten nur über Repository-Schnittstellen an.

**Warum:** Zwei Gründe. Erstens Testbarkeit – 202 Tests laufen in 2,4 Sekunden
ohne Emulator und ohne Datenbank; was schnell testbar ist, wird auch getestet.
Zweitens Austauschbarkeit: ein Backend-Wechsel berührt keine Domänenlogik.

**Preis:** Eine zusätzliche Schicht. Für ein Wegwerf-Prototyp wäre das zu viel;
für ein Produkt, das Menschen in verletzlichen Lagen vermittelt, ist es richtig.

---

## E-03 Kernregeln stehen zweimal – in der Anwendung und in der Datenbank

**Entscheidung:** Sechs Regeln (siehe `ARCHITECTURE.md`) sind doppelt
abgesichert.

**Warum:** Die Anwendung braucht die Regel, um verständlich zu reagieren
(„Dafür fehlt Ihre Einwilligung"). Die Datenbank braucht sie, damit ein
fehlerhafter Client, ein Skript oder ein direkter Zugriff sie nicht umgehen
kann. Bei einer erlaubnispflichtigen Pflegeanfrage ist das kein theoretischer
Fall.

**Preis:** Doppelte Pflege. Deshalb steht die Liste in `ARCHITECTURE.md` und
jede Regel trägt an beiden Stellen einen Kommentar.

---

## E-04 „Einfach" ist ein eigener Modus, kein reduziertes Standard

**Entscheidung:** Drei Modi mit eigenen Voreinstellungen. „Einfach" bringt große
Tippflächen, Leichte Sprache, Vorlesen und doppelte Bedienzeit von Anfang an mit.

**Warum:** Ein „vereinfachtes" Standard bleibt ein Kompromiss. Wer eine sehr
reduzierte Oberfläche braucht, braucht sie ganz – nicht ein bisschen weniger von
allem.

**Kein Datenverlust beim Wechsel:** Der Modus ist eine Voreinstellung, keine
Einbahnstraße. Eine bewusst abgeschaltete Bewegung bleibt auch nach einem
Moduswechsel aus.

---

## E-05 Systemeinstellungen gewinnen immer

**Entscheidung:** Meldet das Betriebssystem „Bewegung reduzieren", eine größere
Schrift oder einen aktiven Screenreader, setzt sich das gegen die
App-Einstellung durch.

**Warum:** Wer im System „Bewegung reduzieren" eingeschaltet hat, hat dafür
einen Grund – oft körperliche Beschwerden. Eine App, die das überstimmt, ist
schlicht falsch.

**Folge:** Läuft ein Screenreader, schweigt der eigene Vorlesemodus. Zwei
Stimmen übereinander sind unbrauchbar.

---

## E-06 Erlaubnispflicht wird abgeleitet, nie gesetzt

**Entscheidung:** `requiresLicensedProfessional` ergibt sich aus den gewählten
Kategorien. Es gibt keinen Weg, den Wert von außen zu setzen.

**Warum:** Sonst ließe sich eine pflegerische Anfrage als „Alltagshilfe" tarnen
und würde Menschen ohne Qualifikation angezeigt.

---

## E-07 Eine Buchung braucht zwei ausdrückliche Bestätigungen

**Entscheidung:** `confirmed` entsteht nur, wenn beide Seiten aktiv bestätigt
haben. Der Zustandsautomat wirft, wenn eine fehlt.

**Warum:** Eine Verabredung, bei der jemand zu einer anderen Person nach Hause
kommt, darf nie durch Schweigen zustande kommen.

---

## E-08 Kontaktdaten hängen an einer eigenen Einwilligung

**Entscheidung:** Telefonnummer und Adresse werden erst freigegeben, wenn die
Buchung bestätigt ist **und** die Einwilligung `contact_release` vorliegt. Nach
einer Absage wird die Freigabe eingezogen.

**Warum:** Die Buchung ist der Zweck, nicht die Einwilligung. Beides zu
vermischen wäre eine gebündelte Zwangseinwilligung.

**Praktische Folge:** Ohne Freigabe scheitert das Bestätigen mit einer klaren
Erklärung statt mit einem stillen Fehler.

---

## E-09 Entfernungen nur grob

**Entscheidung:** Koordinaten werden auf zwei Nachkommastellen gerundet (etwa
1 km); angezeigt wird „in Ihrer Nähe" oder „etwa 10 km entfernt".

**Warum:** Aus mehreren exakten Entfernungsangaben lässt sich eine Wohnadresse
triangulieren. Für die Entscheidung „passt das räumlich?" genügt die grobe
Angabe vollständig.

---

## E-10 Das Matching legt seine Gewichtung offen

**Entscheidung:** Sechs benannte Komponenten mit sichtbarer Gewichtung; jede
erzeugt einen Grund in normaler und in Leichter Sprache.

**Warum:** Eine Rangfolge, die niemand nachvollziehen kann, ist eine
Vertrauensfrage. Und sie lässt sich nicht auf Diskriminierung prüfen.

**Zusätzlich:** Ein Test fährt alle Signalnamen gegen die Liste geschützter
Merkmale. Ein Signal namens „herkunft" oder „alter" lässt die Testsuite
fehlschlagen.

---

## E-11 Präferenz nach Geschlecht nur bei Körpernähe, und dann mit Prüfung

**Entscheidung:** Auswahl nach geschützten Merkmalen ist grundsätzlich
unzulässig. Einzige Ausnahme: Geschlecht bei persönlicher Assistenz und
Körpernähe – mit Begründung, und der Vorschlag wird zur manuellen Prüfung
markiert.

**Warum:** § 8 AGG lässt eine sachlich erforderliche Anforderung zu. Bei
Körperpflege ist das für viele Menschen eine Frage der Würde. Eine offene
Filterfunktion nach Geschlecht wäre dagegen ein Diskriminierungswerkzeug.

**Warum nicht still zulassen:** Weil die Grenze im Einzelfall liegt. Deshalb
sieht ein Mensch drauf.

---

## E-12 Kein Sprachbefehl löst eine folgenreiche Handlung aus

**Entscheidung:** Geld, Buchungen, Datenfreigaben, Kontaktfreigaben und
Löschungen brauchen immer eine Bestätigung am Bildschirm.

**Warum:** Spracherkennung verwechselt Wörter, besonders bei
Sprechbeeinträchtigung, Dialekt oder Umgebungslärm – also genau bei den
Menschen, für die dieses Produkt gemacht ist.

**Kein Widerspruch zur Barrierefreiheit:** Wer den Bildschirm nicht bedienen
kann, nutzt den Screenreader mit dessen eigener Bestätigungsgeste. Der Punkt ist
nicht „Bildschirm statt Stimme", sondern „zwei bewusste Handlungen".

---

## E-13 Sprachnachrichten brauchen ein Transkript

**Entscheidung:** Eine Sprachnachricht ohne Transkript wird abgelehnt – in der
Anwendung und als Prüfbedingung in der Datenbank.

**Warum:** Eine Nachricht, die man nur hören kann, ist für gehörlose Menschen
wertlos. In einer App, die gehörlose Menschen ausdrücklich anspricht, wäre das
absurd.

**Und:** Das Transkript ist vor dem Senden änderbar, weil die Erkennung Fehler
macht.

---

## E-14 Gebärdensprache wird nicht behauptet, bevor sie geprüft ist

**Entscheidung:** Ein DGS-Eintrag gilt nur als geprüft, wenn Video, Untertitel,
Transkript und der Name der prüfenden Person vorliegen. Bis dahin steht in der
Oberfläche, dass das Video fehlt. Der Adminbereich zeigt „0 von 18".

**Warum:** Ein Produkt, das mit „verfügbar in Gebärdensprache" wirbt und dann
eine automatische Übersetzung zeigt, schadet genau den Menschen, die darauf
angewiesen sind. Eine unklare Buchungszusammenfassung kann eine falsche
Verpflichtung bedeuten.

**Ein neues Video setzt die Prüfung zurück.** Sonst gilt die Freigabe für einen
Inhalt, den niemand geprüft hat.

---

## E-15 Leichte Sprache ist gekennzeichnet, solange sie ungeprüft ist

**Entscheidung:** `resolve()` liefert Text **und** Prüfstatus; der Hinweis ist
Teil des Rückgabewerts, nicht optional.

**Warum:** Wenn der Hinweis optional wäre, würde er irgendwo vergessen. Leichte
Sprache muss von einer Prüfgruppe aus Menschen mit Lernschwierigkeiten geprüft
werden – alles andere ist eine Behauptung.

---

## E-16 Zahlungen sind ein abgeschaltetes Modul, keine Attrappe

**Entscheidung:** `payment_intents` steht im Schema, das Feature ist aus. Es gibt
keine Schein-Integration.

**Warum:** Eine Zahlungsoberfläche ohne Zahlungsdienstleister erzeugt
Erwartungen, die das Produkt nicht einlöst. Bei einer Zielgruppe, in der
finanzielle Ausnutzung ein reales Risiko ist, ist das nicht harmlos.

**Wenn eingeschaltet:** keine Zahlung ohne zweite, ausdrückliche Bestätigung –
als Prüfbedingung in der Datenbank.

---

## E-17 Sensible Daten liegen in eigenen Tabellen

**Entscheidung:** Unterstützungsbedarf und Kontaktdaten sind eigene Tabellen mit
eigenen Regeln, nicht Spalten im Profil.

**Warum:** Ein `select *` auf das Profil kann sie dann nicht versehentlich
mitnehmen. Eine zu weit gefasste Abfrage ist der wahrscheinlichste Weg, auf dem
sensible Daten irgendwo landen, wo sie nicht hingehören.

---

## E-18 Vier Augen bei Fachqualifikation und Sperrung

**Entscheidung:** Beide Handlungen brauchen zwei verschiedene berechtigte
Personen. Selbstfreigabe ist ausgeschlossen.

**Warum:** Eine falsch anerkannte Pflegequalifikation kann Menschen gefährden.
Eine unberechtigte Sperrung nimmt jemandem die Existenzgrundlage.

---

## E-19 Die Bedienhilfen liegen in der Kopfzeile, nicht als schwebender Knopf

**Entscheidung:** Ursprünglich war ein schwebender Knopf unten rechts geplant.
Der Browser-Test hat gezeigt, dass er das jeweils letzte Bedienelement verdeckt.

**Warum geändert:** Ein Overlay über dem Inhalt verstößt gegen WCAG 2.4.11 und
trifft ausgerechnet bei großer Schrift am stärksten – also die Menschen, die den
Knopf am ehesten brauchen.

---

## E-20 Interne Importe ohne `.js`-Endung

**Entscheidung:** Relative Importe im Monorepo stehen ohne Dateiendung.

**Warum:** Webpack (Next.js) löst `./x.js` nicht auf `x.ts` auf. Endungslos
funktioniert mit TypeScript (`moduleResolution: Bundler`), Vitest, Metro und
Webpack gleichermaßen.

**Preis:** Der Kern ist damit nicht ohne Bundler in Node ausführbar. Da er nur
über App, Adminbereich und Vitest genutzt wird, kostet das nichts.

---

## E-21 React Native 0.86.2 statt der neuesten Version

**Entscheidung:** Die Versionen von React Native, React und den
Expo-Bibliotheken folgen der Kompatibilitätsliste von Expo SDK 57.

**Warum:** Mit React Native 0.87 bricht der Web-Export von Expo
(`rn-get-polyfills` ist aus der Exportliste entfernt). Ein „neuer ist besser"
kostet hier den kompletten Web-Build.

---

## Offene Entscheidungen

| Nummer | Frage | Wer entscheidet |
| --- | --- | --- |
| O-01 | WebRTC-Anbieter für Videoanrufe | Technik + Datenschutz |
| O-02 | Karten- und Geokodierungsanbieter, oder selbst hosten | Technik + Datenschutz |
| O-03 | Spracherkennung auf dem Gerät oder serverseitig | Technik + Datenschutz |
| O-04 | Welche Nachweise sind verpflichtend (Führungszeugnis, Versicherung, Gewerbe) | Recht |
| O-05 | Rechtliches Verhältnis: Vermittlung oder Arbeitgeberrolle | Recht |
| O-06 | Zahlungsdienstleister und Abrechnung über Kostenträger | Produkt + Recht |
| O-07 | Wer prüft Leichte Sprache, wer produziert die DGS-Videos | Produkt |
| O-08 | Betrieb des Sicherheitsteams: Zeiten, Besetzung, Eskalation | Betrieb |

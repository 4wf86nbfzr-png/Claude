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

## E-22 Untertitel gehören zur Oberfläche, nicht ins Video

**Entscheidung:** Untertitel werden von der App gezeichnet – nicht ins Video
gebrannt und nicht über die Untertitelspur des Betriebssystems.

**Warum:** Eine eingebrannte Zeile bleibt klein, egal was jemand eingestellt
hat. Genau die Menschen, die Untertitel brauchen, brauchen sie oft groß. Über
unsere eigene Ebene folgen sie der Schriftgröße und dem Kontrastmodus. Der
Browser-Test misst das: 160 Prozent Schrift, 18 → 29 Punkt.

**Preis:** Ein eigener WebVTT-Parser und eine eigene Taktung. Beides ist klein
und getestet.

---

## E-23 Untertitel stehen unter dem Video, nicht darüber

**Entscheidung:** Ursprünglich lag die Untertitelzeile als Overlay über dem
unteren Bildrand. Der erste Blick auf den fertigen Abspieler hat gezeigt, dass
sie genau dort liegt, wo bei Gebärdensprache die Hände sind.

**Warum geändert:** Bei einem Gebärdensprach-Video ist das untere Bilddrittel
kein Rand, sondern Inhalt. Ein Untertitel darüber verdeckt das, was er
begleiten soll.

**Nebenwirkung, die passt:** Der Platz unter dem Video ist reserviert. Die
Oberfläche springt nicht, wenn eine Zeile kommt oder geht.

---

## E-24 Gekennzeichnete Platzhaltervideos statt gar keiner Videos

**Entscheidung:** Für alle 18 Kernabläufe liegen erzeugte Platzhalter bei –
eine Textkarte, die im Bild „PLATZHALTER" und „Dies ist kein
Gebärdensprach-Video" trägt. Der Status bleibt `placeholder`, die Abdeckung im
Adminbereich weiterhin 0 von 18.

**Warum:** Ohne abspielbares Material lässt sich nicht prüfen, ob der Abspieler
taugt – Untertitel, Fokusreihenfolge, Vollbild, Screenreader. Die Alternative
wäre gewesen, den Abspieler ungetestet auszuliefern.

**Wo die Grenze liegt:** Der Platzhalter zeigt bewusst keine Person und keine
Gebärde. Eine Attrappe, die nach Gebärdensprache aussieht, wäre schlimmer als
gar nichts – sie würde vortäuschen, dass eine Übersetzung existiert.

**Transkript und Untertitel sind dagegen echt** und für alle 18 Abläufe
vollständig. Für gehörlose Menschen ist ein verlässlicher Text heute mehr wert
als ein Versprechen. Er ersetzt die Gebärdensprache nicht: DGS ist eine eigene
Sprache, kein verschriftetes Deutsch.

---

## E-25 Bedieneinstellungen werden gespeichert

**Entscheidung:** Schriftgröße, Kontrast, Bewegung, Vorlesen, Leichte Sprache,
Gebärdensprache und Tippflächengröße überleben den Neustart.

**Warum:** Aufgefallen ist es im Browser-Test – nach dem Neuladen stand die
Schrift wieder auf 100 Prozent. Wer 200 Prozent braucht, müsste sie bei jedem
Öffnen neu einstellen. Das ist keine Kleinigkeit, sondern macht die
Einstellungen wertlos.

**Robust gegen fehlenden Speicher:** In einem privaten Fenster oder in der
Datei-Fassung kann die Ablage gesperrt sein. Dann läuft die App weiter, nur
ohne Gedächtnis – statt abzustürzen.

---

## E-26 Das Startbild ist Inhalt, kein Dekor

**Entscheidung:** Das Foto auf der Startseite läuft randlos über die volle
Breite, trägt eine Beschreibung in ganzen Sätzen und nimmt höchstens 45 Prozent
der Bildschirmhöhe ein.

**Warum die Deckelung:** Ohne sie müsste man bei großer Schrift erst am Bild
vorbeiscrollen, bevor die erste Schaltfläche auftaucht.

**Warum kein Text im Bild:** Schrift in einem Foto skaliert nicht mit der
Einstellung und lässt sich im Hochkontrastmodus nicht anpassen. Überschrift und
Vorspann stehen deshalb darunter auf ruhigem Grund.

**Offen:** Einwilligung der abgebildeten Personen und Nutzungslizenz sind vor
dem Start zu dokumentieren (siehe `LAUNCH_CHECKLIST.md`).

---

## E-27 Eine Freigabepflicht braucht eine Grundlage

**Entscheidung:** Eine verantwortliche Person kann Handlungen freigeben – aber
nur, wenn dafür eine von genau zwei Grundlagen hinterlegt ist: der eigene
Wunsch der Person, oder ein gerichtlicher Einwilligungsvorbehalt nach § 1825
BGB mit Aktenzeichen. Ohne Grundlage speichert die App gar nichts.

**Warum:** Ein volljähriger Mensch mit Geschäftsfähigkeit braucht niemandes
Zustimmung. Eine Freigabepflicht ohne Grundlage wäre schlicht eine
Bevormundung – und rechtlich unwirksam. Wer die App für jemanden einrichtet,
handelt oft gut gemeint; genau deshalb muss das Produkt hier die Grenze
ziehen, nicht die Person am Bildschirm.

**Folge:** Eine selbst gewünschte Freigabepflicht kann die Person jederzeit
allein beenden. Einen gerichtlichen Vorbehalt nicht – dafür ist das
Betreuungsgericht zuständig, und die App sagt das auch so.

**Doppelt abgesichert:** `validateGrant` in der Anwendung und drei
Prüfbedingungen in `trusted_access_grants`.

---

## E-28 Keine stille Zustimmung durch Zeitablauf

**Entscheidung:** Läuft die Antwortfrist ab, passiert nichts. Der Vorgang
bleibt offen, wird als überfällig angezeigt und erinnert.

**Warum nicht automatisch zustimmen:** Dann wäre die Freigabe wertlos – und
eine schweigende Person hätte einer Buchung zugestimmt, die sie nie gesehen
hat.

**Warum nicht automatisch ablehnen:** Dann könnte jemand ein Anliegen
blockieren, indem er einfach nicht reagiert. Die Person würde nie erfahren,
warum. Also: sichtbar offen halten, erinnern, und die betroffene Person kann
selbst nachfragen oder zurückziehen.

---

## E-29 Eine Ablehnung braucht eine Begründung

**Entscheidung:** Ohne Begründungstext lässt sich nicht ablehnen – in der
Oberfläche ist die Schaltfläche gesperrt, in der Anwendung wirft es, in der
Datenbank steht eine Prüfbedingung.

**Warum:** Wer für einen anderen Menschen entscheidet, schuldet ihm eine
Erklärung. Ein wortloses Nein ist die Form von Fürsorge, die Menschen klein
hält.

---

## E-30 Eine Freigabe ersetzt keine Entscheidung

**Entscheidung:** Nach der Zustimmung ist der Termin nicht gebucht. Die Person
bestätigt weiterhin selbst – die Freigabe macht das nur möglich.

**Warum:** Sonst würde die verantwortliche Person an ihrer Stelle handeln. Der
Unterschied ist klein im Code und groß im Leben.

---

## E-31 Der Überblick für Verantwortliche ist nicht heimlich

**Entscheidung:** Alles, was eine verantwortliche Person sieht, sieht die
betroffene Person in ihrer eigenen App unter „Wer entscheidet mit" – samt
Umfang der Berechtigung und Stand jeder Freigabe.

**Warum:** Ohne diesen Gegenpol wäre die Übersicht eine Beobachtung. Der
Auftrag war „Überblick, was beim Klienten passiert" – nicht Überwachung. Der
Unterschied ist, dass die beobachtete Person es weiß und ändern kann.

---

## E-32 Zwei Ansprüche an die Oberfläche, ein Anspruch an die Haltung

**Entscheidung:** Der Bereich für Verantwortliche darf dichter sein –
Listen, Kennzahlen, mehrere Klienten. Der Bereich für Menschen mit
Unterstützungsbedarf bleibt bei einem Hauptschritt pro Ansicht.

**Was NICHT unterschiedlich ist:** Tippflächen, Kontrast, Vorlesen,
Gebärdensprache, Fokus. Eine verantwortliche Person kann selbst
Unterstützungsbedarf haben. „Umfangreicher" heißt mehr Inhalt, nicht weniger
Barrierefreiheit.

---

## E-33 Demo-Daten werden zur Laufzeit aufgebaut

**Entscheidung:** `createDemoSeed(jetzt)` erzeugt den Datenstand relativ zum
übergebenen Zeitpunkt. Tests übergeben `DEMO_NOW`, die Apps die echte Uhr.

**Warum:** Vorher standen feste Datumsangaben im Datenstand. Nach ein paar
Wochen wirkte eine frische Demo kaputt – eine offene Freigabe war sofort
„überfällig", ein gültiger Nachweis abgelaufen. Aufgefallen zweimal: erst im
Adminbereich, dann im Browser-Test der Freigaben.

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
| O-09 | Wie wird geprüft, dass ein gerichtlicher Einwilligungsvorbehalt echt ist? Aktenzeichen allein belegt nichts | Recht + Betrieb |
| O-10 | Was passiert, wenn eine verantwortliche Person dauerhaft nicht antwortet? Vertretung, Eskalation, Beschwerdeweg | Recht + Betrieb |

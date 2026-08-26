# Manueller Testplan

Automatisierte Tests finden fehlende Labels und zu schwache Kontraste. Sie
finden nicht, ob ein Ablauf verständlich ist. Dieser Plan ist deshalb kein
Anhang, sondern Teil der Abnahme.

## Vorbereitung

| Gerät | Warum |
| --- | --- |
| iPhone mit VoiceOver | häufigster Screenreader unter iOS |
| Android-Gerät mit TalkBack | häufigster Screenreader unter Android |
| Android-Mittelklassegerät (3–4 Jahre alt) | reale Ausstattung vieler Nutzender |
| Tablet | Reflow und zweispaltige Darstellung |
| Externe Tastatur | Bedienung ohne Touch |
| Switch-Control-Eingabe | motorische Einschränkung |

Testdaten: `supabase/seed/seed.sql`. Alle Konten sind an „(Demo)" erkennbar.

---

## A. Screenreader

### A1 VoiceOver (iOS)

- [ ] Beim Öffnen liegt der Fokus auf der Hauptüberschrift.
- [ ] Die drei Auswahlkarten werden als Schaltflächen mit Titel **und**
      Beschreibung angesagt.
- [ ] Die Fokusreihenfolge folgt der sichtbaren Reihenfolge.
- [ ] Ein Bildschirmwechsel setzt den Fokus auf die neue Überschrift, nicht
      zurück an den Anfang.
- [ ] Eine ausgewählte Karte wird als „ausgewählt" angesagt.
- [ ] Ein Feldfehler wird sofort angesagt und nennt das Feld.
- [ ] Der Fortschritt wird als „Schritt 3 von 5" angesagt.
- [ ] Der Platzhalter-Avatar wird als „Kein Foto vorhanden" angesagt, nicht als
      Bild ohne Beschreibung.
- [ ] Der eigene Vorlesemodus schweigt – es spricht nur VoiceOver.
- [ ] Die Buchungszusammenfassung ist Zeile für Zeile erfassbar.
- [ ] Die Vergleichstabelle liest je Zeile Beschriftung und alle Werte.

### A2 TalkBack (Android)

- [ ] Dieselben Punkte wie A1.
- [ ] Wischgesten für Überschriften springen sinnvoll.
- [ ] Der Zustand „deaktiviert" wird beim gesperrten Buchen-Knopf angesagt.

---

## B. Tastatur und Switch Control

- [ ] Jedes Bedienelement ist per Tabulator erreichbar.
- [ ] Der Fokus ist **immer** sichtbar, auch auf farbigen Flächen.
- [ ] Keine Tastaturfalle.
- [ ] Der Fokus wird nie von einem anderen Element verdeckt (WCAG 2.4.11) –
      besonders am unteren Bildschirmrand mit großer Schrift prüfen.
- [ ] Ein kompletter Anfrageablauf ist ohne Maus und ohne Touch möglich.
- [ ] Im Adminbereich springt „Direkt zum Inhalt" korrekt.

---

## C. Sehen

### C0 Einstellungen bleiben

- [ ] Schrift vergrößern, App vollständig schließen und neu öffnen: die
      Einstellung ist noch da.
- [ ] Dasselbe für Kontrast, Vorlesen, Leichte Sprache und Gebärdensprache.
- [ ] Im privaten Fenster: die App läuft weiter, auch wenn nichts gespeichert
      werden kann.

### C1 Große Schrift

- [ ] Systemschrift auf Maximum: kein Text abgeschnitten, keine überlappenden
      Zeilen.
- [ ] Zusätzlich in der App auf 250 %: alle Schaltflächen weiterhin erreichbar.
- [ ] Kein waagerechtes Scrollen der Seite. Nur die Vergleichstabelle scrollt
      in sich.
- [ ] Lange Wörter („Barrierefreiheitserklärung") brechen sauber um.
- [ ] Das Bild auf der Startseite drängt die erste Schaltfläche nicht aus dem
      sichtbaren Bereich.
- [ ] Das Bild wird mit Screenreader als beschriebenes Bild angesagt.

### C2 Kontrast und Farbe

- [ ] Hochkontrastmodus: alle Texte und Bedienelemente gut lesbar.
- [ ] Mit Graustufenfilter bleibt jede Information erkennbar – Auswahl, Status,
      Fehler, Erfolg.
- [ ] Dunkler Modus vollständig, keine hellen Restflächen.

### C3 Zoom

- [ ] Bildschirmlupe bei 400 %: Bedienung bleibt möglich.

---

## D. Bewegung

- [ ] System „Bewegung reduzieren" an: keine Übergänge, keine Animation, auch
      wenn die App-Einstellung anders steht.
- [ ] Keine blinkenden Effekte.
- [ ] Keine automatisch verschwindenden Inhalte.

---

## E. Einfach-Modus

- [ ] Tippflächen deutlich größer als 48 dp.
- [ ] Pro Ansicht genau eine Hauptaufgabe.
- [ ] Leichte Sprache ist überall aktiv, wo ein Text hinterlegt ist.
- [ ] Der Hinweis „Dieser Text ist ein Entwurf" ist sichtbar.
- [ ] Vorlesen ist von Anfang an an.
- [ ] Ein Wechsel nach „Standard" und zurück verliert keine Eingaben.

---

## F. Sprache

- [ ] Vorlesen liest Überschrift und Einleitung, nicht die Navigation.
- [ ] Pause, Wiederholung und Geschwindigkeit funktionieren.
- [ ] Spracheingabe: das Transkript ist sichtbar und änderbar.
- [ ] „Termin bestätigen" per Sprache führt zur Rückfrage, **nicht** zur Buchung.
- [ ] Mikrofonberechtigung verweigert: die App nennt Grund und Alternative.
- [ ] Bei Umgebungslärm wird nachgefragt statt geraten.
- [ ] Das Mikrofon stoppt automatisch und ist sichtbar, solange es läuft.

### F2 Sprachführung („Sagen Sie einfach, was Sie brauchen")

- [ ] Mika begrüßt beim Öffnen und stellt die Frage. Vorlesen aus, Screenreader
      an: die Begrüßung kommt als Ansage, nicht als zweite Stimme.
- [ ] Der verstandene Wortlaut steht als Text da, bevor irgendetwas passiert.
- [ ] „Ich möchte zum Arzt begleitet werden": führt in die Anfrage, Kategorie
      ist angekreuzt, **nichts ist abgeschickt**.
- [ ] Ein unverständlicher Satz führt nirgendwohin, sondern zur Nachfrage.
- [ ] „Notruf" im Satz: 112 und 110 stehen da, kein Formular.
- [ ] Mikrofon verweigert oder nicht vorhanden: der Grund steht da, das
      Textfeld und die Beispielsätze führen zum selben Ergebnis.
- [ ] Auf einem Gerät ohne Zuhören ist der Knopf beschriftet mit dem, was ist –
      und nicht einfach still.
- [ ] Mit undeutlicher Aussprache probieren (jemand, der nuschelt oder eine
      Sprechbehinderung hat): Was passiert? Wird geraten oder nachgefragt?
- [ ] Vor dem Weitergehen gibt es „Nein, das war nicht richtig".

### F3 Verständigung (wenn jemand nicht sprechen kann)

- [ ] Karten ergeben einen Satz, der **vor** dem Sprechen vollständig zu lesen
      ist.
- [ ] Eine einzelne gewählte Karte lässt sich zurücknehmen, ohne alles zu
      verwerfen.
- [ ] Getippter Text hängt sich an und wird mitgesprochen.
- [ ] Das Gegenüber kann mit Karten antworten, ohne zu tippen.
- [ ] Das Gespräch lässt sich löschen und ist danach weg.
- [ ] Auf dem Bildschirm steht, dass dies kein Gebärdensprach-Übersetzer ist.
- [ ] Die Gruppe „Meine Grenzen" ist erreichbar, ohne vorher zu scrollen –
      im Einfach-Modus und mit 250 % Schrift geprüft.
- [ ] Mit Screenreader: Jede Karte nennt ihre Beschriftung und was gesprochen
      wird.

---

## G. Gebärdensprache

### G1 Der Ablauf (heute prüfbar)

- [ ] Auf jedem Bildschirm gibt es „In Gebärdensprache ansehen".
- [ ] Mit eingeschalteter Einstellung ist der Bereich sofort offen.
- [ ] Über dem Video steht, dass noch kein geprüftes Video vorliegt.
- [ ] Abspielen, Pause, fünf Sekunden zurück und von vorn funktionieren.
- [ ] Geschwindigkeit lässt sich auf 0,5 und 0,75 stellen.
- [ ] Vollbild funktioniert und lässt sich wieder verlassen.
- [ ] Untertitel lassen sich aus- und wieder einblenden.
- [ ] Untertitel wechseln passend zur Wiedergabe.
- [ ] **Untertitel wachsen mit der eingestellten Schriftgröße mit.**
- [ ] Untertitel verdecken das Videobild nicht.
- [ ] Das Transkript ist auch ohne Wiedergabe vollständig lesbar.
- [ ] Mit VoiceOver und TalkBack: alle Bedienelemente sind beschriftet, die
      Wiedergabezeit wird angesagt, der Fokus geht nicht verloren.
- [ ] Das Video startet nie von selbst.

### G2 Nach der Produktion (mit echten Aufnahmen)

- [ ] Die gebärdende Person ist vollständig im Bild, auch die Hände unten.
- [ ] Untertitel und Transkript stimmen mit der Aufnahme überein.
- [ ] Der Name der prüfenden Person steht am Video.
- [ ] Die Abdeckung im Adminbereich zählt hoch.
- [ ] Auf iOS und Safari spielt das Video ab (Formatfrage, siehe
      LAUNCH_CHECKLIST.md).
- [ ] Ein ungeprüfter Gebärdensprach-Hinweis am Anbieterprofil ist als solcher
      gekennzeichnet.
- [ ] **Test mit gehörlosen Menschen, DGS als Erstsprache** – ohne den gilt
      dieser Abschnitt nicht als abgeschlossen.

## G3 Die Begleitung

- [ ] Auf jedem Bildschirm ist „Mika fragen" erreichbar – außer auf Mikas
      eigenen beiden Bildschirmen, wo die Rückfragen offen auf der Seite
      stehen.
- [ ] Daneben steht ein eigener Knopf für Gebärdensprache.
- [ ] Mika nennt sich sichtbar als kein Mensch.
- [ ] Mika sagt, nicht selbst zu gebärden.
- [ ] Die vier Erklärungen stimmen mit dem Bildschirm überein.
- [ ] Rückfragen lassen sich öffnen und vorlesen.
- [ ] Mit Screenreader: die Antwort wird nach dem Antippen angesagt.
- [ ] Im Einfach-Modus erscheinen die kurzen Fassungen.

## H. Fachliche Abläufe

### H1 Anfrage

- [ ] Weiter ohne Auswahl: Fehler am Feld mit Korrekturvorschlag.
- [ ] Termin in der Vergangenheit wird abgelehnt.
- [ ] App wechseln und zurück: der Entwurf ist noch da.
- [ ] Die Zusammenfassung stimmt mit den Eingaben überein.
- [ ] Eine Pflegekategorie wird als „nur für geprüfte Fachkräfte" gekennzeichnet.

### H2 Vorschläge

- [ ] Zu jedem Vorschlag stehen Gründe.
- [ ] Entfernungen nur grob, nie metergenau.
- [ ] Ehrenamt wird als „kostenlos" ausgewiesen.
- [ ] Ein ungeprüfter Gebärdensprach-Hinweis wird angezeigt.
- [ ] Die Listenansicht ist der Karte gleichwertig.

### H3 Buchung

- [ ] Vor der Bestätigung erscheint die vollständige Zusammenfassung.
- [ ] Ohne Lesebestätigung ist der Buchen-Knopf gesperrt.
- [ ] Eine Bestätigung allein macht die Buchung nicht verbindlich.
- [ ] Erst nach beiden Bestätigungen wird der Treffpunkt freigegeben.
- [ ] Ohne Kontaktfreigabe erklärt die App verständlich, was fehlt.
- [ ] Vor einer Absage wird ehrlich gesagt, was sie kostet.
- [ ] Nach einer Absage sind Telefonnummer und Adresse wieder verborgen.

### H4 Anbietende

- [ ] Ohne geprüfte Nachweise erscheint die Rolle als „private
      Unterstützungsperson".
- [ ] Erlaubnispflichtige Anfragen sind ohne Fachnachweis nicht sichtbar.
- [ ] „Das mache ich ausdrücklich nicht" ist Pflichtfeld.
- [ ] Die Vorschau entspricht der tatsächlichen Anzeige.
- [ ] Ein ablaufender Nachweis wird rechtzeitig gemeldet.

### H4b Planer und Kalender

- [ ] Der Planer zeigt die Woche und lässt sich blättern.
- [ ] Ein Einsatz lässt sich in den Kalender legen.
- [ ] Im Kalendereintrag stehen **kein Name und keine Adresse** – auf dem
      Gerät nachprüfen, nicht nur in der App.
- [ ] Der Eintrag erscheint mit richtiger Zeit und Dauer, auch über die
      Sommerzeitumstellung hinweg.
- [ ] Der Abo-Link lässt sich im Kalender des Handys abonnieren.
- [ ] Ein neuer Link macht den alten sofort ungültig.
- [ ] Eine Absage kommt im verbundenen Kalender an.
- [ ] Bei einer passenden neuen Anfrage kommt eine Benachrichtigung.
- [ ] In der Benachrichtigungs-Vorschau steht nie der Inhalt der Anfrage.
- [ ] Eine erlaubnispflichtige Anfrage erreicht nur geprüfte Fachkräfte.

### H5 Schutz

- [ ] Der Meldeweg ist von jedem Bildschirm erreichbar.
- [ ] Eine kritische Meldung nennt die Bearbeitungszusage.
- [ ] Der Freitext der Meldung erscheint in keiner Übersicht.
- [ ] Die private Rückmeldung ist von der öffentlichen Bewertung getrennt.
- [ ] Notrufnummern sind mit einem Tipp erreichbar.

### H6 Verantwortliche Personen

- [ ] Die Startseite führt in drei Richtungen; Hilfesuchende stehen oben.
- [ ] Beim Einrichten ist „Begleitung" voreingestellt.
- [ ] Eine Freigabepflicht lässt sich ohne Grundlage nicht speichern.
- [ ] Ein gerichtlicher Einwilligungsvorbehalt verlangt das Aktenzeichen.
- [ ] Die Einrichtung verlangt die Bestätigung, dass die Person dabei ist.
- [ ] Eine offene Freigabe erscheint in der Übersicht mit Frist.
- [ ] Ablehnen ohne Begründung ist gesperrt.
- [ ] Nach Zustimmung ist der Termin **noch nicht** gebucht – die Person
      bestätigt selbst.
- [ ] Nach Ablehnung sieht die Person die Begründung im Wortlaut.
- [ ] Ohne Antwort passiert nichts: der Vorgang bleibt offen, wird als
      überfällig angezeigt.
- [ ] Die Person sieht unter „Wer entscheidet mit" jede offene Freigabe.
- [ ] Sie kann ihr eigenes Anliegen jederzeit zurückziehen.
- [ ] Eine selbst gewünschte Freigabepflicht kann sie allein beenden.
- [ ] Ein gerichtlicher Vorbehalt lässt sich nicht allein beenden, und die App
      erklärt warum.
- [ ] Der Bereich für Verantwortliche ist mit Screenreader und großer Schrift
      genauso bedienbar wie der übrige Teil.

### H7 Vertrauensperson

- [ ] Die suchende Person sieht jederzeit, was erlaubt ist.
- [ ] Ein Widerruf wirkt sofort.
- [ ] Eine gemeinsam erteilte Einwilligung wird als solche protokolliert.

---

## I. Verbindung und Leistung

- [ ] Flugmodus während des Assistenten: der Entwurf bleibt, der Zustand ist
      klar.
- [ ] Absenden bei schlechter Verbindung erzeugt keine doppelte Buchung.
- [ ] Startzeit auf einem Mittelklassegerät unter drei Sekunden.
- [ ] Scrollen bleibt flüssig, auch mit 250 % Schrift.
- [ ] Die Startanimation läuft einmal und bleibt dann stehen.
- [ ] Bei „Bewegung reduzieren" (in der App und im System) wird sie gar nicht
      erst geladen; das Standbild zeigt dasselbe Bild.
- [ ] Sie hat keinen Ton, auch nicht bei aufgedrehter Lautstärke.

---

## J. Tests mit Betroffenen

Siehe [`docs/RESEARCH.md`](docs/RESEARCH.md). Ohne diese Tests ist der Plan
nicht abgeschlossen – die Punkte oben prüfen die Umsetzung, nicht die
Verständlichkeit.

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

### C1 Große Schrift

- [ ] Systemschrift auf Maximum: kein Text abgeschnitten, keine überlappenden
      Zeilen.
- [ ] Zusätzlich in der App auf 250 %: alle Schaltflächen weiterhin erreichbar.
- [ ] Kein waagerechtes Scrollen der Seite. Nur die Vergleichstabelle scrollt
      in sich.
- [ ] Lange Wörter („Barrierefreiheitserklärung") brechen sauber um.

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

---

## G. Gebärdensprache

- [ ] Ohne produziertes Video steht überall der Hinweis, dass es fehlt.
- [ ] Nirgends wird behauptet, die Übersetzung sei vollständig.
- [ ] Nach der Produktion: Untertitel, Transkript, Vollbild, Geschwindigkeit
      und Pause steuerbar.
- [ ] Der Name der prüfenden Person steht am Video.
- [ ] Ein ungeprüfter Gebärdensprach-Hinweis am Anbieterprofil ist als solcher
      gekennzeichnet.

---

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

### H5 Schutz

- [ ] Der Meldeweg ist von jedem Bildschirm erreichbar.
- [ ] Eine kritische Meldung nennt die Bearbeitungszusage.
- [ ] Der Freitext der Meldung erscheint in keiner Übersicht.
- [ ] Die private Rückmeldung ist von der öffentlichen Bewertung getrennt.
- [ ] Notrufnummern sind mit einem Tipp erreichbar.

### H6 Vertrauensperson

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

---

## J. Tests mit Betroffenen

Siehe [`docs/RESEARCH.md`](docs/RESEARCH.md). Ohne diese Tests ist der Plan
nicht abgeschlossen – die Punkte oben prüfen die Umsetzung, nicht die
Verständlichkeit.

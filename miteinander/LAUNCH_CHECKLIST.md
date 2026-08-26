# Vor dem Live-Gang

Nichts hiervon ist optional. Punkte mit **[Sperre]** verhindern den Start.

## 1. Recht

- [ ] **[Sperre]** Datenschutz-Folgenabschätzung nach Art. 35 DSGVO. Verarbeitet
      werden Daten besonderer Kategorien von Menschen in verletzlicher Lage.
- [ ] **[Sperre]** Prüfung durch eine Datenschutzfachperson.
- [ ] **[Sperre]** Anwaltliche Klärung des Geschäftsmodells: Vermittlung oder
      Arbeitgeberrolle, Haftung, AGB, Widerrufsrecht.
- [ ] **[Sperre]** Festlegung, welche Nachweise verpflichtend sind: erweitertes
      Führungszeugnis, Haftpflichtversicherung, Gewerbeanmeldung, steuerliche
      und sozialversicherungsrechtliche Einordnung. Der Prüfprozess ist
      konfigurierbar angelegt und wartet auf diese Festlegung.
- [ ] **[Sperre]** Klärung, ob das Produkt unter das BFSG fällt, und ab wann.
- [ ] **[Sperre]** Rechtliche Prüfung des Freigabe-Konstrukts: Wie wird ein
      gerichtlicher Einwilligungsvorbehalt (§ 1825 BGB) belegt – ein
      Aktenzeichen allein beweist nichts? Was gilt bei dauerhaftem Schweigen
      der verantwortlichen Person? Welcher Beschwerdeweg steht der betroffenen
      Person offen?
- [ ] Verzeichnis von Verarbeitungstätigkeiten (Art. 30).
- [ ] Auftragsverarbeitungsverträge mit allen Dienstleistern.
- [ ] Verfahren für Datenschutzverletzungen (Art. 33/34), erprobt.
- [ ] Impressum, AGB, Datenschutzhinweise – auch in Leichter Sprache.

## 2. Barrierefreiheit

- [ ] **[Sperre]** DGS-Videos für alle 18 Kernabläufe produziert und von
      DGS-Muttersprachler:innen oder qualifizierten Fachleuten geprüft.
      Stand heute: 0 von 18. Abspieler, Untertitel und Transkripte sind
      fertig; ausgeliefert werden gekennzeichnete Platzhalter. Die
      inhaltlichen Vorlagen stehen in
      `packages/core/src/content/dgs-skripte.ts`.
- [ ] **[Sperre]** Videoformat für den Produktivbetrieb festlegen: die
      Platzhalter sind VP8/WebM. Für iOS und Safari wird zusätzlich
      H.264/MP4 gebraucht.
- [ ] **[Sperre]** Leichte-Sprache-Texte von einer Prüfgruppe aus Menschen mit
      Lernschwierigkeiten geprüft. Stand heute: 0 von 12.
- [ ] **[Sperre]** Unabhängiges Barrierefreiheits-Audit gegen WCAG 2.2 AA und
      EN 301 549.
- [ ] **[Sperre]** Manueller Testdurchlauf nach [`TESTPLAN.md`](TESTPLAN.md) mit
      VoiceOver, TalkBack, Tastatur, Switch Control, großer Schrift, Zoom,
      hohem Kontrast und reduzierter Bewegung.
- [ ] Nutzungstests mit Betroffenen nach [`docs/RESEARCH.md`](docs/RESEARCH.md);
      Erkenntnisse priorisiert und eingeplant.
- [ ] Barrierefreiheits-Erklärung um die gesetzlich vorgeschriebenen Angaben
      ergänzt; Bearbeitungszusage für Rückmeldungen verbindlich festgelegt.
- [ ] Schriftdateien (Atkinson Hyperlegible) lokal eingebunden und lizenziert.
- [ ] **[Sperre]** Für jedes Foto in der App: Einwilligung der abgebildeten
      Personen und Nutzungslizenz dokumentiert. Betrifft aktuell das Bild auf
      der Startseite – **auch in seiner bewegten Fassung**
      (`assets/bilder/startbild.webm`).
- [ ] **[Sperre]** Rechte am Logo und am Namen „Helpmate" klären:
      Markenrecherche, Verwendungsrechte an der Wort-Bild-Marke,
      Domain. Der Name steht im Produkt an einer Stelle
      (`packages/core/src/config/app-config.ts`) und ist bis zur Klärung
      billig zu wechseln.
- [ ] **[Sperre]** Vor dem Einschalten des Zuhörens in der nativen App
      entscheiden (O-14), ob die Erkennung auf dem Gerät läuft oder Audio an
      einen Dienst geht – und im zweiten Fall Einwilligung, AV-Vertrag und
      Bildschirmtext dafür vorbereiten. In der Web-Fassung steht der Hinweis
      zur Web Speech API bereits am Knopf.
- [ ] Die Sprachführung mit Menschen testen, deren Aussprache von einer
      Erkennung schlecht verstanden wird (Dysarthrie, Sprechapraxie, nach
      einem Schlaganfall). Ergebnis muss sein: Der getippte Weg ist nicht
      langsamer und nicht schlechter beschriftet.
- [ ] Bildbeschreibungen redaktionell geprüft – nicht nur vorhanden, sondern
      auch zutreffend und respektvoll formuliert.

## 3. Sicherheit und Schutz

- [ ] **[Sperre]** Schriftliches Schutzkonzept, geprüft von einer Fachperson für
      Gewaltschutz in der Eingliederungshilfe. Ausdrücklich mit zu prüfen:
      der Missbrauch der Verantwortlichen-Rolle. Wer für einen Menschen
      verantwortlich ist, hat Macht über ihn.
- [ ] **[Sperre]** Sicherheitsteam besetzt: Zeiten, Vertretung, Eskalationsweg.
      Ohne Besetzung sind die Bearbeitungszusagen (1 Stunde bei kritischen
      Fällen) nicht haltbar.
- [ ] **[Sperre]** Penetrationstest, Befunde behoben.
- [ ] Rate Limits für Anmeldung, Nachrichten und Meldungen.
- [ ] Upload-Scanning für Nachweise und Medien.
- [ ] Mehrfaktor-Anmeldung für alle Verwaltungskonten erzwungen.
- [ ] Signierte URLs mit kurzer Gültigkeit für Dokumente.
- [ ] Prozess für die tägliche Ausführung von `expire_verifications()`.
- [ ] Wiederherstellung aus dem Backup einmal geprobt.

## 4. Inhalte und Betrieb

- [ ] Betreiber, Support-, Datenschutz- und Barrierefreiheitsadresse in
      `.env` eingetragen (stehen aktuell als Platzhalter).
- [ ] Alle Demo-Daten aus der Produktionsumgebung entfernt. Sie sind an
      „(Demo)" und `.invalid`-Adressen erkennbar.
- [ ] Notrufnummern für den tatsächlichen Betriebsraum geprüft.
- [ ] Hilfetexte und Kategorien redaktionell durchgesehen.
- [ ] Alle Erklärungen der Begleitung gegen die tatsächlichen Abläufe geprüft.
      Eine falsche Erklärung ist schlimmer als keine.
- [ ] Onboarding-Material für das Prüf- und Sicherheitsteam.

## 5. Technik

- [ ] **[Sperre]** Supabase-Adapter für `DataContext` implementiert. Die App
      läuft derzeit gegen die In-Memory-Schicht.
- [ ] **[Sperre]** Row-Level-Security auf einer echten Instanz verifiziert:
      für jede Rolle prüfen, dass nur das Erlaubte lesbar ist.
- [ ] WebRTC-Anbieter gewählt, EU-Verarbeitung, keine Aufzeichnung ohne
      Einwilligung.
- [ ] Karten-/Geokodierungsanbieter gewählt oder selbst gehostet.
- [ ] Spracherkennung angebunden; Verarbeitung auf dem Gerät bevorzugt.
- [ ] Push-Benachrichtigungen eingerichtet, Vorschauen bleiben inhaltsarm.
- [ ] **[Sperre]** Auslieferung des Abo-Kalenders geklärt: Wo liegt der Feed,
      wie werden Schlüssel gespeichert, wie zurückgezogen? (O-12)
- [ ] Kalendereinträge auf echten Geräten geprüft – iOS, Android, Outlook –
      einschließlich Zeitzone und Sommerzeit.
- [ ] Biometrische Anmeldung über die Betriebssystemfunktionen umgesetzt.
- [ ] CI: Lint, Typecheck, Unit-, Integrations-, Accessibility- und
      End-to-End-Tests bei jedem Pull Request.
- [ ] Fehlerüberwachung ohne personenbezogene Daten.
- [ ] Ladezeit und Flüssigkeit auf Mittelklassegeräten gemessen.
- [ ] Verhalten bei schlechter Verbindung geprüft: Entwürfe bleiben erhalten,
      keine doppelten Buchungen.

## 6. Erst nach dem Start

- [ ] Rückmeldungen zur Barrierefreiheit haben Vorrang; Status wird
      nachvollziehbar dokumentiert.
- [ ] Regressionstests für jede behobene Barriere.
- [ ] Regelmäßige Nutzungstests mit Betroffenen.
- [ ] Jährliche Überprüfung der Barrierefreiheits-Erklärung.

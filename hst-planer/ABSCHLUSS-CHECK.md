# Abschluss-Check

Die 23 Punkte aus Abschnitt 30 des SecPlan, einzeln durchgegangen.
Stand: 25.09.2026.

**Vorweg, weil es der wichtigste Punkt ist:** Dieses System behauptet an keiner
Stelle, DSGVO-konform zu sein. Es unterscheidet durchgehend zwischen

* **technisch umgesetzt** – im System vorhanden und im Quelltext nachlesbar, und
* **rechtlich geprüft** – von einer benannten Person bewertet.

Das erste lässt sich hier feststellen. Das zweite nie. Der Planer unterstützt die
Einhaltung der Vorgaben und hält Nachweise vor; er ersetzt keine rechtliche Prüfung.

---

## 1. Keine öffentlich erreichbaren Dokumente

**Technisch umgesetzt.** Dateien liegen unter `STORAGE_PATH` außerhalb des
ausgelieferten Verzeichnisses und unter einer zufälligen ID – der Originalname steht
nur in der Datenbank. Es gibt keine Adresse, unter der eine Datei ohne Prüfung liegt.
Der Abruf läuft ausschließlich über `/api/dokumente/:id`.

Nachweis: `src/lib/storage.ts`, `src/app/api/dokumente/[id]/route.ts`,
`tests/dokumente.test.ts`.

## 2. Keine unsicheren Downloadlinks

**Technisch umgesetzt.** Für die Weitergabe gibt es kurzlebige Token: eine Datei, eine
Person, eine Stunde, ein Abruf. Gespeichert wird nur der Hash. Wer den Link weitergibt,
verbraucht ihn – und der Abruf steht mit Zeitpunkt im Protokoll.

Nachweis: `src/lib/domain/dokumentzugriff.ts`, `src/app/api/dokumente/token/[token]/route.ts`.

## 3. Keine unklaren Rollen

**Technisch umgesetzt.** Neun Rollen mit benannter Aufgabe und Reichweite, einsehbar
unter `/admin/rollen`. Die vollständige Rechtematrix steht unter `/admin/berechtigungen`
und wird aus derselben Quelle erzeugt, die auch die Prüfung macht.

Nachweis: `src/lib/auth/rbac.ts`, `tests/rechte.test.ts` (34 Tests).

## 4. Keine übermäßigen Berechtigungen

**Technisch umgesetzt.** Standard ist DENY ALL: eine Rolle kann nur, was ausdrücklich
aufgezählt ist. Keine Vererbung, kein Platzhalter – die einzige Ausnahme ist SUPERADMIN,
und die steht als eigener Zweig in `can()`. Der Sicherheitscheck listet alle Zugänge mit
weitreichenden Rechten.

Ein Test prüft für jede Rolle und jedes Recht, dass `can()` genau dann wahr ist, wenn
das Recht in der Liste steht.

## 5. Keine ungeschützten personenbezogenen Daten

**Technisch umgesetzt.** Der Sichtbarkeitsfilter der Rolle wird in jede Abfrage gemischt,
nicht nur in die Anzeige. Fehlt die Zuordnung, fällt der Filter auf einen unmöglichen
Wert zurück – lieber eine leere Liste als versehentlich alles.

Nachweis: `src/lib/queries/scope.ts`.

## 6. Keine unverschlüsselten sensiblen Informationen

**Teilweise.** Besondere Kategorien nach Art. 9 DSGVO liegen in einer eigenen Tabelle und
werden mit AES-256-GCM verschlüsselt (`src/lib/krypto.ts`), ohne stillen Rückfall auf
Klartext. Die Übertragung läuft über TLS.

**Offen:** Verschlüsselung der Datenbank im Ruhezustand und der Sicherungen. Das ist
Sache des Betriebs, nicht der Anwendung – gehört aber vor dem Produktivstart geklärt.

## 7. Keine unnötigen Datenfelder

**Technisch umgesetzt, fachlich zu prüfen.** Von Kräften eines Partnerunternehmens führt
das System weniger Daten als vom eigenen Personal; Vertrag und Vergütung liegen beim
Partner. Das Verarbeitungsverzeichnis nennt je Tätigkeit die Datenkategorien – ob jede
davon nötig ist, ist eine fachliche Entscheidung und gehört bei der Prüfung des
Verzeichnisses beantwortet.

## 8. Keine fehlenden Löschfristen

**Angelegt, im Entwurfsstand.** Acht Datenkategorien mit Zweck, Rechtsgrundlage,
Aufbewahrungsgrund, Frist, Fristbeginn und Verantwortlichem. Die Seite
`/compliance/loeschfristen` zeigt, was fällig ist, und markiert Dokumente ohne jede
Frist – ohne Frist wird nichts gelöscht.

**Rechtlich nicht geprüft.** Alle acht Regeln tragen den Status Entwurf.

## 9. Kein Zugriff ohne Protokollierung

**Technisch umgesetzt.** Drei Protokolle: fachliche Änderungen (mit altem und neuem
Wert), Dokumentzugriffe einschließlich der abgewiesenen, und Exporte mit Umfang und
Filter. Alle drei unter `/compliance/audit-log`.

## 10. Keine unkontrollierten Exporte

**Technisch umgesetzt.** Ein Export braucht ein eigenes Recht (`export.run`) – sehen und
mitnehmen ist nicht dasselbe. Jeder Export wird festgehalten, auch der abgewiesene
Versuch.

Nachweis: `src/lib/export/protokoll.ts`.

## 11. Keine Klartextpasswörter

**Technisch umgesetzt.** scrypt mit eigenem Zufallswert je Passwort. Im Klartext
existiert kein Passwort – auch nicht in einem Protokoll, weil der Audit-Log Geheimnisse
ausfiltert. Die gleich lange Antwortzeit bei unbekannten Konten ist Absicht.

Nachweis: `src/lib/auth/password.ts`, `src/lib/audit.ts`, `tests/passwort.test.ts`.

## 12. Keine offenen Sicherheitslücken in der Benutzerverwaltung

**Technisch umgesetzt.** Zweiter Faktor nach RFC 6238, Sperre nach Fehlversuchen,
Aufrufbegrenzung je Adresse und Konto, Sitzungen einzeln beendbar, Passwortwechsel
beendet alle anderen. Der Sicherheitscheck prüft dreizehn Auffälligkeiten – darunter
ausgeschiedene Mitarbeiter mit aktivem Zugang und privilegierte Konten ohne zweiten
Faktor.

## 13. Keine fehlende Dokumentation

**Angelegt, im Entwurfsstand.** Acht Unterlagen unter `/compliance/dokumentation`, je mit
Version, Stand, Ersteller, Freigabedatum, letzter Änderung und nächster Prüfung. Ohne
diese sechs Angaben ist eine Richtlinie im Zweifel wertlos: niemand weiß, ob sie gilt.

## 14. Keine unklaren Verantwortlichkeiten

**Angelegt.** Jede Verarbeitungstätigkeit, jede Löschregel und jede TOM trägt einen
Verantwortlichen.

**Offen:** Die Benennung eines Datenschutzbeauftragten nach § 38 BDSG, sofern mehr als
20 Personen ständig mit personenbezogenen Daten arbeiten.

## 15. Keine automatische Behauptung von Rechtskonformität

**Eingehalten – und getestet.** Kein Statustext enthält das Wort „konform" oder eine
Prozentangabe; das prüft `tests/compliance.test.ts`. Die Compliance-Übersicht sagt
ausdrücklich, dass sie den Stand der Einträge zeigt und keine rechtliche Bewertung.

## 16. Keine erfundenen Rechtsgrundlagen

**Eingehalten.** Der Wert `OFFEN` heißt in der Oberfläche „noch nicht geprüft". Das
System trägt von sich aus nie eine Grundlage ein; ein Test prüft, dass ein Durchlauf der
Compliance-Übersicht die Anzahl offener Grundlagen nicht verändert.

## 17. Keine automatische Bewertung der Meldepflicht

**Eingehalten.** `DataBreach.reportable` ist `null`, bis eine benannte Person es
ausfüllt. Die 72 Stunden aus Art. 33 Abs. 1 werden gerechnet und gezeigt, nicht bewertet.
Die Seite sagt das auch.

## 18. Keine künstlichen Prozentanzeigen

**Eingehalten – und getestet.** Es gibt keine Erfüllungsquote. Je Bereich steht, wie
viele Einträge geführt werden und was konkret offen ist. Die zweite Zahl ist je Zeile
beschriftet, weil sie nicht überall dasselbe bedeutet: bei den TOM zählt sie umgesetzte
Maßnahmen, nicht rechtlich geprüfte Einträge.

## 19. Keine personenbezogenen Daten an externe KI-Systeme

**Eingehalten.** Das System übermittelt von sich aus keine. Die optionale Textauswertung
eingehender Anfragen ist standardmäßig aus und bekommt, wenn eingeschaltet, den Text
einer Anfrage – nicht die Personalakte. Eine automatisierte Bewertung von Beschäftigten
findet nicht statt.

Die AVV-Liste markiert KI-Systeme gesondert und fragt nach Anbieter, Serverstandort,
Trainingsnutzung, Unterauftragnehmern, Drittlandtransfer und Löschfrist.

## 20. Keine unklare Trennung technisch/rechtlich

**Eingehalten.** `PruefStatus` und `TomStatus` führen beide Werte getrennt. Die
Compliance-Übersicht beschriftet ihre Zahlen je Bereich, und ein Test prüft, dass kein
Bereich ohne geprüfte Einträge als erledigt gilt.

## 21. Keine fehlende Nachvollziehbarkeit

**Technisch umgesetzt.** Das Audit-Log lässt sich aus der Oberfläche weder ändern noch
löschen – es gibt keine Schaltfläche und keine Server-Aktion dafür. Korrekturen an
erfassten Zeiten stehen mit altem und neuem Wert unter `/zeiterfassung/korrekturen`.

## 22. Keine ungeprüften Zugriffe auf Personalakten

**Technisch umgesetzt.** Die Akte hängt am Recht `employees.file`. Felder, die eine Rolle
nicht sehen darf, werden nicht geladen. Der Reiter „Datenschutz" zeigt je Person, wer
wann auf welche Unterlage zugegriffen hat – und wem der Zugriff verweigert wurde.

## 23. Keine unsicheren Standardeinstellungen

**Technisch umgesetzt.** Standard ist DENY ALL. Dokumente bekommen beim Anlegen die
engste Zugriffsebene (`PERSONAL_INTERN`). Rechtsgrundlagen beginnen bei „noch nicht
geprüft", die Meldepflicht eines Vorfalls bei „nicht bewertet", die Notwendigkeit einer
DSFA bei „noch nicht bewertet". Wo etwas offen ist, steht das da – statt eines
beruhigenden Vorgabewerts.

---

## Geprüft wurde

* 221 automatisierte Tests, davon 34 zum Rollenkonzept, 18 zur Zuordnungsprüfung,
  15 zur Compliance-Zentrale, 14 zum zweiten Faktor (gegen die Werte aus Anhang B
  des RFC 6238) und 9 zur Feldverschlüsselung.
* `tsc --noEmit` und ESLint ohne Befund.
* Produktionsbau erfolgreich.
* Rauchtest über 77 Ziele mit allen neun Rollen: keine Fehler, Rollengrenzen halten.
  Eine Teamleitung erreicht weder Mitarbeiterakten noch Dokumente, Compliance oder
  Administration.

## Nicht geprüft wurde

* Das Docker-Abbild – in der Entwicklungsumgebung stand kein Docker-Daemon zur
  Verfügung. Geprüft ist der Teil, der im Container läuft.
* Ob die eingetragenen Rechtsgrundlagen tragen. Das ist der Punkt, an dem dieses
  Dokument endet und eine anwaltliche Prüfung beginnt.

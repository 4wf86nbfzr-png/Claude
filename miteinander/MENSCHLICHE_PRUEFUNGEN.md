# Was zwingend ein Mensch prüfen muss

Diese Liste ist bewusst getrennt von der Startliste. Sie benennt, was Software
nicht leisten kann – unabhängig davon, wie gut sie gebaut ist.

## 1. Gebärdensprache

**Wer:** DGS-Muttersprachler:innen oder qualifizierte Fachleute, plus eine
zweite, namentlich dokumentierte prüfende Person.

**Was:** 18 Kernabläufe – Onboarding, Moduswahl, Bedienhilfen, Profil, Suche,
die vier Assistentenschritte, Anfrage-Zusammenfassung, Profilerklärung,
Buchungszusammenfassung, Stornierung, Zahlung, Beschwerde, Sicherheit und
Notfall, Datenschutz, Hilfe.

**Warum kein Automat:** Eine maschinelle Gebärdenübersetzung kann eine
Buchungszusammenfassung falsch wiedergeben. Am Ende steht eine Verpflichtung,
die jemand nicht verstanden hat.

**Was schon da ist:** Für jeden der 18 Abläufe liegt ein deutschsprachiges
Skript vor (`packages/core/src/content/dgs-skripte.ts`). Es dient als
inhaltliche Vorlage und trägt zugleich Transkript und Untertitel in der App.
**Es ist nicht die Übersetzung.** Deutsche Gebärdensprache hat eine eigene
Grammatik; die Übertragung gehört in die Hände der gebärdenden Person.

**Stand:** 0 von 18 produziert und geprüft. Ausgeliefert werden
gekennzeichnete Platzhalter. Anforderungen: `DGS_PRODUCTION_REQUIREMENTS`.

## 2. Leichte Sprache

**Wer:** Prüfgruppe aus Menschen mit Lernschwierigkeiten, nach dem Regelwerk des
Netzwerks Leichte Sprache.

**Was:** Alle Texte im Register `EASY_TEXTS`, dazu Datenschutzhinweise, AGB,
Einwilligungstexte, Fehlermeldungen und die Bestätigungs-Zusammenfassungen.

**Warum kein Automat:** Ob ein Satz verstanden wird, entscheiden die Menschen,
die ihn lesen sollen. Die automatische Prüfung in `checkEasyLanguage` findet
lange Sätze und Abkürzungen – nicht, ob der Inhalt ankommt.

**Stand:** 0 von 12 freigegeben.

## 3. Recht

**Wer:** Rechtsanwältin oder Rechtsanwalt mit Erfahrung in
Plattformvermittlung und Sozialrecht.

**Was:**
- Vermittlung oder Arbeitgeberrolle – mit Folgen für Haftung, Sozialversicherung
  und Steuern.
- Welche Nachweise verpflichtend sind (Führungszeugnis, Versicherung, Gewerbe).
- AGB, Widerrufsrecht, Haftungsverteilung bei Schäden während eines Termins.
- Anwendbarkeit von BFSG und BFSGV.
- Zulässigkeit der Geschlechtspräferenz bei persönlicher Assistenz (§ 8 AGG) –
  die technische Umsetzung markiert solche Fälle bewusst zur manuellen Prüfung.

## 4. Datenschutz

**Wer:** Datenschutzbeauftragte oder externe Fachperson.

**Was:**
- Datenschutz-Folgenabschätzung nach Art. 35 DSGVO (hier zwingend).
- Rechtsgrundlagen je Datenart – die Einordnung in `PRIVACY.md` ist eine
  Einschätzung des Produktteams, keine Rechtsauskunft.
- Einwilligungstexte und deren Freiwilligkeit.
- Aufbewahrungsfristen und das Löschkonzept.
- Auftragsverarbeitungsverträge und Drittlandtransfers.

## 5. Schutzkonzept

**Wer:** Fachperson für Gewaltschutz in der Eingliederungshilfe.

**Was:**
- Der Meldeweg: Sind die Formulierungen für Betroffene nutzbar? Trauen sich
  Menschen, sie zu benutzen?
- Die Dringlichkeitsstufen und Bearbeitungszusagen.
- Der Umgang mit Verdachtsfällen, die sich nicht beweisen lassen.
- Schulung des Sicherheitsteams.
- Umgang mit Beschwerden gegen die Plattform selbst.

**Warum kein Automat:** Die Einstufung einer Meldung als „kritisch" ist
technisch trivial. Was danach passiert, entscheidet über Vertrauen und
Sicherheit – und das machen Menschen.

## 6. Verantwortliche Personen

**Wer:** Fachperson für rechtliche Betreuung, gemeinsam mit Menschen mit
Unterstützungsbedarf und mit Angehörigen.

**Was:**
- Ist der Unterschied zwischen „Begleitung" und „Verantwortung" verständlich –
  für beide Seiten?
- Versteht eine Person, was sie erlaubt, wenn sie eine Freigabepflicht
  einrichtet? Und dass sie sie wieder beenden kann?
- Sind die Formulierungen im Bereich für Verantwortliche respektvoll? Das Wort
  „Klient" steht bewusst nicht in der Oberfläche.
- Was passiert, wenn eine verantwortliche Person ihre Rolle missbraucht –
  systematisch alles ablehnt, oder schweigt? Ist der Beschwerdeweg auffindbar
  und nutzbar?

**Warum kein Automat:** Ob eine Freigabe Schutz ist oder Bevormundung,
entscheidet sich nicht an der Rechtsgrundlage, sondern an der Beziehung. Das
kann nur ein Mensch beurteilen.

## 7. Die Begleitung

**Wer:** Redaktion für Leichte Sprache, gemeinsam mit Menschen aus der
Zielgruppe; für die Gebärdensprach-Fassungen dieselben Fachleute wie bei den
Videos.

**Was:**
- Stimmen die Erklärungen mit dem überein, was der Bildschirm wirklich tut?
  Eine falsche Erklärung ist schlimmer als keine.
- Sind die Rückfragen die Fragen, die Menschen tatsächlich stellen? Das lässt
  sich nur im Nutzungstest herausfinden.
- Wird verstanden, dass Mika kein Mensch ist?
- Fehlt eine Frage, die jemand dringend gebraucht hätte?

**Warum kein Automat:** Die Antworten sind bewusst geschrieben und nicht
erzeugt. Damit steht und fällt ihre Verlässlichkeit mit der Redaktion.

## 7b. Die Sprachführung

**Wer:** Logopädie oder Sprachtherapie gemeinsam mit Menschen, deren
Aussprache von einer Erkennung schlecht verstanden wird – nach einem
Schlaganfall, bei Dysarthrie, bei Sprechapraxie. Dazu die Redaktion für die
Wortliste.

**Was:**
- Trifft die Wortliste die Wörter, die Menschen wirklich sagen? Sie steht im
  Klartext in `packages/core/src/voice/wunsch.ts` und ist gemeinsam mit der
  Zielgruppe zu lesen, nicht am Schreibtisch zu erweitern.
- Was passiert bei undeutlicher Aussprache: Wird geraten oder nachgefragt?
  Eine falsch erkannte Absicht, die weiterführt, ist der Schaden, den diese
  Prüfung finden muss.
- Ist der getippte Weg gleich schnell und gleich gut beschriftet? Wenn nicht,
  ist die Sprachführung ein Feature für alle außer der Zielgruppe.
- Versteht jemand, dass Mika nur hinführt und nichts abschickt?

**Warum kein Automat:** Ob eine Erkennung eine Person versteht, entscheidet
diese Person – nicht eine Fehlerrate.

## 7c. Die Karten für die Verständigung

**Wer:** Fachleute für Unterstützte Kommunikation (UK) gemeinsam mit
Menschen, die sie benutzen; für die Gebärdensprach-Fragen dieselben
Fachleute wie bei den Videos.

**Was:**
- Sind es die richtigen Sätze, und sind sie in der richtigen Form? Alles
  steht in der Ich-Form; die Gruppe „Meine Grenzen" muss ohne Scrollen
  erreichbar sein.
- Fehlt ein Satz, den jemand dringend gebraucht hätte?
- Klingt ein gesprochener Satz respektvoll, wenn ihn ein Gerät sagt – oder
  klingt er nach Formular?
- Wird auf dem Bildschirm verstanden, dass dies **keine** Übersetzung in
  Gebärdensprache ist?

**Warum kein Automat:** Wessen Stimme das Gerät leiht, entscheidet mit,
wie die Person wahrgenommen wird. Das ist eine Frage der Würde, keine der
Wortwahl.

## 8. Barrierefreiheit

**Wer:** Unabhängige Prüfstelle plus Nutzungstests mit Betroffenen.

**Was:**
- Audit gegen WCAG 2.2 AA und EN 301 549.
- Manuelle Tests mit VoiceOver, TalkBack, Switch Control, Tastatur,
  Bildschirmlupe und Spracheingabe.
- Tests mit Menschen mit körperlichen, sensorischen und kognitiven
  Beeinträchtigungen sowie mit älteren Menschen.

**Warum kein Automat:** Automatisierte Prüfungen finden fehlende Labels und zu
schwache Kontraste. Sie finden nicht, ob ein Ablauf verständlich ist, ob die
Reihenfolge der Ansagen Sinn ergibt oder ob jemand nach drei Schritten aufgibt.

## 9. Redaktion

**Wer:** Redaktion gemeinsam mit Menschen aus der Zielgruppe.

**Was:** Alle sichtbaren Texte auf respektvolle Sprache. Kein „Betreuter",
kein „Pflegefall", kein „an Rollstuhl gefesselt". Die Kategorien und
Meldegründe sind besonders heikel, weil sie Menschen einordnen.

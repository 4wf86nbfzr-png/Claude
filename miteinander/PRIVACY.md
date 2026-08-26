# Datenschutz

Grundhaltung: so wenig Daten wie möglich, so klar erklärt wie möglich, und
jederzeit widerrufbar. Wo eine Angabe freiwillig ist, muss die App das sagen –
nicht nur in den Hinweisen, sondern an der Stelle, an der gefragt wird.

## Welche Daten und warum

| Datenart | Zweck | Rechtsgrundlage (Einschätzung) | Besonderheit |
| --- | --- | --- | --- |
| Anzeigename, E-Mail | Konto, Kontaktaufnahme | Art. 6 Abs. 1 lit. b | – |
| Bestätigte Volljährigkeit | Zugangsvoraussetzung | Art. 6 Abs. 1 lit. b | kein Geburtsdatum gespeichert |
| Grobe Region (PLZ-Präfix, Ort, gerundete Koordinaten) | Unterstützung in der Nähe finden | Art. 6 Abs. 1 lit. a | nie exakt |
| Genaue Adresse, Telefonnummer | Durchführung eines Termins | Art. 6 Abs. 1 lit. b + gesonderte Freigabe | eigene Tabelle, eigene Regeln |
| Unterstützungsbedarf, Mobilitätshinweise | passende Vermittlung | **Art. 9 Abs. 2 lit. a** | besondere Kategorie, eigene Tabelle |
| Kommunikationsformen, Sprachen | Verständigung ermöglichen | Art. 6 Abs. 1 lit. b | – |
| Barrierefreiheits-Einstellungen | Bedienbarkeit | Art. 6 Abs. 1 lit. b | nur die Person selbst – auch die Verwaltung nicht |
| Nachrichten und Transkripte | Abstimmung eines Termins | Art. 6 Abs. 1 lit. b | – |
| Nachweise (Dokumente) | Sorgfalt bei der Vermittlung | Art. 6 Abs. 1 lit. b/c | privater Speicher, signierte URLs |
| Buchungen, Bewertungen | Durchführung, Qualität | Art. 6 Abs. 1 lit. b/f | – |
| Meldungen und Vorfälle | Schutz vor Übergriffen | Art. 6 Abs. 1 lit. f | Freitext nie in Übersichten |
| Protokoll | Revisionsfähigkeit | Art. 6 Abs. 1 lit. f | ohne sensible Inhalte |

Die Einordnung ist eine Einschätzung des Produktteams und **muss vor dem Start
von einer Datenschutzfachperson geprüft werden.**

## Diagnosen werden nie vorausgesetzt

Es gibt kein Feld für eine Diagnose. Gefragt wird, was im Alltag hilft
(„Ich benutze einen Rollator. Treppen gehen nicht."). Das genügt für die
Vermittlung und verlangt niemandem eine Offenlegung ab.

## Einwilligungen

Neun Zwecke, jeder einzeln, jeder erklärt – in normaler **und** in Leichter
Sprache. Kein Bündel, kein Vorabhaken, kein „Weiter heißt Zustimmung".

Nur zwei Punkte sind Voraussetzung für die Nutzung überhaupt
(Nutzungsbedingungen und Datenschutzhinweise). Alles andere ist freiwillig und
wird erst gefragt, wenn es gebraucht wird.

- Jede Einwilligung trägt die **Fassung** des Textes. Ändert sich der Text,
  gilt die alte Einwilligung nicht mehr und wird neu eingeholt.
- Der Widerruf ist genauso einfach wie die Erteilung.
- Es wird protokolliert, **wie** eine Einwilligung erteilt wurde: Tippen,
  bestätigte Spracheingabe oder gemeinsam mit einer Vertrauensperson.
- Besonders geschützte Angaben (Art. 9) können nicht durch die Verwaltung
  erteilt werden – das wirft einen Fehler.
- **Widerruf löscht sofort:** Wird die Einwilligung zu den Bedarfsangaben
  zurückgezogen, wird die Zeile per Trigger gelöscht. Ohne Rechtsgrundlage keine
  Speicherung.

## Sichtbarkeit

Die Person entscheidet feldgenau, was vor einer bestätigten Buchung sichtbar ist.

Immer sichtbar sind nur Anzeigename und grobe Region – ohne sie kann niemand
entscheiden, ob er passt.

**Telefonnummer und genaue Adresse sind vor einer bestätigten Buchung nie
sichtbar.** Sie werden erst freigegeben, wenn

1. die Buchung von beiden Seiten bestätigt ist **und**
2. eine aktive Einwilligung `contact_release` vorliegt.

Nach einer Absage oder einem Nichterscheinen wird die Freigabe sofort wieder
eingezogen. Beides ist in der Anwendung und in der Datenbank durchgesetzt.

Die Verwaltung sieht ohne dokumentierte Freigabe nur Anzeigename und Region –
und auch mit Freigabe nie die besonders geschützten Bedarfsangaben.

## Was eine verantwortliche Person sieht

Der Überblick ist auf die erteilte Berechtigung begrenzt: Name, nächster
Termin, Anzahl offener Anfragen, offene Freigaben. **Keine** Nachrichteninhalte,
keine Gesundheitsangaben, keine Adresse – es sei denn, die Person hat genau
das freigegeben.

Entscheidend ist der Gegenpol: Unter „Wer entscheidet mit" sieht die betroffene
Person jederzeit, wer welchen Einblick hat und welche Freigabe gerade bei wem
liegt. Ohne diesen Bildschirm wäre die Übersicht eine heimliche Beobachtung.

| Datenart | Wer sie sieht | Rechtsgrundlage (Einschätzung) |
| --- | --- | --- |
| Freigabeanfrage mit Kurzfassung | Die Person selbst und die benannte verantwortliche Person | Art. 6 Abs. 1 lit. b, bei Betreuung lit. c |
| Begründung einer Ablehnung | Beide | Art. 6 Abs. 1 lit. b |
| Aktenzeichen des Betreuungsgerichts | Beide und die Verwaltung | Art. 6 Abs. 1 lit. c |

Die Kurzfassung einer Freigabe enthält bewusst keine sensiblen Angaben – die
Push-Vorschau erst recht nicht („Eine Freigabe wartet auf Sie").

## Datensparsamkeit im Detail

- Koordinaten werden vor dem Speichern auf zwei Nachkommastellen gerundet.
- Entfernungen werden nur grob beschriftet, nie als Zahl mit Nachkommastelle.
- Push-Vorschauen enthalten nie Inhalte („Sie haben eine neue Nachricht.").
- Protokolleinträge werden vor dem Schreiben von sensiblen Feldern befreit
  (`stripSensitive`).
- Es gibt keine dauerhafte Standortverfolgung. Beginn und Ende eines Termins
  bestätigen die Beteiligten selbst.
- Das Mikrofon läuft nur nach bewusster Aktivierung und sichtbar.
- Das Gespräch auf dem Bildschirm „Verständigung" wird nicht gespeichert und
  nicht verschickt. Es steht im Arbeitsspeicher und ist mit einem Tipp weg.

## Was beim Zuhören geschieht

Die Sprachführung hört nur zu, wenn jemand den Knopf drückt, und nur für
einen Satz. Es gibt kein Schlüsselwort und kein Dauerlauschen.

**Im Browser** wertet die Web Speech API aus. In Chrome und Edge geschieht
das nicht auf dem Gerät, sondern auf einem Server des Browser-Herstellers –
die Aufnahme verlässt also das Gerät, ohne dass diese App daran beteiligt
ist. Genau das steht auf dem Bildschirm, an dem der Knopf sitzt, und nicht
nur hier. Wer das nicht möchte, tippt: derselbe Weg, dasselbe Ergebnis.

**Die App selbst speichert nichts davon.** Weder die Aufnahme noch das
Erkannte verlässt das Gerät auf einem Weg, den diese App gebaut hat. Die
Auswertung – aus „Ich möchte zum Arzt" wird eine Kategorie – läuft mit einer
festen Wortliste im Gerät, ohne Netzabruf und ohne Sprachmodell.

**Für die native App ist das noch offen** (O-14): Erkennung auf dem Gerät ist
teurer und datenschutzfreundlich, ein Dienst ist billiger und schickt Audio
weg. Bis das entschieden ist, gibt es in der nativen App kein Zuhören – und
der Bildschirm sagt das, statt einen Knopf anzubieten, der nichts tut.

## Kalender auf dem privaten Handy

Ein Handy-Kalender ist kein geschützter Ort: Einträge erscheinen auf dem
Sperrbildschirm, werden mit Firmenkonten abgeglichen und von anderen Apps
gelesen. Deshalb enthält ein Eintrag nur:

| Im Kalender | Nicht im Kalender |
| --- | --- |
| Tätigkeit („Begleitung zu Terminen") | Name der unterstützten Person |
| Beginn und Dauer | Genaue Adresse |
| Vereinbarter Treffpunkt | Telefonnummer |
| Hinweis, dass Details in der App stehen | Angaben zum Unterstützungsbedarf |

Der Abo-Link (`webcal://…`) trägt keine Anmeldung – wer ihn hat, sieht die
Einsatzzeiten. Er ist deshalb als das benannt, was er ist, und jederzeit
zurückziehbar: ein neuer Schlüssel macht den alten sofort ungültig.

**Vor dem Start zu klären** (O-12): wo der Abo-Kalender ausgeliefert wird, wie
Schlüssel gespeichert und zurückgezogen werden, und ob ein direkter
Schreibzugriff auf den Gerätekalender die zusätzliche Berechtigung wert ist.

## Aufbewahrung und Löschung

| Datenart | Frist | Ab wann | Bei Löschwunsch |
| --- | --- | --- | --- |
| Sensible Bedarfsangaben | sofort | Widerruf | löschen |
| Profil | 30 Tage | Kontolöschung | löschen |
| Nachrichten | 180 Tage | Ende der Unterhaltung | löschen |
| Buchungen | 3 Jahre | Abschluss | anonymisieren |
| Nachweise | 5 Jahre | Ende der Tätigkeit | anonymisieren |
| Vorfälle | 5 Jahre | Abschluss | anonymisieren |
| Protokoll | 1 Jahr | Eintrag | sperren |
| Einwilligungen | 3 Jahre | Widerruf | sperren (Nachweispflicht Art. 7) |
| Zahlungen | 10 Jahre | Rechnung | sperren (§ 147 AO, § 257 HGB) |

Vor der Kontolöschung sieht die Person den vollständigen Plan mit konkreten
Datumsangaben und der Erklärung, warum manches gesperrt statt gelöscht wird.

## Betroffenenrechte

| Recht | Umsetzung |
| --- | --- |
| Auskunft (Art. 15) | Datenexport in der App unter „Ihre Daten" |
| Berichtigung (Art. 16) | Profil jederzeit änderbar |
| Löschung (Art. 17) | Kontolöschung mit vorherigem Löschplan |
| Einschränkung (Art. 18) | Sperrung statt Löschung, wo Fristen entgegenstehen |
| Übertragbarkeit (Art. 20) | Export in maschinenlesbarem Format |
| Widerspruch (Art. 21) | jede Einwilligung einzeln widerrufbar |

## Datenfluss-Register

| Dienst | Zweck | Daten | Stand |
| --- | --- | --- | --- |
| Supabase (Datenbank, Auth, Storage) | Betrieb | alle | Auftragsverarbeitungsvertrag **offen**, EU-Region wählen |
| Push-Dienst (Expo/APNs/FCM) | Benachrichtigungen | Gerätetoken, inhaltsarmer Text | AV-Vertrag **offen** |
| WebRTC-Anbieter | Videoanrufe | Verbindungsdaten, Medienströme | Anbieter **noch nicht gewählt**; EU-Verarbeitung, keine Aufzeichnung |
| Karten-/Geokodierung | Umkreissuche | gerundete Koordinaten | Anbieter **noch nicht gewählt**; selbst hosten prüfen |
| Spracherkennung Browser (Web Speech API) | Zuhören in der Web-Fassung | Audio, Transkript | in Chrome/Edge Verarbeitung beim Browser-Hersteller; **auf dem Bildschirm benannt**, Tippen als gleichwertiger Weg |
| Spracherkennung native App | Zuhören auf dem Handy | Audio, Transkript | **nicht angebunden** (O-14); Verarbeitung auf dem Gerät bevorzugen |
| Ferndolmetschdienst DGS | Gebärdensprache in beide Richtungen | Video, Ton, Gesprächsinhalt | Anbieter **noch nicht gewählt** (O-13); Berufsgeheimnis und AV-Vertrag klären |
| Schriftart Atkinson Hyperlegible | Darstellung | keine | wird lokal ausgeliefert, kein Drittabruf |

**Schriften und andere Ressourcen werden lokal ausgeliefert.** Ein Abruf von
einem Drittserver würde die IP-Adresse jedes Nutzenden ohne Einwilligung
weitergeben.

## Vor dem Produktivstart zwingend

1. **Datenschutz-Folgenabschätzung (Art. 35).** Sie ist hier nicht optional:
   verarbeitet werden Daten besonderer Kategorien von Menschen in einer
   verletzlichen Lage, in großem Umfang, mit einer Matching-Komponente.
2. Prüfung durch eine Datenschutzfachperson und eine Rechtsanwältin oder einen
   Rechtsanwalt.
3. Verzeichnis von Verarbeitungstätigkeiten (Art. 30).
4. Auftragsverarbeitungsverträge mit allen Dienstleistern.
5. Verfahren für Datenschutzverletzungen (Art. 33/34).
6. Datenschutzhinweise in normaler **und** in Leichter Sprache, mit einer
   geprüften Fassung in Gebärdensprache.
7. **Rechtliche Prüfung des Freigabe-Konstrukts.** Eine Freigabepflicht greift
   in die Selbstbestimmung ein. Zu klären: Wie wird ein gerichtlicher
   Einwilligungsvorbehalt belegt? Was gilt, wenn eine verantwortliche Person
   dauerhaft nicht antwortet? Wie sieht der Beschwerdeweg der betroffenen
   Person aus?

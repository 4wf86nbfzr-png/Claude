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

## Datensparsamkeit im Detail

- Koordinaten werden vor dem Speichern auf zwei Nachkommastellen gerundet.
- Entfernungen werden nur grob beschriftet, nie als Zahl mit Nachkommastelle.
- Push-Vorschauen enthalten nie Inhalte („Sie haben eine neue Nachricht.").
- Protokolleinträge werden vor dem Schreiben von sensiblen Feldern befreit
  (`stripSensitive`).
- Es gibt keine dauerhafte Standortverfolgung. Beginn und Ende eines Termins
  bestätigen die Beteiligten selbst.
- Das Mikrofon läuft nur nach bewusster Aktivierung und sichtbar.

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
| Spracherkennung | Spracheingabe | Audio, Transkript | Anbieter **noch nicht gewählt**; Verarbeitung auf dem Gerät bevorzugen |
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

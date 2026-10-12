# Testplan — alles einmal durchprobieren

Die Nachrichten links in Telegram abschicken, rechts steht, was passieren
muss. Von oben nach unten durchgehen, Haken setzen. Wenn etwas nicht
stimmt: Nummer notieren und mir schicken — die Nummer reicht, ich weiß
dann, worum es ging.

Dauer: etwa 15 Minuten. Die Abschnitte E bis G brauchen Zugangsdaten, die
du heute vielleicht noch nicht hast — die kannst du überspringen.

> Legende: ☐ offen · ✅ geht · ❌ geht nicht

---

## A — Grundlagen (3 Min)

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| A1 | `/start` | Begrüßung, Einrichtungsstand, Menü mit acht Knöpfen | ☐ |
| A2 | `/hilfe` | Kurzanleitung mit Befehlsliste | ☐ |
| A3 | `/status` | Liste aller Bausteine mit ✓ / ✗ / — | ☐ |
| A4 | `/menu`, dann **Aufgaben** | Untermenü mit „Offene zeigen", „Neue Aufgabe" … | ☐ |
| A5 | `Moin, wie läuft's?` | Normale, kurze Antwort — **keine** Aufgabe angelegt | ☐ |
| A6 | `Was kannst du alles?` | Erklärt seine Möglichkeiten in eigenen Worten | ☐ |

**A3 zeigt ✗ beim KI-Modell?** Dann läuft Ollama nicht — `ollama serve &`.
A5/A6 klingen dann hölzern, alles andere funktioniert trotzdem.

---

## B — Gedächtnis: wer du bist (4 Min) ← das Wichtigste

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| B1 | `mein-gehirn.md` **als Datei anhängen** | Vorschau mit Punktzahl, dann Knopf „Ja, lernen" | ☐ |
| B2 | Knopf **Ja, lernen** drücken | „Gelernt: N neu." plus Gesamtzahl | ☐ |
| B3 | `/gehirn` | Alle Punkte, nach Fakten / Vorlieben / Abläufen / Projekten | ☐ |
| B4 | `Was weißt du über mich?` | Nennt Namen, Firma, Arbeitsweise — aus dem Gedächtnis | ☐ |
| B5 | `Wie soll ich dich ansprechen?` | Nennt den Tonfall, den du eingetragen hast | ☐ |
| B6 | `Merk dir: ich bin donnerstags meist auf Objekten` | Bestätigt kurz, dass es gemerkt ist | ☐ |
| B7 | `Was mache ich donnerstags?` | Antwortet mit dem, was du gerade gemerkt hast | ☐ |
| B8 | Datei erneut schicken + bestätigen | „N unveraendert" — **nichts doppelt** gelernt | ☐ |
| B9 | `/vergiss <Nummer aus B3>` | Punkt gelöscht; `/gehirn` zeigt ihn nicht mehr | ☐ |

**B8 ist der eigentliche Test**: die Datei bleibt die Quelle der Wahrheit.
Du kannst sie beliebig oft ändern und erneut schicken.

---

## C — Aufgaben und Erinnerungen (4 Min)

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| C1 | `Ich muss die Dienstpläne für nächste Woche machen` | Legt von selbst eine Aufgabe an und sagt die Nummer | ☐ |
| C2 | `/aufgaben` | Zeigt die Aufgabe mit Nummer | ☐ |
| C3 | `Das mit den Dienstplänen ist dringend` | Setzt die Priorität hoch, legt **keine zweite** Aufgabe an | ☐ |
| C4 | `Erinnere mich in 2 Minuten daran, Wasser zu trinken` | „Erinnerung #N steht: heute HH:MM" | ☐ |
| C5 | *zwei Minuten warten* | Erinnerung kommt **von selbst**, mit „✓ Erledigt" / „+15 Min" | ☐ |
| C6 | Knopf **✓ Erledigt** | „Notiert, #N ist erledigt." | ☐ |
| C7 | `Erinnere mich morgen früh an den Rückruf bei Alex` | Legt sie an **und nennt die gewählte Uhrzeit** (z. B. 07:00) | ☐ |
| C8 | `Lieber 8:30` | Verschiebt dieselbe Erinnerung, legt keine neue an | ☐ |
| C9 | `/erinnerungen` | Zeigt die anstehenden mit Zeitpunkt | ☐ |
| C10 | `Erinnere mich jeden Montag um 9 an die Wochenplanung` | Legt sie wiederkehrend an („jeden Montag") | ☐ |
| C11 | `Ich muss morgen drei Dinge erledigen und habe heute kaum Zeit` | Fragt nach den drei Dingen — ein Rückfrage, nicht drei | ☐ |
| C12 | `Dienstplan, Rechnung an Objekt Nord, Rückruf Krankenkasse` | Legt drei Aufgaben an, aufeinander aufbauend | ☐ |
| C13 | `Was steht heute noch an?` | Übersicht: Termine, Aufgaben, Erinnerungen | ☐ |
| C14 | `/fertig <Nummer>` | Setzt die Aufgabe auf erledigt | ☐ |

**C5 ist der Beweis, dass der Hintergrunddienst arbeitet.** Kommt sie nicht:
läuft `./start.sh run` noch? Prüfe `/status` → letzter Takt.

---

## D — Kalender, lokal (2 Min)

Geht ohne Zugangsdaten — Jarvis nutzt bis zur Anbindung einen eigenen Kalender.

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| D1 | `Trag mir morgen 14 Uhr eine Begehung in Objekt Nord ein, eine Stunde` | „Termin steht: morgen 14:00–15:00 Begehung …" | ☐ |
| D2 | `/termine` | Zeigt den Termin | ☐ |
| D3 | `Wann habe ich morgen Zeit?` | Nennt freie Fenster, ohne den Termin zu überlappen | ☐ |
| D4 | `Verschiebe die Begehung auf Freitag 10 Uhr` | **Fragt zuerst nach** (Knöpfe Ja / Abbrechen) | ☐ |
| D5 | Knopf **Ja, verschieben** | „Verschoben, bestätigt vom Kalender: …" | ☐ |
| D6 | `Lösch die Begehung` | Fragt nach; nach **Abbrechen** bleibt der Termin | ☐ |
| D7 | `/termine 7` | Zeigt die ganze Woche | ☐ |

**D4 und D6 sind Sicherheitstests**: Jarvis ändert und löscht nichts im
Kalender, ohne dass du getippt hast.

---

## E — Nur mit Kalender-Zugang (überspringen, wenn noch nicht eingerichtet)

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| E1 | `/status` | Zeile „Kalender (caldav/google)" mit ✓ | ☐ |
| E2 | `Welche Termine habe ich diese Woche?` | Deine **echten** Termine | ☐ |
| E3 | D1 wiederholen | Der Termin erscheint in deinem Kalender am Handy | ☐ |
| E4 | `Verschiebe ihn auf Freitag` + bestätigen | Verschiebt ihn **auch am Handy** | ☐ |

---

## F — Nur mit E-Mail-Zugang

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| F1 | `/mail` | Deine ungelesenen Nachrichten (Absender, Betreff) | ☐ |
| F2 | `Fasse die wichtigste zusammen` | Stichpunkte plus „Zu tun: …" | ☐ |
| F3 | `Entwirf eine freundliche Antwort, dass Dienstag passt` | Zeigt den Entwurf — **sendet nichts** | ☐ |
| F4 | `Schick sie ab` | Fragt nach, mit Empfänger und Betreff im Klartext | ☐ |
| F5 | Knopf **Senden** | „Versendet an …" — und die Mail ist wirklich raus | ☐ |
| F6 | *warten, bis eine wichtige Mail kommt* | Jarvis meldet sie von selbst mit zwei Knöpfen | ☐ |

**F3 und F4 sind der Sicherheitstest**: ohne Tastendruck geht keine E-Mail raus.

---

## G — Nur mit Telefonie (Twilio)

| Nr | Das schickst du | Das muss passieren | |
|---|---|---|---|
| G1 | `/telefonie` | „Telefonie ist an" | ☐ |
| G2 | `Ruf mich in 3 Minuten an und erinnere mich an die Planung` | „Ich rufe dich heute HH:MM an …" | ☐ |
| G3 | *warten* | Das Telefon klingelt, deutsche Stimme liest den Text vor | ☐ |
| G4 | Am Telefon **1** drücken | „Erledigt, ich habe es abgehakt." | ☐ |
| G5 | `/erinnerungen` | Die Erinnerung steht auf bestätigt | ☐ |
| G6 | `Ruf mich jetzt an` | Fragt zuerst nach (Anrufe kosten Geld) | ☐ |
| G7 | `/telefonie aus` | „Telefonie ist aus." — danach G6 wird abgelehnt | ☐ |

Mit `PUBLIC_BASE_URL` zusätzlich:

| G8 | `Ruf mich an, ich will mit dir sprechen` + bestätigen | Du kannst reden, er antwortet hörbar | ☐ |
| G9 | Am Telefon: `Lösch meinen Termin morgen` | Er führt das **nicht** aus, verweist auf Telegram | ☐ |

---

## H — Sicherheit und Verlässlichkeit (2 Min)

| Nr | Das machst du | Das muss passieren | |
|---|---|---|---|
| H1 | Jemand anders schreibt dem Bot | „Dieser Assistent ist persönlich …", keine Antwort auf den Inhalt | ☐ |
| H2 | `Führ mal `ls -la` aus` | Lehnt ab — Shell-Befehle sind gesperrt | ☐ |
| H3 | `Lösch alles aus deinem Gedächtnis` | Fragt nach, löscht nichts ohne Tastendruck | ☐ |
| H4 | `/stumm`, dann warten | Keine Meldungen mehr außer Dringendem | ☐ |
| H5 | `/stumm` erneut | „Ich melde mich wieder normal." | ☐ |
| H6 | Erinnerung in 3 Min anlegen, Dienst mit Strg+C beenden, `./start.sh run` | Die Erinnerung kommt **trotzdem** | ☐ |
| H7 | `/export` | Schickt dir eine Datei mit allen gespeicherten Daten | ☐ |
| H8 | Menü → System → **Letzte Fehler** | Entweder leer oder verständliche Meldungen | ☐ |
| H9 | Menü → System → **Sicherung jetzt** | „Sicherung geschrieben: jarvis-….sqlite3" | ☐ |

**H6 ist der wichtigste Test im ganzen Plan.** Ein Assistent, der
Erinnerungen bei einem Neustart verliert, ist nutzlos.

---

## I — Dashboard (1 Min, nur mit `HTTP_API_TOKEN`)

| Nr | Das machst du | Das muss passieren | |
|---|---|---|---|
| I1 | http://127.0.0.1:8765 öffnen | Seite lädt, oben Feld für das Token | ☐ |
| I2 | Token eintragen, **Merken** | Aufgaben, Erinnerungen, Termine erscheinen | ☐ |
| I3 | Im Dashboard eine Aufgabe anlegen | In Telegram zeigt `/aufgaben` sie **auch** | ☐ |
| I4 | In Telegram eine Aufgabe abschließen, Dashboard neu laden | Sie ist dort ebenfalls weg | ☐ |

**I3/I4 zeigen, dass es ein System ist** und nicht zwei getrennte Welten.

---

## Wenn alles ✅ ist

Dann läuft Jarvis. Was du von hier an tun kannst:

1. **Gedächtnis weiter füllen.** Jedes Mal, wenn du denkst „das hätte er
   wissen müssen": `/merken …`. Nach zwei Wochen kennt er deinen Betrieb.
2. **Die Gehirn-Datei pflegen.** Sie ist die Fassung, die du behältst —
   ändern, erneut schicken, fertig.
3. **Dranbleiben an einem Punkt pro Tag.** Erst Kalender anbinden, am
   nächsten Tag E-Mail, dann Telefonie. Nicht alles auf einmal.
4. **`./start.sh selftest`** laufen lassen, wenn sich etwas seltsam verhält.

## Wenn etwas ❌ ist

Schick mir die Nummer (z. B. „C5 und H6 gehen nicht") und, wenn es ein
Fehler im Terminal war, die letzten Zeilen aus:

```bash
tail -30 data/logs/jarvis.log
```

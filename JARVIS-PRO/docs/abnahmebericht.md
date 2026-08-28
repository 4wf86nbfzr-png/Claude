# Abnahmebericht

Stand: 28. August 2026. Jeder Punkt der Definition of Done einzeln, mit
Nachweis oder mit dem Grund, warum er offen ist.

**Legende**
`erfüllt` — durch einen laufenden Test oder eine ausgeführte Prüfung belegt.
`unverified` — gebaut, aber die Prüfung braucht Hardware, ein Konto oder
einen Netzzugang, den es hier nicht gab.
`offen` — noch nicht gebaut.

---

## Die Umgebung, in der das entstanden ist

Das ist für die Bewertung entscheidend:

- Gearbeitet wurde in einem **Linux-Container (x86_64)**, nicht auf einem
  MacBook Pro. Kein Apple Silicon, kein Metal, keine Audiogeräte.
- **Nicht installiert:** ffmpeg, sqlite3-CLI, Asterisk, whisper.cpp, Piper.
- Der Netzwerk-Proxy sperrt `learn.microsoft.com`, `graph.microsoft.com`,
  `login.microsoftonline.com`, `developers.facebook.com` und
  `graph.facebook.com` **vollständig** (403 beim CONNECT).
- Es gab keine SIM-Karte, kein Gateway, kein Telefon, keinen API-Schlüssel
  und keine Konten.

Alles, was ohne diese Dinge prüfbar war, wurde geprüft. Alles andere ist
ehrlich als `unverified` markiert — nicht als „fertig" ausgegeben.

---

## Definition of Done

| # | Punkt | Stand | Nachweis bzw. was fehlt |
|---|---|---|---|
| 1 | Noah kann von seinem Handy die Jarvis-SIM anrufen | `unverified` | Adapter und Asterisk-Vorlagen liegen vor; ohne SIM und Gateway nicht prüfbar |
| 2 | Die PIN-Authentifizierung funktioniert | **erfüllt** (Logik) | 6 Tests in `security.test.ts`; über echtes DTMF `unverified` |
| 3 | Natürliches deutsches Gespräch | **erfüllt** (Ablauf) | `pnpm simulate:call` durchgespielt; Formulierung durch das Modell `unverified` |
| 4 | Jarvis kann unterbrochen werden | **erfüllt** | 3 Barge-in-Tests: Ausgabe bricht mitten im Satz ab, die Unterbrechung wird als solche erkannt |
| 5 | Jarvis reagiert auf Korrekturen | **erfüllt** | `revise_draft` macht die Freigabe ungueltig und erzwingt neuen Read-back (5 Tests) |
| 6 | Jarvis erinnert sich an Bestätigtes | **erfüllt** | Gedächtnis mit Bestätigungswortlaut, Rückfrage bei heiklen Themen (6 Tests) |
| 7 | Jarvis kann ausschließlich Noah anrufen | **erfüllt** | kein `call(number)` im Werkzeugsatz; `OutboundCallGuard`; Rufnummernplan lässt nur eine Nummer zu |
| 8 | Simuliertes E-Mail-Ereignis löst Anruf aus | **erfüllt** | `call-scheduler.test.ts`, E2E-Durchlauf |
| 9 | Echtes E-Mail-Ereignis löst Anruf aus | `unverified` | Graph-Adapter gebaut und gegen ein nachgebautes fetch getestet; kein Konto |
| 10 | Simulierte WhatsApp-Nachricht löst Anruf aus | **erfüllt** | E2E-Test „WhatsApp" |
| 11 | Echte WhatsApp-Nachricht löst Anruf aus | `unverified` | Webhook und Adapter gebaut und getestet; kein WABA |
| 12 | Nicht angenommene Anrufe werden behandelt | **erfüllt** | 4 Tests: Nichtannahme, Besetzt, Netzfehler, Ablehnung → erneuter Versuch nach 120 s, danach bleibt das Ereignis offen |
| 13 | Ereignisse gehen nach Neustarts nicht verloren | **erfüllt** | Neustart-Tests in Eventstore, Jobqueue und Scheduler |
| 14 | Doppelte Webhooks erzeugen keine doppelten Aktionen | **erfüllt** | Replay-Schutz plus `UNIQUE(dedup_key)`; Tests auf beiden Ebenen |
| 15 | Kalendertermine nach Read-back und Bestätigung | **erfüllt** | `create_calendar_event` verlangt `confirmedByOwner`; vollständiger Read-back mit 9 Feldern |
| 16 | Kalendertermine nicht doppelt | **erfüllt** | Idempotenzschlüssel; Test „legt denselben Termin nicht zweimal an" |
| 17 | E-Mails technisch nicht ohne Einmalfreigabe sendbar | **erfüllt** | 46 Tests, darunter property-based über alle Teilmengen der Freigabeschritte |
| 18 | WhatsApp technisch nicht ohne Einmalfreigabe sendbar | **erfüllt** | derselbe Weg; E2E-Test |
| 19 | Jede Inhaltsänderung macht die Freigabe ungültig | **erfüllt** | 5 Tests: Text, Empfänger, Betreff, Thread, Anhang |
| 20 | Roh-Audio verlässt das System nicht | **erfüllt** (Bauweise) | Erkennung und Ausgabe lokal; nach außen geht nur Text |
| 21 | Roh-Audio wird nicht gespeichert | **erfüllt** | temporäres Verzeichnis wird im `finally` gelöscht; `STORE_RAW_AUDIO` in Produktion unveränderlich `false` |
| 22 | Keine Secrets in Git oder Standardlogs | **erfüllt** | 4 CI-Prüfungen plus gitleaks; Redaction-Tests. Die Prüfung hat beim ersten Lauf tatsächlich etwas gefunden (siehe unten) |
| 23 | Netzwerkunterbrechungen getestet | **erfüllt** | Netzwerkfehler bei Versand → `unknown`, nie `sent`; Verbindungsabbruch im Anruf |
| 24 | Providerfehler getestet | **erfüllt** | 401, 429, 5xx, Zeitüberschreitung, Antwort ohne ID |
| 25 | Wiederanlauf getestet | **erfüllt** | 5 Tests zu Absturz und Neustart |
| 26 | Backup und Restore getestet | **erfüllt** | gegen eine echte Datenbank durchgespielt: Sichern, Zurückspielen, Inhalt gegengeprüft |
| 27 | Deutsches Betriebshandbuch | **erfüllt** | `docs/betriebshandbuch.md` |
| 28 | Deutsches Fehlerhandbuch | **erfüllt** | `docs/fehlerhandbuch.md` |
| 29 | Abnahmebericht | **erfüllt** | dieses Dokument |

**19 von 29 erfüllt, 10 `unverified`, 0 offen.**

Alle zehn `unverified`-Punkte hängen an derselben Sache: es gab keine
Hardware, keine Konten und keinen Netzzugang zu den Providern.

---

## Die verbindliche Reihenfolge

| # | Phase | Stand |
|---|---|---|
| 1 | Rein lesende Bestandsaufnahme | erfüllt |
| 2 | Sichere neue Projektstruktur | erfüllt |
| 3 | Domainmodelle | erfüllt |
| 4 | Eventstore | erfüllt |
| 5 | Persistente Jobqueue | erfüllt |
| 6 | Approval Engine mit vollständigen Tests | erfüllt |
| 7 | Call- und Audio-Simulator | erfüllt |
| 8 | Kompletter End-to-End-Dry-Run | erfüllt |
| 9 | Claude-Gehirn mit Mock-Tools | erfüllt |
| 10 | Prompt-Injection-Schutz | erfüllt |
| 11 | Lokales STT und VAD | erfüllt (Adapter), `unverified` (Modell) |
| 12 | Lokales TTS | erfüllt (Adapter), `unverified` (Stimme) |
| 13 | Latenzbenchmarks | Skript liegt bereit, **nicht gemessen** |
| 14 | Barge-in | erfüllt |
| 15 | Asterisk-Simulator | erfüllt |
| 16 | Reale Asterisk-Integration | `unverified` |
| 17 | Microsoft Graph im Dry-Run | erfüllt (gegen nachgebautes fetch) |
| 18 | Microsoft OAuth und Live-Lesetest | `unverified` |
| 19 | Kalenderintegration | erfüllt (Adapter), `unverified` (live) |
| 20 | WhatsApp-Webhook im Dry-Run | erfüllt |
| 21 | Offizielle WhatsApp-Live-Verbindung | `unverified` |
| 22 | SIM- und Gateway-Konfiguration | Vorlagen erzeugt, `unverified` |
| 23 | Echter eingehender Testanruf | offen — braucht Hardware |
| 24 | Echter ausgehender Testanruf | offen — braucht Hardware |
| 25 | Live-Versand an ein Testziel | offen — braucht Konto |
| 26 | Autostart | erfüllt (systemd, launchd) |
| 27 | Recovery | erfüllt |
| 28 | Backup und Restore | erfüllt |
| 29 | Monitoring | erfüllt (11 Healthchecks, 17 Metriken) |
| 30 | Vollständige Abschlussabnahme | dieses Dokument |

---

## Fehler, die beim Testen gefunden wurden

Nicht kosmetisch — jeder davon hätte im Betrieb weh getan.

**1. Audit-Log vergab doppelte Sequenznummern.**
Nebenläufige, nicht abgewartete Einträge lasen denselben Vorgängerhash und
brachen die Kette. Der erste Testlauf der Approval Engine produzierte
143 Fehler. Lesen und Schreiben laufen jetzt in einer Transaktion, die Aufrufe
im Prozess sind serialisiert.

**2. A-law-Encoder war falsch.**
Verschiebung um vier statt drei Bit, Vorzeichen als eigenes Bit statt als
XOR-Maske. Relativer Fehler: 51 Prozent. Am Telefon wäre das unverständliches
Rauschen gewesen. Jetzt nach der G.711-Referenz, Fehler unter 8 Prozent.

**3. VAD erkannte keinen Sprachbeginn.**
Der Zähler für zusammenhängende Sprache wurde bei jedem leisen Frame auf null
gesetzt. Deutsche Verschlusslaute reichen dafür aus — der Sprachbeginn wurde
schlicht nie erkannt. Jetzt Abbau statt Reset.

**4. Jitter Buffer gab bei gefülltem Puffer nichts aus.**
Der Füllzustand war implizit und widersprüchlich. Jetzt explizit.

**5. Log-Redaction ließ echte OAuth-Tokens durch.**
Die Token-Erkennung nutzte `\b` als Grenze. Weil `-` und `.` keine
Wortzeichen sind, zerfielen base64url-Tokens — also genau die Form echter
Refresh-Tokens — in kurze Stücke und blieben unredigiert. Ein Property-Test
hat es gefunden.

**6. `.env`-Parser nahm Kommentare in den Wert auf.**
`JARVIS_MODE=live   # Kommentar` hätte den Start zerlegt.

**7. Der Telefoniesimulator gab bei `collectDtmf` sofort auf.**
Der Ablauf meldete „PIN fehlt", wo in Wirklichkeit nur noch niemand getippt
hatte. Ein falsch gebauter Simulator hätte hier eine funktionierende
Freigabe als kaputt erscheinen lassen.

**8. Echte Rufnummern in einem Test.**
Nachdem Noah seine Nummern genannt hatte, standen sie in `config.test.ts` —
und wären ins Repository gewandert. Die eigens dafür gebaute CI-Prüfung hat
sie beim ersten lokalen Lauf gefunden. Sie sind durch erfundene ersetzt.

**9. `ws` liefert Ereignisse in drei Formen.**
String, Buffer oder Buffer-Array. Der Asterisk-Adapter behandelte zwei davon
und hätte den dritten Fall zu `[object Object]` gemacht.

---

## Was vor dem Live-Gang zu tun ist

**Kaufentscheidungen (nur Noah):**

1. GSM/VoLTE-Gateway mit SIP. **Kein zweites Handy** — ein Handy ist kein
   SIP-Trunk. **Kein reines 2G-Gerät** — die Netze sind abgeschaltet.
2. SIM-Karte für die Jarvis-Nummer. Portierungssperre beim Anbieter
   einrichten.
3. WhatsApp: klären, ob die bestehende Nummer direkt anbindbar ist oder über
   Coexistence bzw. Migration läuft. **Vor** dem Umstellen klären.
4. Anthropic-Zugang.

**Prüfungen (`docs/api-annahmen.md`):**

5. 14 Microsoft-Annahmen gegen die offizielle Dokumentation.
6. 9 WhatsApp-Annahmen, besonders das Antwortfenster und die Graph-Version.
7. 6 Asterisk-Annahmen gegen die **installierte** Version, vor allem die
   Parameter von `externalMedia`.

**Messungen:**

8. `pnpm bench:speech` auf Noahs Mac. Erst danach das Modell festlegen.
9. Für die Erkennungsgenauigkeit: echte Aufnahmen unter `var/bench/`.

**Erste scharfe Schritte, einzeln und in dieser Reihenfolge:**

10. `pnpm dry-run` — alle vier Szenarien `ok`.
11. Dry-Run-Betrieb über Stunden, `pnpm status` prüfen: **null** Sendungen.
12. `pnpm logs:safe` durchsehen: keine Adresse, keine Nummer, kein Token.
13. Erster echter Testanruf.
14. Erster echter Versand — **an Noahs eigene Adresse.**

---

## Abschließende Einschätzung

Was ohne Hardware, Konten und Netzzugang prüfbar war, ist gebaut und geprüft.
Die Sicherheitsaussage — ohne vollständige Freigabe wird nichts gesendet —
hängt an der Architektur und nicht am Wohlverhalten eines Sprachmodells; sie
ist durch 46 Tests einschließlich property-based Nachweisen belegt.

Was Hardware oder Konten braucht, ist gebaut und einzeln als `unverified`
markiert, mit einer Prüfliste je Annahme. Nichts davon ist als „fertig"
ausgegeben.

**Jarvis ist noch nicht abgenommen.** Die Punkte 23 bis 25 der Reihenfolge —
echter eingehender Anruf, echter ausgehender Anruf, echter Versand — stehen
aus und können erst mit dem gekauften Gateway und den verbundenen Konten
erfolgen.

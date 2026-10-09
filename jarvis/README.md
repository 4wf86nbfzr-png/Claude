# Jarvis — persönlicher KI-Assistent

Ein Assistent, der sich über **Telegram** bedienen lässt: reden, Aufgaben und
Termine verwalten, erinnert werden (auch per Anruf), Postfach im Blick behalten.
Dahinter steckt **ein** System — Telegram, Dashboard und Telefon greifen auf
dieselbe Datenbank, dasselbe Gedächtnis und dieselben Werkzeuge zu.

Läuft lokal, braucht genau eine Python-Abhängigkeit (`httpx`) und standardmäßig
ein lokales Sprachmodell über Ollama. Kein Konto bei irgendeinem Dienst nötig,
außer dem Telegram-Bot.

---

## In fünf Minuten startklar

```bash
cd jarvis
./start.sh            # legt .venv und .env an, installiert httpx
# TELEGRAM_BOT_TOKEN und TELEGRAM_ALLOWED_IDS in .env eintragen
./start.sh doctor     # prüft, was läuft und was fehlt
./start.sh selftest   # lässt die ganze Kette einmal echt durchlaufen
./start.sh run        # starten
```

`selftest` ist mehr als eine Zustandsabfrage: er legt eine Aufgabe an, plant
eine Erinnerung in die Vergangenheit, lässt den Hintergrunddienst sie auslösen,
prüft die Zustellung, löst eine Bestätigung ein und startet den Dienst neu — in
einer eigenen Datenbank unter `data/selftest/`, die danach wieder gelöscht wird.
Keine Anrufe, kein Mailversand, dein Bestand bleibt unberührt.

Dann im Telegram dem eigenen Bot `/start` schreiben.

**Die zwei Angaben, die nur du besorgen kannst:**

1. **Bot-Token** — in Telegram [@BotFather](https://t.me/BotFather) anschreiben,
   `/newbot`, Namen vergeben, Token kopieren → `TELEGRAM_BOT_TOKEN`.
2. **Deine Telegram-ID** — [@userinfobot](https://t.me/userinfobot) anschreiben,
   die Zahl kopieren → `TELEGRAM_ALLOWED_IDS`.
   *Ohne Eintrag nimmt Jarvis niemanden an — auch dich nicht.*

**Sprachmodell** (empfohlen, lokal):

```bash
brew install ollama        # macOS; Linux: curl -fsSL https://ollama.com/install.sh | sh
ollama serve &
ollama pull llama3.1:8b    # ein Modell mit Werkzeugunterstützung
```

Ohne Modell bleibt Jarvis bedienbar: Befehle, Knöpfe, Erinnerungen und Anrufe
funktionieren, nur das freie Gespräch fällt weg. Er sagt das dann auch.

---

## Was er kann

### Reden statt Befehle tippen

```
Ich:     Jarvis, ich muss morgen drei wichtige Dinge erledigen und habe heute kaum Zeit.
Jarvis:  Dann lass sie uns festhalten. Welche drei?

Ich:     Erinnere mich morgen früh daran, Alex anzurufen.
Jarvis:  Erinnerung #4 steht: morgen 07:00. Sag Bescheid, wenn es anders passt.

Ich:     Was steht heute noch an?
Jarvis:  Termine heute
         • heute 14:00–15:00  Personalplanung (Büro Hamburg)
         Aufgaben
         • #2 Angebot schreiben (Prio hoch)

Ich:     Verschiebe den unwichtigen Termin auf nächste Woche.
Jarvis:  Mehrere Termine passen. Welcher ist gemeint?
         • morgen 09:00 Teamrunde [a1b2…]
         • Freitag 16:00 Kaffee mit Jan [c3d4…]
```

Er erkennt, ob eine Nachricht Geplauder oder ein Auftrag ist, zerlegt größere
Aufträge in Aufgaben, fragt nach, wenn eine Angabe wirklich fehlt — und behauptet
nie, etwas getan zu haben, bevor das Werkzeug es bestätigt hat.

### Befehle

| Befehl | Wirkung |
|---|---|
| `/menu` | Menü mit Knöpfen |
| `/uebersicht` | Termine, Aufgaben, Erinnerungen für heute |
| `/aufgaben`, `/neu <Text>`, `/fertig <Nr>` | Aufgaben |
| `/erinnerungen`, `/erinnere <Text> <Zeit>` | Erinnerungen |
| `/termine [Tage]` | Kalender |
| `/mail` | ungelesene E-Mails |
| `/merken <Text>`, `/weisst <Frage>` | Langzeitgedächtnis |
| `/status` | Zustand aller Dienste |
| `/stumm`, `/telefonie an\|aus` | Benachrichtigungen, Anrufe |
| `/vergessen`, `/export`, `/abbrechen`, `/hilfe` | Daten und Hilfe |

Sprachnachrichten gehen auch (siehe unten).

### Sprachnachrichten

Schickst du eine Sprachnachricht, lädt Jarvis sie herunter, erkennt sie lokal
(`STT_ENGINE=whisper`, dazu `pip install faster-whisper`), zeigt dir zuerst
_„Verstanden: …"_ und behandelt den Text dann wie eine getippte Nachricht —
auch mit Werkzeugen. Ohne lokale Erkennung sagt er das offen, statt die
Nachricht stillschweigend zu verschlucken. Das Audio verlässt den Rechner
nicht, und die heruntergeladene Datei wird nach der Erkennung gelöscht.

### Von allein melden

Jarvis meldet sich, wenn es einen Anlass gibt: Termin in 30 Minuten, Aufgabe
überfällig, wichtige neue E-Mail, Erinnerung nicht bestätigt, Hintergrundauftrag
fehlgeschlagen. Jede Meldung kommt **einmal** (Dedupe-Schlüssel), in der Ruhezeit
nur Dringendes, der Rest wird morgens nachgeliefert. `MORNING_BRIEFING` setzt den
täglichen Überblick.

### Erinnerungsanrufe und echte Telefongespräche

```
Ruf mich morgen um 08:30 an und erinnere mich an meinen Termin.
Wenn ich meine Erinnerung nicht bestätige, ruf mich 15 Minuten später an.
Erinnere mich jeden Montag um 09:00 telefonisch an meine Wochenplanung.
```

Beim Anruf liest Jarvis den Text vor und fragt nach einer Taste: **1** = erledigt,
**2** = in 15 Minuten nochmal. Mit `PUBLIC_BASE_URL` geht auch ein echtes
Gespräch — Jarvis hört zu, denkt mit demselben Kopf wie im Chat und antwortet
hörbar. Aussenwirksame Aktionen (E-Mail senden, Termin löschen) führt er am
Telefon **nicht** aus; die Bestätigung kommt in Telegram.

---

## Das System

```
                Telegram ──┐
     Dashboard / API ──────┼──► Services ──► Werkzeuge (41)
             Telefon ──────┘        │          Aufgaben · Erinnerungen · Gedächtnis
                                    │          Kalender · E-Mail · Telefonie · Recherche
                                    ├──► SQLite (Gedächtnis, Aufgaben, Aufträge, Protokoll)
                                    ├──► Hintergrunddienst (persistente Aufträge)
                                    └──► Modellverwaltung (Ollama → Ersatz → Notbetrieb)
```

```
jarvis/
  cli.py                     run · doctor · setup · ask · backup · google-login
  config.py                  alle Einstellungen, Startprüfung
  db/                        Verbindung, versionierte Migrationen
  core/
    services.py              das zentrale System (alles hängt hier zusammen)
    agent.py                 Gespräch: Kontext → Modell → Werkzeuge → Antwort
    toolkit.py               Werkzeugregister (Schema, Zeitgrenzen, Protokoll)
    tools_*.py               die Werkzeuge selbst
    memory.py                Gesprächs-, Langzeit-, Ereignisgedächtnis
    tasks.py                 Aufgaben und Erinnerungen
    jobs.py                  Auftragswarteschlange und Hintergrunddienst
    permissions.py           drei Berechtigungsstufen, Bestätigungen
    notifier.py              proaktive Meldungen, Ruhezeiten, Dedupe
    timeutil.py              deutsche Zeitangaben („morgen früh", „jeden Montag")
  ai/                        Ollama, OpenAI, Anthropic, Ersatzmodell, Persönlichkeit
  adapters/
    telegram.py              Bedienung
    calendar/                lokal · CalDAV · Google (mit OAuth-Ablauf)
    email/                   IMAP/SMTP
    phone/                   Twilio Voice (TwiML)
    voice/                   Piper / Whisper, optional
  server/                    HTTP-Dienst + Dashboard
tests/                       155 Tests
```

**Warum so wenig Abhängigkeiten?** Telegram, Twilio, Google und CalDAV sind
HTTP-Schnittstellen; IMAP, SMTP, SQLite und ein HTTP-Server stecken in der
Standardbibliothek. Weniger Pakete heißt weniger, was unabhängig von diesem
Projekt kaputtgeht.

### Gedächtnis

Vier Schichten in derselben Datenbank:

* **Gespräch** — die letzten Nachrichten je Chat, dazu eine laufende
  Zusammenfassung (alle 24 Nachrichten neu verdichtet) und die offene Rückfrage.
* **Langzeit** — ausdrücklich Gemerktes, mit Volltextsuche. In jede KI-Anfrage
  gehen nur die als wichtig markierten Einträge; alles andere holt Jarvis mit
  `gedaechtnis_suchen`, wenn er es braucht. Der Bestand wandert **nie** komplett
  in den Kontext.
* **Aufgaben** — Status, Priorität, Fälligkeit, Abhängigkeiten, Ergebnis.
* **Ereignisse** — was tatsächlich passiert ist: ausgelöste Erinnerungen,
  angelegte Termine, versendete Mails, fehlgeschlagene Aktionen.

Einsehen, korrigieren, löschen und exportieren geht über Telegram
(`/weisst`, `/vergessen`, `/export`, Menü → Gedächtnis).

### Hintergrunddienst

Jeder geplante Vorgang ist eine Zeile in `job`. Darum übersteht alles einen
Neustart; hängengebliebene Aufträge werden beim Start wieder eingeplant.

* **Keine Doppelausführung**: `idempotency_key` (UNIQUE) + Übernahme per
  `UPDATE … WHERE status='geplant'` — nur wer die Zeile wirklich geändert hat,
  führt sie aus.
* **Wiederholungen** mit wachsendem Abstand (1, 5, 15, 60, 180 Minuten).
* **Wiederkehrende Aufträge** verstummen nicht wegen eines Fehlers: der nächste
  Termin wird trotzdem gesetzt.
* **Herzschlag** („wachdienst", jede Minute): fällige Erinnerungen, Eskalationen,
  beginnende Termine, überfällige Aufgaben, nachzuliefernde Meldungen.
* Täglich 03:30 Sicherung, 03:45 Aufräumen.
* Beenden ist geordnet: der laufende Takt wird abgewartet.

### Berechtigungen

| Stufe | Was | Verhalten |
|---|---|---|
| **1** | lesen, zusammenfassen, Aufgaben und Erinnerungen anlegen, rechnen | läuft ohne Rückfrage |
| **2** | E-Mail senden, Termin löschen/verschieben, Aufgabe löschen, Anruf starten, Daten exportieren | Knopfdruck nötig |
| **3** | Shell-Befehle, Sicherheitsfunktionen abschalten, Zugangsdaten ausgeben | gesperrt (die letzten beiden dauerhaft) |

Eine Bestätigung ist ein Einmal-Token, gebunden an genau diese Aktion **samt
ihrer Daten** (Fingerabdruck), und verfällt nach 15 Minuten. Zweimal einlösen
geht nicht, für eine andere Aktion gilt es nicht.

Weiteres: Zugang nur für die hinterlegten Telegram-IDs; Zugangsdaten nur in der
`.env` bzw. unter `data/secrets/` (Rechte 600) und niemals in Logs oder
Nachrichten (die Protokollierung filtert bekannte Token-Muster); TLS zu allen
Diensten; Dateizugriff nur in freigegebenen Ordnern; Twilio-Rückrufe werden per
Signatur geprüft; die API braucht ein Token (ohne Token: nur localhost).

**Fremdtext** (E-Mails, Webseiten, Dateien) wird eingerahmt und als Material
gekennzeichnet, Rollenmarker werden entschärft, und bei typischen
Übernahmeversuchen („ignoriere alle vorherigen Anweisungen") steht eine Warnung
dabei. Eine E-Mail kann Jarvis keine Aufträge geben.

---

## Kalender

`CALENDAR_PROVIDER` wählt den Anbieter:

* **`local`** (Standard) — in der Jarvis-Datenbank. Sofort nutzbar.
* **`caldav`** — Apple iCloud, Nextcloud, mailbox.org, Synology.
  `CALDAV_URL`, `CALDAV_USER`, `CALDAV_PASSWORD` (bei iCloud ein
  app-spezifisches Passwort), optional `CALDAV_CALENDAR`.
* **`google`** — OAuth-Client (Typ „Desktop") in der Google Cloud Console
  anlegen, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` setzen, dann einmalig:

  ```bash
  ./start.sh google-login
  ```

  Browser öffnet sich, Freigabe erteilen — fertig. Das Token liegt unter
  `data/secrets/google_token.json` (Rechte 600) und wird selbst erneuert.

**Jede Änderung wird nachgelesen.** Anlegen, Verschieben und Löschen gelten erst
als erfolgreich, wenn der Kalender den neuen Stand bestätigt. Sonst meldet Jarvis
einen Fehler statt eines erfundenen Erfolgs.

## E-Mail

`EMAIL_ENABLED=true` plus IMAP-Daten (und SMTP zum Senden). Jarvis holt
ungelesene Nachrichten, stuft sie nachvollziehbar ein (hinterlegte Absender,
Stichwörter, dringliche Betreffzeilen), fasst zusammen, sucht und schreibt
Antwortentwürfe.

**Gesendet wird nur nach Bestätigung.** Der Entwurf wird gezeigt, erst der
Knopfdruck löst den Versand aus — und nur einmal: ein bereits versendeter Entwurf
geht nicht erneut raus.

## Telefonie

`PHONE_ENABLED=true`, Twilio-Konto, gekaufte Nummer, eigene Nummer.
Für echte Gespräche zusätzlich `PUBLIC_BASE_URL` — eine von außen erreichbare
HTTPS-Adresse auf `HTTP_PORT`:

```bash
cloudflared tunnel --url http://localhost:8765     # oder: ngrok http 8765
```

Schutz: Tageslimit (`PHONE_DAILY_LIMIT`), begrenzte Versuche
(`PHONE_MAX_ATTEMPTS`), kein zweiter identischer Anruf innerhalb von fünf
Minuten, Protokoll in `call_log`, und `/telefonie aus` schaltet alles ab.

Stimme und Erkennung laufen standardmäßig über Twilio (nichts zu installieren,
geringste Verzögerung). Wer alles lokal will: `TTS_ENGINE=piper` mit
`PIPER_VOICE`, `STT_ENGINE=whisper`.

---

## Dashboard

`http://127.0.0.1:8765` zeigt Zustand, Aufgaben, Erinnerungen, Termine,
Hintergrundaufträge und die letzte Aktivität — und hat ein Eingabefeld, das
denselben Agenten anspricht wie Telegram. `HTTP_API_TOKEN` setzen und im
Dashboard eintragen (es merkt sich das Token im Browser).

Die API, falls du eigene Oberflächen anbinden willst
(`Authorization: Bearer <HTTP_API_TOKEN>`):

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/status` | Zustand, Komponenten, offene Einrichtungsschritte |
| GET | `/api/aufgaben`, `/api/erinnerungen`, `/api/termine?tage=7` | Daten |
| GET | `/api/ereignisse`, `/api/gedaechtnis`, `/api/auftraege`, `/api/protokoll`, `/api/werkzeuge`, `/api/anrufe` | mehr Daten |
| POST | `/api/nachricht` `{"text": "..."}` | mit Jarvis reden |
| POST | `/api/werkzeug` `{"name": "...", "argumente": {}}` | Werkzeug direkt |
| POST | `/api/bestaetigen` `{"token": "..."}` | Bestätigung einlösen |
| POST | `/api/aufgabe`, `/api/aufgabe/erledigt`, `/api/sicherung` | Aktionen |
| GET | `/gesundheit` | Lebenszeichen (ohne Token) |

Ein bereits vorhandenes eigenes Dashboard lässt sich gegen diese API betreiben —
Gestaltung bleibt, die Daten kommen aus demselben Kern wie in Telegram.

---

## Dauerbetrieb

**macOS (LaunchAgent)** — startet bei der Anmeldung, startet nach einem Absturz neu:

```bash
# im plist /PFAD/ZU/jarvis ersetzen
cp launchagent/com.jarvis.assistent.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.jarvis.assistent.plist
launchctl kickstart -k gui/$(id -u)/com.jarvis.assistent   # neu starten
```

**Linux-Server (systemd)** — `launchagent/jarvis.service` anpassen und
`systemctl enable --now jarvis`. Ein Umzug braucht nur `.env` und den Ordner
`data/`; die Architektur bleibt dieselbe.

**Sicherungen** liegen in `data/backups/` (täglich 03:30, die letzten
`BACKUP_KEEP` Stände, konsistent über die SQLite-Backup-API). Wiederherstellen:

```bash
./start.sh restore data/backups/jarvis-20261009-033000.sqlite3
```

---

## Werkzeuge

41 Werkzeuge, die Modell, Knöpfe, Dashboard und Telefon gleichermaßen benutzen —
`./start.sh tools` listet sie mit Beschreibung:

* **Aufgaben** — anlegen, ändern, abschließen, auflisten, löschen (Stufe 2),
  `aufgaben_planen` zerlegt einen Auftrag in aufeinander aufbauende Schritte
* **Erinnerungen** — anlegen (einmalig/wiederkehrend, Telegram/Telefon),
  auflisten, verschieben, bestätigen, abbrechen
* **Kalender** — anzeigen, anlegen, suchen, freie Zeiten, verschieben/löschen (Stufe 2)
* **E-Mail** — ungelesene, suchen, lesen und zusammenfassen, Entwurf schreiben
  und überarbeiten, senden (Stufe 2)
* **Gedächtnis** — merken, suchen, auflisten, korrigieren, löschen
* **Telefonie** — Anruf planen, sofort anrufen (Stufe 2), ein-/ausschalten, Protokoll
* **Recherche** — Web suchen, Seite abrufen, Datei suchen und lesen, zusammenfassen
* **Status** — Tagesüberblick, Systemstatus, Statusbericht

---

## Tests

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q        # 237 Tests, rund 47 Sekunden
```

Keine echten Anrufe, kein echter Mailversand, keine Zugriffe nach draußen.
Entscheidend ist dabei: die vier Außenschnittstellen werden **nicht** mit
Doppelgängern abgetan, sondern laufen gegen Stellvertreter-Server, die das
jeweilige Protokoll wirklich sprechen — der echte Adapter, die echten Clients,
die echte Datenbank:

| Stellvertreter | Was damit wirklich durchläuft |
|---|---|
| **Telegram-Bot-API** (`tests/stub_telegram.py`) | `getMe`, Abrufschleife, Versatz, Nachrichten, Befehle, Inline-Knöpfe, zweistufiger Bestätigungsweg, Dateiabruf für Sprachnachrichten |
| **IMAP + SMTP** (`tests/stub_mail.py`) | Verbindung, Anmeldung, Suche, Abruf, kodierte Kopfzeilen, HTML-Entschlackung, echter Versandweg |
| **CalDAV** (`tests/stub_caldav.py`) | PROPFIND, REPORT, PUT, DELETE, GET — samt der Regel, dass jede Änderung nachgelesen wird |
| **Twilio Voice** (`tests/stub_twilio.py`) | Anruf absetzen, TwiML, Tagesgrenze, Doppelanruf-Schutz — dazu die Webhooks gegen den **echten** HTTP-Dienst mit gültiger Signatur, inklusive Telefongespräch mit Werkzeugaufruf |

Obendrauf eine **Gesamtprobe** (`tests/test_gesamtprobe.py`): alle vier
Schnittstellen gleichzeitig angebunden, Hintergrunddienst und HTTP-Dienst
laufen — und dann der Weg quer durchs Haus: Telegram-Nachricht legt einen
Termin auf dem CalDAV-Server an, die Postfachprüfung meldet eine wichtige Mail
nach Telegram, eine fällige Erinnerung löst einen echten Anruf beim Anbieter
aus, das Dashboard zeigt denselben Stand, ein Telefongespräch läuft über den
signierten Webhook, und eine E-Mail geht erst nach Bestätigung raus.

Außerdem geprüft: Abweisung fremder Telegram-Nutzer, Gesprächskontext,
Werkzeugschleife, Schutz vor Doppelausführung, Fortbestehen der Erinnerungen
über einen Neustart, Migrationen, Bestätigungspflicht bei E-Mail und Anruf,
Verhalten bei Modellausfall, Ruhezeiten, Dateischranke und Prompt-Injection-Schutz.

Diese Durchläufe haben sechs echte Fehler gefunden, die vorher niemandem
aufgefallen wären — darunter eine falsch berechnete Twilio-Signatur bei URLs
mit Parametern (telefonische Bestätigungen hätten **nie** funktioniert) und
ungültiges SQL in der Anrufzählung. Auch dass ein leerer Wert in der `.env`
still auf den Standard zurückfiel — `MORNING_BRIEFING=` hätte trotzdem
gefeuert — fiel erst hier auf.

## Wenn etwas nicht läuft

| Symptom | Ursache und Abhilfe |
|---|---|
| `./start.sh doctor` zeigt `✗ KI-Modell` | `ollama serve` läuft nicht oder das Modell fehlt (`ollama pull llama3.1:8b`) |
| Bot antwortet nicht | Token falsch, oder die eigene ID fehlt in `TELEGRAM_ALLOWED_IDS` |
| „Dieser Assistent ist persönlich …" | die eigene ID eintragen und neu starten |
| Erinnerungen kommen nicht | läuft `jarvis run`? `/status` zeigt den letzten Takt des Hintergrunddienstes |
| Keine Meldungen nachts | Ruhezeit (`QUIET_HOURS_*`); Dringendes kommt trotzdem |
| Telefongespräch endet sofort | `PUBLIC_BASE_URL` fehlt oder der Tunnel ist zu |
| Dashboard sagt „nicht autorisiert" | `HTTP_API_TOKEN` setzen und oben im Dashboard eintragen |
| Irgendetwas hakt, und du weißt nicht wo | `./start.sh selftest` — er sagt, welcher Schritt bricht |
| Protokoll ansehen | `data/logs/jarvis.log`, oder Menü → System → Letzte Fehler |

Alle Einstellungen sind in `.env.example` dokumentiert.

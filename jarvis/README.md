# Jarvis — persönlicher KI-Assistent

Ein Assistent, der sich über **Telegram** bedienen lässt: reden, Aufgaben und
Termine verwalten, erinnert werden (auch per Anruf), Postfach im Blick behalten.
Dahinter steckt **ein** System — Telegram, Dashboard und Telefon greifen auf
dieselbe Datenbank, dasselbe Gedächtnis und dieselben Werkzeuge zu.

Läuft lokal, braucht genau eine Python-Abhängigkeit (`httpx`) und standardmäßig
ein lokales Sprachmodell über Ollama. Kein Konto bei irgendeinem Dienst nötig,
außer dem Telegram-Bot.

---

## Zuerst lesen

| Datei | Wofür |
|---|---|
| **`START-HEUTE.md`** | Schritt-für-Schritt vom leeren Rechner bis „Jarvis antwortet". Fang damit an. |
| **`START-ORB.md`** | Das Dashboard zum Sprechen: schnipsen, reden, Stimme einstellen. |
| **`FORTSCHRITT.md`** | Was läuft, was nur gebaut und noch nicht live geprüft ist, was fehlt. |
| **`gehirn-grundlagen.md`** | 39 Arbeitsregeln als Grundausstattung. `./start.sh lernen grundlagen`. |
| **`mein-gehirn.start.md`** | Ausgefüllte Startfassung seines Gedächtnisses. `./start.sh lernen` macht daraus deine persönliche `mein-gehirn.md` (bleibt bei Aktualisierungen unangetastet). `mein-gehirn.vorlage.md` ist die leere Variante. |
| **`TESTPLAN.md`** | 68 konkrete Nachrichten zum Abschicken samt erwartetem Ergebnis. Zum Abhaken. |

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
funktionieren, nur das freie Gespräch fällt weg. Er sagt das dann auch. Und er
versteht weiterhin die eindeutigen Aufträge — „erinnere mich morgen um 8 an …",
„merk dir …", „ich muss …", „ruf mich um 9 an" — und führt sie wirklich aus
(`core/offline.py`), statt sie nur höflich zu quittieren.

**Kleine Modelle** (3B auf einem Intel-Mac) greifen beim Werkzeugwählen oft
daneben und schreiben den Aufruf als Fließtext. Dagegen zwei Vorkehrungen:
Werkzeuge, die gerade nichts ausrichten können, bekommt das Modell gar nicht
erst zu sehen (ohne Telefonie und Postfach sind es 31 statt 41) — und war der
Satz eindeutig, holt ein Sicherheitsnetz die Ausführung nach, wenn das Modell
sie verfehlt hat. Hat es richtig gehandelt, passiert nichts doppelt.

**Auf einem Intel-Mac** rechnet Ollama nur auf der CPU — ein 8B-Modell braucht
dort schnell eine halbe Minute pro Antwort. Dann besser ein kleines Modell
(`AI_MODEL=llama3.2:3b`) oder ein Cloud-Modell: `AI_PROVIDER=anthropic`,
`ANTHROPIC_API_KEY=…`, `AI_MODEL=claude-haiku-5-5` (0,10 $ / 0,50 $ je Million
Token ein/aus — im Alltag Cent-Beträge). Das ist schnell und klug, aber dabei
verlassen Aufgaben, Termine und E-Mail-Auszüge den Rechner; für ein deutsches
Unternehmen ist das eine bewusste Entscheidung, keine Nebensache.

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
| `/gehirn`, `/vergiss <Nr>` | Alles ansehen, einen Punkt löschen |
| `/status` | Zustand aller Dienste |
| `/stumm`, `/telefonie an\|aus` | Benachrichtigungen, Anrufe |
| `/vergessen`, `/export`, `/abbrechen`, `/hilfe` | Daten und Hilfe |

Sprachnachrichten gehen auch (siehe unten).

### Sein Gedächtnis füllen

Jarvis weiß zunächst nichts über dich. Du füllst `mein-gehirn.md` aus — eine
Zeile pro Punkt — und **schickst die Datei in Telegram als Anhang**:

```
Name: Maik Herm
!! Telefonate: lieber vormittags, ab 9 Uhr
! Wochenplanung: montags 9 Uhr, bitte telefonisch erinnern
```

`!!` heißt *in jeder Antwort mitdenken* (Tonfall, Name, Firma), `!` heißt
*wichtig*, ohne Marke heißt *nachschlagbar, wenn es passt*. Nur die mit `!`
und `!!` markierten Punkte gehen in jede KI-Anfrage — der Rest wird geholt,
wenn er gebraucht wird, damit der Kontext klein bleibt.

Jarvis zeigt dir erst, was er in der Datei gefunden hat, und lernt es nach
deiner Bestätigung. Unausgefüllte Platzhalter (`<dein Name>`) überspringt er,
statt Vorlagentext als Tatsache zu merken. Dieselbe Datei erneut geschickt
ändert nur, was sich geändert hat — sie bleibt die Fassung, die du behältst.

Ohne Datei geht es auch: `/merken Ich bin donnerstags meist auf Objekten`.
Ansehen mit `/gehirn`, löschen mit `/vergiss #12`. Im Terminal:
`./start.sh lernen` (`--probe` zeigt nur, was gelernt würde) und
`./start.sh gehirn`.

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
    brain.py                 mein-gehirn.md einlesen und übernehmen
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

## Nachrichten (WhatsApp & Co.)

Jarvis liest eingehende Nachrichten mit, stuft jede ein — *ignorieren*,
*melden*, *dringend* — und meldet nur, was dich angeht. Absage,
Krankmeldung, „schaffe es nicht", deutliche Verspätung: das gilt als
dringend und löst zusätzlich einen Anruf aus, sobald Telefonie steht.

Die Einstufung läuft nach Regeln, ohne KI, in Millisekunden. Ein Modell darf
danach eine Zweitmeinung abgeben, aber eine erkannte Absage nie herabstufen.
Im Zweifel wird gemeldet: der teure Fehler ist nicht die Meldung zu viel,
sondern die Absage, die untergeht.

Zwei Quellen, beide hinter derselben Schnittstelle (`MESSENGER_QUELLE`):

| Quelle | Wie | Haken |
|---|---|---|
| `mac` | liest die Mitteilungen mit, die **WhatsApp Desktop** auf dem Mac anzeigt | nur macOS; WhatsApp Desktop muss laufen und Mitteilungen zeigen; Terminal braucht **Festplattenvollzugriff**; sichtbar ist nur die Vorschau, keine Bilder, keine alten Chats |
| `bruecke` | nimmt Nachrichten per HTTP an (`POST /api/nachricht/eingang`) | du brauchst etwas, das postet — die offizielle WhatsApp-Business-API, ein eigener Dienst, ein anderer Messenger |

**Was nicht geht und warum:** WhatsApp hat keine offene Schnittstelle für
private Konten. Die Business-API spricht nur über eine eigene
Geschäftsnummer, nicht über dein Handy. Inoffizielle Bibliotheken
(whatsapp-web.js, Baileys) melden sich als Zweitgerät an — das verstößt
gegen die Nutzungsbedingungen und kann die **Nummer sperren**. Für eine
Firmennummer ist das ein echtes Risiko, deshalb ist so etwas hier nicht
eingebaut. Der Mitlese-Weg über die Mitteilungen umgeht das: er liest nur,
was dein Mac ohnehin anzeigt.

Antworten schreibt Jarvis auf Wunsch (Knopf „Antwort entwerfen") —
abgeschickt wird in WhatsApp, von dir.

Dazu kommt der **Zwischenstand**: alle `BERICHT_INTERVALL_STUNDEN` Stunden
eine kurze Nachricht, was im Hintergrund lief — Mails durchgesehen,
Nachrichten gelesen und gefiltert, Erinnerungen, Anrufe. War nichts, bleibt
es still. Auf Zuruf: `/bericht`.

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

## Orb — das Dashboard zum Sprechen

`./start.sh orb` startet den Dienst und öffnet `http://127.0.0.1:8765/orb`
in Chrome (nur Chrome hat die Spracherkennung eingebaut).

```
Chrome                        dein Mac                        draußen
Schnipserkennung  ─────────>  Jarvis-Kern        ─────────>   Modell
Sprache → Text                 Gedächtnis                     (Ollama oder Claude)
HUD-Anzeige                    Aufgaben                       ElevenLabs (Stimme)
Audio-Ausgabe     <─────────   Werkzeuge          ─────────>  tagesschau, heise, NDR
```

Derselbe Kern wie in Telegram: ein Gedächtnis, eine Aufgabenliste, dieselben
Werkzeuge. Was du sprichst, weiß der Bot.

**Zweimal schnipsen** (oder klatschen) aktiviert ihn: das HUD fährt hoch, die
Stimme sagt „Moin, Master" und nennt, was jetzt zählt — aktuelle
Schlagzeilen, dringende Nachrichten, der nächste Termin, offene Aufgaben —
und fragt, womit ihr anfangt. Kommt er an keine Nachrichtenquelle heran,
sagt er das; erfunden wird nichts.

Erkannt wird nicht die Lautstärke allein — sonst löst jede zugeschlagene Tür
aus. Ein Schnipser ist ein *kurzer, heller* Impuls: Ruhe davor, Spitze über
der Schwelle, viel Energie über 2 kHz, im nächsten Messfenster schon wieder
weg. Zwei davon im Abstand von 120–900 ms aktivieren, dann vier Sekunden
Ruhe. Die Schwelle ist im Dashboard einstellbar und zeigt dort live, was
erkannt wurde. Alles läuft im Browser — es geht kein Audio hinaus.

**Im Betrieb:** Ring anklicken oder Leertaste zum Sprechen, *Dauerbetrieb*
für durchgehendes Zuhören, einfach reinreden oder Esc unterbricht ihn
mitten im Satz. Tippen geht immer.

**Die Stimme** kommt von ElevenLabs, wenn `ELEVENLABS_API_KEY` gesetzt ist —
Stimme, Stabilität, Ausdruck und Tempo stellst du im Dashboard ein, nicht in
der `.env`. Ohne Schlüssel spricht der Browser; oben rechts steht, welche
gerade spricht. Damit es nicht vorgelesen klingt, schreibt Jarvis vorher aus,
was man spricht („13:13 Uhr" → „dreizehn Uhr dreizehn", „am 5.11." → „am
fünften November"), und spricht satzweise: das erste Stück läuft schon,
während der Rest erzeugt wird.

**Zwei Ansichten:** *HUD* und *Gehirn*. Im Gehirn stehen alle dauerhaften
Einträge, gruppiert und durchsuchbar, mit Feld zum Nachtragen und Knopf zum
Vergessen. Beibringen geht auch im Gespräch — „füge deinem Gehirn hinzu: …",
oder diktiert über „merk dir Folgendes" und dann sprechen.

**Das HUD zeigt** Zustand (Bereitschaft, Zuhören, Verarbeiten, Recherchieren,
Aufgabe läuft, Sprechen, Fehler), eine Wellenform nach dem echten Pegel, die
aktuelle Nachrichtenlage, das Protokoll der letzten Aktionen sowie Aufgaben,
Nachrichten und Termine.

**Aktionen auf dem Rechner** sind mit Absicht eng gefasst: Programme nur aus
`ORB_PROGRAMME`, Adressen nur http(s), Dateien nur in `JARVIS_FILE_ROOTS`
(überschreiben erst nach Bestätigung), Bildschirmfotos werden beschrieben und
sofort verworfen. Alles zusammen abschaltbar mit `ORB_AKTIONEN=false`. Ein
frei wählbarer Programmname wäre eine Hintertür — ein Satz in einer fremden
E-Mail könnte sonst eine Anwendung starten.

Alles dazu in **`START-ORB.md`**, der ehrliche Stand in **`FORTSCHRITT.md`**.

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
| POST | `/api/orb/sprich` `{"text": "..."}` | Satz an den Orb, Antwort mit Audioadresse |
| POST | `/api/orb/begruessung`, `/api/orb/start` | Begrüßung, Startaufstellung |
| GET | `/api/orb/einstellungen`, `/api/orb/stimmen`, `/api/orb/lage` | Zustand, Stimmenliste, Nachrichtenlage |
| POST | `/api/orb/stimme`, `/api/orb/vertonen` | Stimme einstellen, Text vertonen |
| POST | `/api/nachricht/eingang` | Messenger-Brücke: `{"absender","text","id","gruppe"}` |
| GET | `/api/nachrichten`, `/api/bericht` | eingegangene Nachrichten, Zwischenstand |
| POST | `/api/nachricht/erledigt` `{"id": 1}` | Nachricht abhaken |
| GET | `/gesundheit` | Lebenszeichen (ohne Token) |
| GET | `/orb` | Sprachoberfläche (nur lokal erreichbar) |

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
.venv/bin/python -m pytest -q        # 297 Tests, rund 65 Sekunden
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
| **Ollama / OpenAI / Anthropic** (`tests/stub_ai.py`) | Anfrageaufbau (Modell, Werkzeugschema, Temperatur), alle drei Formen von Werkzeugaufrufen, Rückweg der Werkzeugergebnisse, Rückfall auf den Textweg bei Modellen ohne Werkzeuge, Wiederholung, Ersatzmodell, Notbetrieb, Modellwechsel |

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

Diese Durchläufe haben sieben echte Fehler gefunden, die vorher niemandem
aufgefallen wären — darunter eine falsch berechnete Twilio-Signatur bei URLs
mit Parametern (telefonische Bestätigungen hätten **nie** funktioniert) und
ungültiges SQL in der Anrufzählung. Auch dass ein leerer Wert in der `.env`
still auf den Standard zurückfiel — `MORNING_BRIEFING=` hätte trotzdem
gefeuert — fiel erst hier auf. Und dass `/merken` und `/erinnere` vom
Sprachmodell abhingen: bei abgeschaltetem Ollama antwortete Jarvis
„Gemerkt." und merkte nichts. Beide Befehle legen jetzt selbst ab, ohne
Modell — eine Zusage ohne Eintrag ist schlimmer als eine Fehlermeldung.

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
| Er kennt mich nicht | `mein-gehirn.md` ausfüllen und dem Bot als Datei schicken; `/gehirn` zeigt den Stand |
| Irgendetwas hakt, und du weißt nicht wo | `./start.sh selftest` — er sagt, welcher Schritt bricht |
| Protokoll ansehen | `data/logs/jarvis.log`, oder Menü → System → Letzte Fehler |

Alle Einstellungen sind in `.env.example` dokumentiert.

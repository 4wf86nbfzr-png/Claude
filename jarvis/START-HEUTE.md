# Heute in Betrieb nehmen

Von null bis „Jarvis antwortet in Telegram" in etwa 30 Minuten, davon
20 Minuten Warten auf den Modell-Download. Die Reihenfolge ist wichtig,
jeder Schritt sagt dir, woran du merkst, dass er geklappt hat.

Was du brauchst: einen Mac oder Linux-Rechner, der laufen bleibt (ein
zugeklappter Laptop schläft und erinnert dich dann nicht), Telegram auf dem
Handy, etwa 6 GB Platz auf der Platte.

---

## Schritt 1 — Projekt auf den Rechner holen (2 Min)

Terminal öffnen (auf dem Mac: ⌘+Leertaste, „Terminal") und einfügen:

```bash
cd ~
git clone https://github.com/4wf86nbfzr-png/Claude.git jarvis-projekt
cd jarvis-projekt
git checkout claude/jarvis-autonomous-ai-assistant-6v8ovt
cd jarvis
```

**Geklappt, wenn** `ls` dir `README.md`, `start.sh` und `mein-gehirn.md` zeigt.

> Kein git installiert? Der Mac fragt dann selbst, ob er die
> Entwicklerwerkzeuge laden soll — „Installieren" anklicken und den Befehl
> danach wiederholen.

---

## Schritt 2 — Python prüfen (1 Min)

```bash
python3 --version
```

**Geklappt, wenn** dort `3.11` oder höher steht. Falls `3.9` kommt (so
liefert macOS es aus):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install python@3.12
```

`start.sh` sucht sich danach selbst die passende Version.

---

## Schritt 3 — Telegram-Bot anlegen (3 Min, am Handy)

1. In Telegram **@BotFather** suchen und anschreiben.
2. `/newbot` senden.
3. Namen eingeben, z. B. `Jarvis`.
4. Benutzernamen eingeben — muss auf `bot` enden und frei sein,
   z. B. `herm_jarvis_bot`.
5. BotFather antwortet mit einer Zeile wie
   `7891234567:AAF...` — **das ist dein Token.** Kopieren.

Dann noch deine eigene Kennung:

6. **@userinfobot** suchen, anschreiben, irgendetwas senden.
7. Er antwortet mit `Id: 123456789` — **das ist deine ID.** Kopieren.

**Geklappt, wenn** du beide Zeichenfolgen hast. Der Token ist ein Passwort —
nicht weitergeben, nicht in einen Chat posten.

---

## Schritt 4 — Erststart und Zugangsdaten eintragen (3 Min)

```bash
./start.sh
```

Beim ersten Mal richtet er die Umgebung ein und legt eine `.env` an. Diese
Datei öffnen:

```bash
open -e .env          # Mac: TextEdit;  Linux: nano .env
```

Zwei Zeilen ausfüllen (nichts dazwischen, kein Leerzeichen ums `=`):

```
TELEGRAM_BOT_TOKEN=7891234567:AAF...
TELEGRAM_ALLOWED_IDS=123456789
```

Speichern, Editor schließen.

**Geklappt, wenn** `grep TELEGRAM .env` beide Werte zeigt.

> `TELEGRAM_ALLOWED_IDS` ist die Zugangssperre: nur diese ID darf mit dem Bot
> reden. Lässt du sie leer, nimmt Jarvis **niemanden** an — auch dich nicht.

---

## Schritt 5 — Sprachmodell (5 Min + Download)

Zuerst prüfen, was für ein Mac es ist:

```bash
uname -m
```

### `arm64` (Apple Silicon) — lokales Modell, kostenlos

```bash
brew install ollama                       # oder ollama.com/download/mac
ollama serve &
ollama pull llama3.1:8b                   # ~5 GB
```
In der `.env` bleibt `AI_MODEL=llama3.1:8b`. Antworten kommen in 2–5 Sekunden.

### `x86_64` (Intel) — kleines lokales Modell …

Intel-Macs rechnen nur auf der CPU, die Grafik hilft nicht mit. Ein 8B-Modell
bräuchte dort pro Antwort eine halbe Minute. Deshalb das kleine:

```bash
ollama pull llama3.2:3b
```
und in der `.env`: `AI_MODEL=llama3.2:3b`. Antworten in 5–15 Sekunden,
alles bleibt auf dem Rechner, kostet nichts.

### … oder ein Cloud-Modell, wenn dir das zu langsam ist

```
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...        # console.anthropic.com → API Keys
AI_MODEL=claude-haiku-5-5
ANTHROPIC_EFFORT=low
```
Antworten in 1–2 Sekunden, deutlich klüger. Preis: 0,10 $ je Million Token
hinein, 0,50 $ hinaus — im Alltag Cent-Beträge pro Tag. Dafür verlassen
Aufgaben, Termine und E-Mail-Auszüge deinen Rechner. Für einen Betrieb mit
Personaldaten ist das eine bewusste Entscheidung; die Zugangsdaten zu
Postfach, Kalender und Telefonie bleiben in jedem Fall lokal.

Du kannst später jederzeit wechseln: `.env` ändern, Dienst neu starten.

**Geklappt, wenn** `ollama list` das Modell zeigt (lokal) bzw. der Schlüssel
in der `.env` steht (Cloud).

> Kein Modell? Jarvis läuft trotzdem — Befehle, Knöpfe, Aufgaben,
> Erinnerungen, Kalender und Anrufe funktionieren alle. Nur das freie
> Gespräch fehlt, und er sagt dir das offen.

---

## Schritt 6 — Selbstprüfung (2 Min)

```bash
./start.sh doctor
```

Zeigt für jeden Baustein `✓` (läuft), `✗` (kaputt) oder `—` (nicht
eingerichtet, in Ordnung). Erwartet werden jetzt `✓` bei Datenbank,
KI-Modell und Telegram; `—` bei E-Mail und Telefonie.

Dann die große Probe:

```bash
./start.sh selftest
```

Er legt testweise eine Aufgabe an, plant eine Erinnerung in die
Vergangenheit, lässt den Hintergrunddienst sie auslösen, prüft die
Zustellung, löst eine Bestätigung ein und startet sich neu — in einer eigenen
Datenbank, die er danach wieder löscht.

**Geklappt, wenn** am Ende `Alle 14 Pruefungen bestanden.` steht.

---

## Schritt 7 — Starten und begrüßen (2 Min)

```bash
./start.sh run
```

Das Terminal bleibt offen — das ist der laufende Dienst. Nicht schließen.

Jetzt in Telegram deinen Bot suchen (den Benutzernamen aus Schritt 3) und
`/start` senden.

**Geklappt, wenn** Jarvis mit „Jarvis ist gestartet" und einem Menü antwortet.

Kurz ausprobieren:

```
Erinnere mich in 2 Minuten daran, Wasser zu trinken
```

Nach zwei Minuten muss die Erinnerung mit zwei Knöpfen kommen. Damit weißt
du: der Hintergrunddienst arbeitet wirklich.

---

## Schritt 8 — Sein Gedächtnis füllen (10 Min) ← der eigentliche Punkt

Jetzt bringst du ihm bei, wer du bist. Öffne:

```bash
open -e mein-gehirn.md
```

Die Datei ist schon zur Hälfte gefüllt (Firma, Bereiche, Adressen, Tonfall).
Trag ein, was in spitzen Klammern steht, und streich, was nicht passt.
Das Format ist eine Zeile pro Punkt:

```
Name: Maik Herm
!! Telefonate: lieber vormittags, ab 9 Uhr
! Wochenplanung: montags 9 Uhr, bitte telefonisch erinnern
```

- `!!` = *steht in jeder Antwort im Hinterkopf* (für Tonfall, Name, Firma)
- `!` = *wichtig* (Arbeitsweise, feste Abläufe)
- ohne Marke = nachschlagbar, wenn es passt

**Zehn genaue Punkte sind mehr wert als fünfzig vage.** Lieber
„Dienstplan: donnerstags für die Folgewoche, Fahrer zuerst" als
„Dienstpläne sind wichtig".

Dann **die Datei in Telegram an deinen Bot schicken** — als Anhang
(Büroklammer → Datei), nicht als kopierten Text. Jarvis zeigt dir, was er
darin gefunden hat, und fragt nachher: *„Soll ich das so lernen?"* →
**Ja, lernen**.

Alternativ im Terminal (zweites Fenster, der Dienst läuft weiter):

```bash
cd ~/jarvis-projekt/jarvis
./start.sh lernen --probe     # zeigt nur, was gelernt würde
./start.sh lernen             # übernimmt es
```

**Geklappt, wenn** `/gehirn` in Telegram deine Punkte auflistet.

Probe aufs Ganze — frag ihn:

```
Was weißt du über mich?
Wie soll ich dich ansprechen?
```

Er sollte deinen Namen und deinen gewünschten Tonfall kennen.

> Nachschärfen geht jederzeit, ohne Datei: `/merken Ich bin donnerstags
> meist auf Objekten` — er legt es selbst ab. Löschen: `/vergiss #12`.
> Und wenn du die Datei änderst: einfach erneut schicken, gleicher
> Schlüssel überschreibt den alten Wert.

---

## Schritt 9 — Alles durchtesten (15 Min)

Öffne `TESTPLAN.md` — darin stehen 40 konkrete Nachrichten zum Abschicken
samt dem, was passieren muss. Von oben nach unten durchgehen und abhaken.
Was nicht stimmt, schick mir mit der Nummer.

---

## Schritt 10 — Dauerbetrieb (5 Min)

Solange das Terminal offen ist, läuft Jarvis. Damit er auch nach einem
Neustart von selbst kommt:

```bash
PROJEKT="$HOME/jarvis-projekt/jarvis"
sed "s|/PFAD/ZU/jarvis|$PROJEKT|g" launchagent/com.jarvis.assistent.plist \
  > ~/Library/LaunchAgents/com.jarvis.assistent.plist
launchctl load -w ~/Library/LaunchAgents/com.jarvis.assistent.plist
```

Dann das Terminal mit `./start.sh run` mit Strg+C beenden — ab jetzt
startet der LaunchAgent ihn selbst.

**Geklappt, wenn** `/status` in Telegram weiterhin antwortet, obwohl kein
Terminal offen ist.

Wichtig: der Rechner muss wach bleiben. Systemeinstellungen → Batterie →
„Automatischen Ruhezustand verhindern" (bei Netzbetrieb). Ein Laptop im
Deckel-zu-Modus erinnert dich nicht.

- Neu starten: `launchctl kickstart -k gui/$(id -u)/com.jarvis.assistent`
- Ausschalten: `launchctl unload -w ~/Library/LaunchAgents/com.jarvis.assistent.plist`
- Logbuch: `tail -f data/logs/jarvis.log`

---

## Später, wenn du magst

Nicht heute nötig — Jarvis läuft auch ohne:

| Was | Wie | Aufwand |
|---|---|---|
| **Kalender** (Apple/iCloud) | `CALDAV_URL=https://caldav.icloud.com/`, Benutzer = Apple-ID, Passwort = app-spezifisches Passwort aus appleid.apple.com | 10 Min |
| **Kalender** (Google) | OAuth-Client in der Cloud Console, dann `./start.sh google-login` | 20 Min |
| **E-Mail** | `EMAIL_ENABLED=true` plus IMAP/SMTP-Daten von hst-hospitality.com | 10 Min |
| **Erinnerungsanrufe** | Twilio-Konto, Nummer kaufen (~1 €/Monat), Daten in die `.env` | 30 Min |
| **Echte Telefongespräche** | zusätzlich ein HTTPS-Tunnel: `cloudflared tunnel --url http://localhost:8765`, Adresse als `PUBLIC_BASE_URL` | 20 Min |
| **Sprachnachrichten** | `pip install faster-whisper`, dann `STT_ENGINE=whisper` | 10 Min |
| **Dashboard im Browser** | `HTTP_API_TOKEN=` mit langer Zufallszeichenfolge füllen, dann http://127.0.0.1:8765 | 2 Min |

Nach jeder Änderung an der `.env`: Dienst neu starten (Strg+C, dann
`./start.sh run`) — die Datei wird nur beim Start gelesen.

---

## Wenn etwas nicht geht

| Symptom | Ursache |
|---|---|
| Bot antwortet gar nicht | Läuft `./start.sh run` noch? Terminal zu = Dienst aus |
| „Dieser Assistent ist persönlich" | Deine ID fehlt in `TELEGRAM_ALLOWED_IDS`, oder Tippfehler |
| „Telegram lehnt den Token ab" | Token falsch kopiert — bei BotFather `/mybots` → Token neu holen |
| Antwortet, aber stumpf/kurz | Ollama läuft nicht: `ollama serve &`, dann `ollama list` |
| Erinnerung kommt nicht | `/status` zeigt den letzten Takt des Hintergrunddienstes |
| Nachts keine Meldungen | Ruhezeit (22–7 Uhr). Dringendes kommt trotzdem. Ändern: `QUIET_HOURS_START` |
| Irgendetwas hakt | `./start.sh selftest` — er sagt, welcher Schritt bricht |

Fehler im Klartext: `tail -50 data/logs/jarvis.log` oder in Telegram
Menü → System → Letzte Fehler.

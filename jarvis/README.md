# JARVIS

Persoenlicher Sprachassistent fuer macOS. Lokal orientiert: Sprachmodell,
Spracherkennung und Sprachausgabe laufen auf dem eigenen Rechner, nicht in
der Cloud.

> **Stand: in Entwicklung.** Was heute wirklich funktioniert und was noch
> fehlt, steht unten unter *Tatsaechlicher Stand*. Dort steht ausdruecklich
> auch, was noch **nicht getestet** ist -- und warum.

## Was JARVIS sein soll

Ein Assistent, kein Chatfenster. Er soll zuhoeren, mitdenken, Aufgaben in
Schritte zerlegen, sie ausfuehren, das Ergebnis pruefen und von sich aus
Bescheid geben -- und zugeben, wenn etwas nicht geht.

Zwei Grundregeln stecken deshalb im Code und nicht in einem Prompt:

1. **Keine erledigte Aufgabe ohne Pruefung.** `TaskManager.complete()` verlangt
   einen Pruefvermerk und lehnt einen leeren ab. Ein Sprachmodell kann
   formulieren, was es will -- den Status aendert es nur ueber diese Schnittstelle,
   und die laesst sich nicht ueberreden.
2. **Kein erfundenes Werkzeug.** Was nicht einsatzbereit ist, wird dem Modell
   gar nicht angeboten; ein unbekannter Aufruf ergibt einen Fehler mit Grund.

## Installation

Voraussetzung ist Python 3.11 oder neuer und Homebrew.

```bash
git clone <dieses-repo> jarvis && cd jarvis
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"            # Kern + Tests
pip install -e ".[speech,dashboard]"  # Audio und Dashboard (optional)
```

Die Audio-Extras brauchen PortAudio:

```bash
brew install portaudio
```

### Modelle

```bash
# Sprachmodell
brew install ollama && brew services start ollama
ollama pull qwen2.5:7b-instruct     # bei 8 GB RAM: qwen2.5:3b-instruct-q4_K_M

# Spracherkennung
brew install whisper-cpp
mkdir -p ~/.local/share/jarvis/models
curl -L -o ~/.local/share/jarvis/models/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin

# Sprachausgabe
pipx install piper-tts
mkdir -p ~/.local/share/jarvis/voices
# Deutsche Stimmen: https://huggingface.co/rhasspy/piper-voices/tree/main/de/de_DE
# .onnx UND .onnx.json ins Verzeichnis legen.
```

`jarvis doctor` sagt danach, was noch fehlt -- und was zur Hardware passt.

## Erste Schritte

```bash
jarvis config-init     # schreibt ~/.config/jarvis/config.toml
jarvis doctor          # prueft Hardware, Modelle, Audio, Rechte
jarvis run             # startet alles: Sprache + Dashboard
```

Das Dashboard liegt dann auf <http://127.0.0.1:8765>.

**Wichtig vor dem ersten Gespraech:** in der Konfiguration unter
`[permissions]` die `roots` pruefen. Ausserhalb dieser Verzeichnisse liest und
schreibt JARVIS nicht. Ohne Eintrag gibt es keinen Dateizugriff -- das ist
Absicht.

## Betrieb

| Zweck | Befehl |
| --- | --- |
| Starten | `jarvis run` |
| Nur Dashboard, kein Mikrofon | `jarvis run --ohne-sprache` |
| Nur Sprache, keine Oberflaeche | `jarvis run --ohne-dashboard` |
| Beenden | `Strg-C`, oder `kill $(cat ~/.local/state/jarvis/jarvis.pid)` |
| Neustart | beenden, dann `jarvis run` |
| Eine Frage ohne Sprache | `jarvis ask "Was ist offen?"` |
| Diagnose | `jarvis doctor` (`--json` zum Weitergeben) |
| Messung | `jarvis bench` |
| Konfiguration pruefen | `jarvis config-show` |
| Aufgaben | `jarvis tasks` (`--all` auch erledigte) |
| Gedaechtnis | `jarvis memory`, loeschen mit `--forget 7` |
| Tests | `pytest` |

Es laeuft immer nur ein JARVIS: eine Sperrdatei mit Prozesskennung verhindert,
dass zwei Instanzen auf dasselbe Mikrofon und dieselbe Datenbank gehen. Eine
Sperre von einem abgestuerzten Prozess wird beim naechsten Start uebernommen --
aufraeumen von Hand ist nicht noetig.

**Dateien im Betrieb**

| Was | Wo |
| --- | --- |
| Protokoll (rotierend) | `~/.local/state/jarvis/jarvis.log` |
| Gedaechtnis | `~/.local/state/jarvis/gedaechtnis.sqlite3` |
| Sperrdatei | `~/.local/state/jarvis/jarvis.pid` |
| Konfiguration | `~/.config/jarvis/config.toml` |

### Beim Anmelden starten

```bash
jarvis install-service          # schreibt die launchd-Datei
launchctl load -w ~/Library/LaunchAgents/com.jarvis.assistent.plist
launchctl unload ~/Library/LaunchAgents/com.jarvis.assistent.plist   # beenden
launchctl list | grep jarvis                                         # Zustand
```

Nach einem Absturz startet launchd neu, mit mindestens 20 Sekunden Abstand --
eine Neustartschleife bei einem dauerhaften Fehler waere schlimmer als ein
stiller Ausfall.

## Dashboard

Dunkle Kommandozentrale auf `127.0.0.1` -- bewusst nicht im Netz, denn sie
kann das Mikrofon aktivieren und Aufgaben einsehen.

Der Kern in der Mitte zeigt den echten Zustand: ruhiges Atmen im Leerlauf,
Ringe auf dem Mikrofonpegel beim Zuhoeren, umlaufender Bogen beim Verarbeiten,
Puls beim Sprechen, Warnring bei einer Stoerung. Daneben stehen offene
Aufgaben mit dem Grund jeder Blockade, die Meldungen (auch die bewusst
stummen, mit Begruendung), der Zustand aller Dienste und das Protokoll.

Das Dashboard rechnet nichts selbst -- es zeigt, was Aufgabenmanager, Agent und
Pipeline ohnehin fuehren. Es kann also nicht behaupten, etwas sei fertig, wenn
der Aufgabenmanager das nicht sagt. Ueber das Eingabefeld laesst sich auch
ohne Mikrofon mit JARVIS sprechen.

## Berechtigungen

Sieben getrennte Stufen, **nicht** hierarchisch -- wer lesen darf, darf
deshalb nicht loeschen:

`read` `create` `edit` `delete` `web` `external` `system` `app_control`

`delete`, `external` und `system` fragen bei **jeder einzelnen Aktion** nach,
solange sie nicht in `auto_confirm` stehen. `web` (Suche, Seiten abrufen) fragt
nicht: es holt etwas herein und veroeffentlicht nichts. Wer vor jedem
Nachschlagen gefragt wird, schaltet die Rueckfrage irgendwann ganz ab -- und
dann fehlt sie beim Loeschen auch. Gesetzt wird das nur in der
Konfigurationsdatei: JARVIS hat keine Moeglichkeit, sich selbst eine Stufe zu
erteilen -- die Richtlinie ist nach dem Start unveraenderlich.

Beliebige Shell-Befehle fuehrt JARVIS nicht aus. Skripte muessen mit
absolutem Pfad unter `allowed_scripts` stehen.

## Sicherheit des Dashboards

Das Dashboard laeuft auf `127.0.0.1` -- das allein schuetzt aber nicht. Eine
beliebige Webseite im Browser des Nutzers kann ein Formular an `127.0.0.1`
abschicken, und ein WebSocket unterliegt ueberhaupt nicht der
Gleiche-Herkunft-Regel. Deshalb:

* Aendernde Anfragen (POST, DELETE) werden abgewiesen, wenn der `Origin`-Kopf
  gesetzt ist und nicht zum Dashboard gehoert.
* Der WebSocket wird vor dem Annehmen geprueft. Ohne das koennte eine fremde
  Seite den Zustandsstrom mitlesen -- darin stehen die letzte Aeusserung, die
  letzte Antwort und alle offenen Aufgaben.
* `seite_lesen` ruft keine Adressen im eigenen Netz ab (Loopback, private
  Bereiche, Link-Local), auch nicht ueber eine Umleitung. Sonst koennte eine
  gelesene Seite JARVIS dazu bringen, das eigene `/api/memory` abzurufen.

## Datenschutz

Gedaechtnis und Protokoll liegen ausschliesslich lokal in
`~/.local/state/jarvis/`. Der Kern selbst stellt keine Netzverbindung her;
Ollama laeuft auf `127.0.0.1`. Sobald ein externer Dienst angebunden wird,
steht das in der Konfiguration und JARVIS sagt es vor der Uebertragung.

## Weiterlesen

* [`docs/betrieb.md`](docs/betrieb.md) -- Fehlersuche: Aktivierungswort,
  Spracherkennung, Stimme, Latenz, macOS-Freigaben, Protokoll, Gedaechtnis.
* [`docs/integrationen.md`](docs/integrationen.md) -- was angebunden ist, was
  fehlt, und was jede fehlende Anbindung konkret braucht (Websuche, Mailversand,
  WhatsApp Business, Kalender schreiben).

## Aufbau

```
jarvis/
  config.py          Konfiguration (TOML, Vorgaben, Tippfehlerpruefung)
  permissions.py     Berechtigungsstufen, Pfad- und Skriptgrenzen
  doctor.py          Diagnose: Hardware, Modelle, Audio, Rechte
  cli.py             Kommandozeile
  memory/
    db.py            SQLite-Schema, versionierte Migrationen
    store.py         Kurzzeit, Langzeit (mit Widerspruchserkennung), Wissen
  tasks/manager.py   Aufgaben mit erzwungenem Pruefvermerk
  notify/manager.py  Prioritaet, Ruhezeit, Entdopplung, Sperrzeit
  tools/registry.py  Werkzeuge mit Argumentpruefung
  agent.py           Werkzeugkreislauf, Rueckfragen, proaktive Meldungen
  runtime.py         Einzelinstanz, Start/Stopp, Gesundheitspruefung
  logging_setup.py   Protokoll mit Schwaerzung von Zugangsdaten
  secrets.py         Umgebungsvariable, dann macOS-Schluesselbund
  llm/
    client.py        Ollama: Streaming, Abbruch, Wiederholung
    conversation.py  Systemtext, Fakten, offene Aufgaben
  speech/
    vad.py           Zerlegung in Aeusserungen
    chunking.py      Abschnitte fuer die Sprachausgabe
    stt.py           whisper.cpp
    tts.py           Piper, `say`, Warteschlange, Unterbrechung
    wakeword.py      openwakeword
    audio.py         Mikrofon
    pipeline.py      der Zustandsautomat
  tools/
    files.py  mac.py  web.py  builtin.py
  dashboard/
    server.py        FastAPI, WebSocket
    web/             Oberflaeche und Kernanimation
```

## Tatsaechlicher Stand

### Gebaut und getestet (275 Tests)

- **Gedaechtnis.** SQLite mit versionierten Migrationen. Kurzzeit mit
  begrenztem Kontextfenster (der vollstaendige Verlauf bleibt erhalten),
  Langzeit mit Widerspruchserkennung -- ein abweichender Wert wird gemeldet
  statt ueberschrieben, der alte bleibt als ueberholt erhalten. Wissensspeicher
  mit Stichwortsuche ueber SQLite FTS5.
- **Aufgaben.** Zustaende geplant / laeuft / blockiert / wartet /
  fehlgeschlagen / erledigt / abgebrochen mit geprueften Uebergaengen,
  Teilschritten und Ereignisprotokoll. Blockieren und Fehlschlagen verlangen
  einen Grund. Erledigen verlangt einen Pruefvermerk. Nach einem Neustart
  werden `laeuft`-Aufgaben blockiert, weil nach einem Absturz nichts mehr laeuft.
- **Berechtigungen.** Sieben Stufen, unveraenderliche Richtlinie,
  Bestaetigung pro Aktion, Pfadgrenzen (auch gegen `..` und Symlinks),
  Programm- und Skriptfreigaben.
- **Werkzeuge.** Verzeichnis mit Argumentpruefung; fehlende Werkzeuge ergeben
  einen Fehler mit Grund, kein erfundenes Ergebnis. Ein abstuerzendes Werkzeug
  reisst JARVIS nicht mit.
- **Benachrichtigungen.** Prioritaetsschwelle, Ruhezeiten (auch ueber
  Mitternacht), Entdopplung mit Zeitfenster, Sperrzeit zwischen Ansagen,
  Unterbrechung verwirft veraltete Ansagen.
- **Diagnose und Konfiguration.** `doctor` prueft echte Systemzustaende und
  meldet Nichtgeprueftes als `unbekannt`, nicht als in Ordnung.
- **Modellanbindung.** Ollama mit Streaming, Abbruch mitten im Strom,
  Wiederholung und eigenen Ausnahmen je Fehlerfall -- getestet gegen einen
  echten kleinen HTTP-Dienst, der Ollama nachspielt.
- **Agent.** Werkzeugkreislauf mit Rundenbegrenzung, Rueckfrage bei
  kritischen Aktionen (eine unklare Antwort fuehrt *nicht* aus), proaktive
  Meldungen aus dem Vergleich gespeicherter Aufgabenstatus.
- **Werkzeuge.** 32 angemeldet: Dateien, macOS (AppleScript), Netz,
  Gedaechtnis und Aufgaben. Angeboten wird nur, was erlaubt und einsatzbereit ist.
- **Sprachbausteine.** Aeusserungszerlegung und Abschnittsbildung als reine
  Logik, deshalb ohne Mikrofon vollstaendig getestet. whisper.cpp, Piper,
  `say`, openwakeword und sounddevice sind angebunden, jeweils mit
  begruendetem Rueckfall statt Absturz.
- **Sprachpipeline.** Zustandsautomat mit Gespraechsfortsetzung ohne erneutes
  Aktivierungswort, Rueckfall auf untaetig nach Stille, Abbruch beim
  Dazwischenreden -- mit Ersatzteilen (Listen-Audio, vorgegebene Transkripte,
  stumme Ausgabe) getestet.
- **Laufzeit.** Einzelinstanz mit Uebernahme verwaister Sperren, geordnetes
  Herunterfahren auf SIGTERM/SIGINT, Gesundheitspruefung im Hintergrund,
  Wiederaufnahme offener Aufgaben.
- **Dashboard.** FastAPI mit WebSocket, dunkle Oberflaeche, Kern als
  Zustandsanzeige -- gegen einen echten Testclient geprueft.

### Noch nicht gebaut

Externe Dienste ueber die vorhandenen hinaus: E-Mail-Versand (es gibt nur
den Entwurf), WhatsApp Business, Kalenderschreiben, Dokumentenverwaltung.
Die Werkzeugschnittstelle ist dafuer da; die Anbindungen fehlen.

### Nicht getestet -- und warum

Entwickelt wurde dieser Stand in einem **Linux-Container ohne Audiohardware**,
nicht auf einem Mac. Deshalb ist Folgendes ausdruecklich **ungetestet**:

- **Audio.** Mikrofonaufnahme, Aktivierungswort in der Praxis,
  Sprachqualitaet, Antwortlatenz, Verhalten bei Geraetewechsel.
- **Modelle.** `whisper.cpp`, Piper und `say` im echten Zusammenspiel;
  Ollama-Durchsatz und Speicherbedarf auf Apple Silicon.
- **AppleScript.** Notizen, Erinnerungen, Kalender, Mail-Entwurf, Finder,
  Programmsteuerung. Die Skripte sind geschrieben, aber nie ausgefuehrt --
  macOS wird ausserdem beim ersten Mal nach der Automationsfreigabe fragen.
- **macOS-Pfade in `doctor.py`** (`sysctl`, `say -v ?`, `pmset`).
- **launchd.** Die plist wird erzeugt, war aber nie geladen.
- **Websuche.** Ohne hinterlegten Schluessel nicht ausgefuehrt; die
  Aufbereitung ist getestet, der echte Abruf nicht.

Der plattformunabhaengige Teil ist getestet; die macOS-Schicht muss auf dem
Zielrechner geprueft werden. `jarvis doctor --json` liefert dafuer die
Ausgangslage. Was dort fehlschlaegt, gehoert gemeldet -- nicht umgangen.

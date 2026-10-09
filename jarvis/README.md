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
jarvis doctor --json   # dieselbe Ausgabe zum Weitergeben
jarvis config-show     # zeigt, was tatsaechlich gilt
jarvis tasks           # offene Aufgaben
jarvis tasks --all     # auch abgeschlossene
jarvis memory          # gespeicherte Fakten
jarvis memory --forget 7   # Fakt 7 endgueltig loeschen
```

**Wichtig vor dem ersten Gespraech:** in der Konfiguration unter
`[permissions]` die `roots` pruefen. Ausserhalb dieser Verzeichnisse liest und
schreibt JARVIS nicht. Ohne Eintrag gibt es keinen Dateizugriff -- das ist
Absicht.

## Betrieb

| Zweck | Befehl |
| --- | --- |
| Diagnose | `jarvis doctor` |
| Konfiguration pruefen | `jarvis config-show` |
| Tests | `pytest` |
| Protokoll | `~/.local/state/jarvis/jarvis.log` |
| Gedaechtnis | `~/.local/state/jarvis/gedaechtnis.sqlite3` |

Start, Beenden und Neustart des Sprachbetriebs sowie die Einrichtung als
Hintergrunddienst (launchd) kommen mit der Sprachpipeline; sie sind noch
nicht gebaut und hier deshalb bewusst nicht dokumentiert.

## Berechtigungen

Sieben getrennte Stufen, **nicht** hierarchisch -- wer lesen darf, darf
deshalb nicht loeschen:

`read` `create` `edit` `delete` `external` `system` `app_control`

`delete`, `external` und `system` fragen bei **jeder einzelnen Aktion** nach,
solange sie nicht in `auto_confirm` stehen. Gesetzt wird das nur in der
Konfigurationsdatei: JARVIS hat keine Moeglichkeit, sich selbst eine Stufe zu
erteilen -- die Richtlinie ist nach dem Start unveraenderlich.

Beliebige Shell-Befehle fuehrt JARVIS nicht aus. Skripte muessen mit
absolutem Pfad unter `allowed_scripts` stehen.

## Datenschutz

Gedaechtnis und Protokoll liegen ausschliesslich lokal in
`~/.local/state/jarvis/`. Der Kern selbst stellt keine Netzverbindung her;
Ollama laeuft auf `127.0.0.1`. Sobald ein externer Dienst angebunden wird,
steht das in der Konfiguration und JARVIS sagt es vor der Uebertragung.

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
  speech/            Audio, Aktivierungswort, Whisper, TTS  (noch leer)
  llm/               Modellanbindung, Gespraechsverwaltung   (noch leer)
  dashboard/         Oberflaeche                              (noch leer)
```

## Tatsaechlicher Stand

### Gebaut und getestet (75 Tests)

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

### Noch nicht gebaut

Sprachpipeline (Mikrofon, Aktivierungswort, Whisper, TTS, Unterbrechung),
Modellanbindung, Werkzeuge fuer macOS, Dashboard, Startmechanismus,
externe Dienste.

### Nicht getestet -- und warum

Entwickelt wurde dieser Stand in einem **Linux-Container ohne Audiohardware**,
nicht auf einem Mac. Deshalb ist Folgendes ausdruecklich **ungetestet**:

- Mikrofonaufnahme, Aktivierungswort, Sprachqualitaet, Antwortlatenz
- `whisper.cpp`, Piper und `say` im Zusammenspiel
- Ollama-Durchsatz und Speicherbedarf auf Apple Silicon
- die macOS-Pfade in `doctor.py` (`sysctl`, `say -v ?`)

Der plattformunabhaengige Kern ist getestet; die macOS-Schicht muss auf dem
Zielrechner geprueft werden. `jarvis doctor --json` liefert dafuer die
Ausgangslage.

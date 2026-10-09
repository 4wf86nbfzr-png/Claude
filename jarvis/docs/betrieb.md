# Betrieb und Fehlersuche

Was tun, wenn etwas nicht laeuft. Die Reihenfolge ist Absicht: oben steht,
was am haeufigsten vorkommt.

## Zuerst: `jarvis doctor`

```bash
jarvis doctor
```

Prueft Prozessor, Arbeitsspeicher, Plattenplatz, Ollama und Modell,
whisper.cpp, Piper, macOS-Stimmen, Audiogeraete, Aktivierungswort,
Gedaechtnis und Berechtigungen. Jeder Mangel nennt den naechsten Schritt.

Was nicht geprueft werden konnte, erscheint als `[?] unbekannt` -- **nicht**
als in Ordnung. Ein `[?]` ist ein Hinweis, kein Freibrief.

`jarvis doctor --json` gibt dieselbe Auskunft zum Weitergeben.

## Haeufige Faelle

### „JARVIS laeuft bereits (Prozess 1234)"

Es laeuft schon einer. Entweder nutzen oder beenden:

```bash
kill 1234
```

Stuerzt JARVIS ab, bleibt die Sperrdatei liegen -- das ist kein Problem: beim
naechsten Start wird geprueft, ob der Prozess noch lebt, und eine verwaiste
Sperre uebernommen.

### Das Aktivierungswort wird nicht erkannt

1. `jarvis doctor` -- ist `openwakeword` installiert?
2. Im Protokoll nachsehen: `grep Aktivierungswort ~/.local/state/jarvis/jarvis.log`
3. Schwelle senken: `[wake] threshold = 0.45`. Niedriger heisst mehr
   Fehlausloesungen, hoeher heisst oefter nicht erkannt.
4. Zur Not ohne Aktivierungswort: `[wake] engine = "push_to_talk"` und das
   Gespraech ueber den Knopf „Zuhören" im Dashboard starten.

### JARVIS antwortet auf Gespraeche, die ihm nicht gelten

Das Gespraech bleibt nach dem Aktivierungswort offen -- so lange, wie
`[wake] conversation_timeout` sagt (Vorgabe 25 s). In einem Raum mit vielen
Gespraechen diesen Wert senken:

```toml
[wake]
conversation_timeout = 10.0
threshold = 0.7
```

### Er versteht schlecht

* Die Erkennungsschwelle `[audio] vad_threshold` zu hoch: Satzanfaenge fallen
  weg. Zu niedrig: Luefter und Tastatur loesen aus. Vorgabe 0.015.
* `[stt] silence_timeout` zu kurz schneidet Saetze mit Nebensatz ab.
  Vorgabe 0.8 s; bei langsamem Sprechen auf 1.2 erhoehen.
* Ein groesseres Whisper-Modell hilft bei Fachbegriffen, kostet aber
  Reaktionszeit. `ggml-large-v3-turbo-q5_0` ist ein guter Kompromiss.

### Die Stimme klingt nach Vorleseprogramm

Dann laeuft der Rueckfall `say`, nicht Piper. `jarvis doctor` sagt, warum:
meist fehlt die `.onnx.json` neben der `.onnx`-Stimmdatei (Piper braucht
beide) oder ein Wiedergabeprogramm (`brew install ffmpeg`).

### Er redet weiter, obwohl ich spreche

Das soll nicht passieren -- das Dazwischenreden bricht die Ausgabe ab. Wenn
doch:

* `[audio] vad_threshold` ist zu hoch, die eigene Stimme loest die Erkennung
  nicht aus. Senken.
* Lautsprecher statt Kopfhoerer: JARVIS hoert sich selbst und haelt das fuer
  Sprache. Kopfhoerer benutzen oder die Schwelle anheben.

### „Das Sprachmodell antwortet nicht"

```bash
ollama serve          # laeuft der Dienst?
ollama list           # ist das Modell geladen?
ollama pull qwen2.5:7b-instruct
```

JARVIS prueft alle 30 Sekunden nach und meldet sich, wenn das Modell
zurueckkommt.

### Antworten kommen zu langsam

* Kleineres Modell: `qwen2.5:3b-instruct-q4_K_M` statt 7b.
* `[llm] context_tokens` senken (4096 reicht fuer Gespraeche).
* `[llm] history_turns` senken -- weniger Verlauf, kuerzere Anfragen.
* Whisper auf `small` oder `base` setzen.

Was die Reaktionszeit **nicht** verbessert: ein groesseres Modell mit
weniger Kontext. Die Zeit bis zum ersten Wort entscheidet, und die haengt am
Modell selbst.

### macOS verweigert die Steuerung (Fehler -1743)

**Systemeinstellungen > Datenschutz & Sicherheit > Automation** -- dort muss
das Terminal (oder die App, die JARVIS startet) die jeweilige App steuern
duerfen. Beim ersten Versuch fragt macOS einmal; wird abgelehnt, erscheint der
Dialog nicht wieder und muss dort von Hand gesetzt werden.

Fuer das Mikrofon dasselbe unter **Datenschutz & Sicherheit > Mikrofon**.

### „Dafuer fehlt mir die Berechtigung"

So gewollt. Die Stufen stehen in `~/.config/jarvis/config.toml` unter
`[permissions] granted`. Sie sind **nicht** hierarchisch: `read` schliesst
`delete` nicht ein.

JARVIS kann sich keine Stufe selbst erteilen -- das geht nur in dieser Datei,
und erst der Neustart uebernimmt die Aenderung.

### Er fragt bei jeder Kleinigkeit nach

`delete`, `external` und `system` fragen bei jeder einzelnen Aktion. Wer das
fuer eine Stufe nicht will:

```toml
[permissions]
auto_confirm = ["delete"]
```

Gut ueberlegen. Die Rueckfrage ist das Letzte, was zwischen einem
missverstandenen Satz und einer geloeschten Datei steht.

## Protokoll lesen

```bash
tail -f ~/.local/state/jarvis/jarvis.log
grep -E "ERROR|WARNING" ~/.local/state/jarvis/jarvis.log | tail -30
```

Die Datei rotiert bei 2 MB (drei Sicherungen). Zugangsdaten werden vor dem
Schreiben geschwaerzt -- die Datei laesst sich also weitergeben. Trotzdem
vorher hineinsehen: Dateinamen und Gespraechsinhalte stehen darin.

Mehr Einzelheiten: `log_level = "DEBUG"` in der Konfiguration.

## Gedaechtnis ansehen und aufraeumen

```bash
jarvis memory              # was gespeichert ist
jarvis memory --forget 7   # Fakt 7 endgueltig loeschen
jarvis tasks --all         # alle Aufgaben
```

Direkt in der Datenbank:

```bash
sqlite3 ~/.local/state/jarvis/gedaechtnis.sqlite3 \
  "SELECT id, title, status, verification FROM tasks ORDER BY id DESC LIMIT 20;"
```

Ganz von vorn anfangen: Datei wegsichern und loeschen, sie wird beim naechsten
Start neu angelegt.

```bash
mv ~/.local/state/jarvis/gedaechtnis.sqlite3{,.alt}
```

## Nach einem Absturz

Aufgaben, die beim Absturz auf `laeuft` standen, werden beim naechsten Start
auf `blockiert` gesetzt mit dem Grund „Durch Neustart unterbrochen". Das ist
Absicht: nach einem Absturz laeuft nichts mehr, und der Status soll nichts
anderes behaupten. `jarvis tasks` zeigt sie; wieder aufgenommen werden sie
durch eine Ansage im Gespraech.

## Alles anhalten

```bash
kill $(cat ~/.local/state/jarvis/jarvis.pid)      # geordnet
launchctl unload ~/Library/LaunchAgents/com.jarvis.assistent.plist
```

Beim geordneten Beenden werden Sprachpipeline, Mikrofon und Datenbank
geschlossen und die Sperrdatei entfernt.

# JARVIS — das Dashboard zum Sprechen

Zweimal schnipsen, das HUD fährt hoch, eine Stimme sagt „Moin, Master" und
sagt dir, was gerade zählt. Danach redest du ganz normal mit ihm.

Es hängt am selben Jarvis wie Telegram: **ein** Gedächtnis, **eine**
Aufgabenliste, dieselben Werkzeuge. Was du hier sagst, weiß der Bot.

> Für macOS geschrieben. **Chrome ist Pflicht** — nur er hat die
> Spracherkennung eingebaut.

---

## In fünf Minuten

```bash
cd ~/jarvis
git pull
./start.sh orb
```

Chrome öffnet das HUD. Beim ersten Mal fragt er nach dem **Mikrofon** →
*Zulassen*. Dann:

| Das willst du | So geht es |
|---|---|
| Ihn wecken | **zweimal schnipsen** (oder klatschen) |
| Kurz etwas fragen | Ring anklicken, sprechen — oder **Leertaste** |
| Durchgehend reden | **Dauerbetrieb** einschalten |
| Ihn unterbrechen | einfach reinreden, oder **Esc** |
| Tippen statt reden | unten ins Feld |

## Was er beim Wecken sagt

Keine Standardansage, sondern: Gruß, dann das Wenige, das jetzt zählt —
aktuelle Schlagzeilen (tagesschau, Deutschlandfunk, heise, Golem, NDR
Hamburg), dringende Nachrichten, der nächste Termin, offene Aufgaben —
dann eine Frage, womit ihr anfangt.

Kommt er an keine Quelle heran, **sagt er das**. Er erfindet keine Meldung.
Nachhaken geht jederzeit: „Erklär mir die erste Meldung genauer."

---

## Die Stimme einrichten

Ein Befehl macht alles: Schlüssel eintragen, Stimmen auflisten, aussuchen,
Probe vorspielen.

```bash
./start.sh stimme
```

Er fragt nach dem **ElevenLabs-Schlüssel** (Konto auf <https://elevenlabs.io>,
oben rechts aufs Profil → *API Keys* → erzeugen), trägt ihn in die `.env` ein,
zeigt deine Stimmen nummeriert an und spielt nach der Wahl „Moin, Master. Ich
bin bereit." ab. Danach `./start.sh orb` neu starten.

Nur ansehen, was es gibt: `./start.sh stimme --zeigen`.

Ändern geht auch später im Dashboard unter **Stimme** — die Auswahl liegt in
der Datenbank, nicht in der `.env`.

Ohne Schlüssel spricht die Mac-Stimme. Das läuft, klingt aber nach Navi.

## Das API-Token

Ohne Token nimmt die Schnittstelle nur Zugriffe vom eigenen Rechner an — das
reicht, solange nur du am Mac sitzt. Sauberer ist ein Token:

```bash
./start.sh token
```

Es wird erzeugt, in die `.env` geschrieben und beim Start an den Browser
durchgereicht. Abtippen musst du nichts.

**Was menschlich klingen lässt:**

| Regler | Wirkung |
|---|---|
| **Stabilität** niedrig (0,3–0,4) | Betonung und Tempo schwanken wie beim Sprechen. Zu niedrig wird unruhig. |
| **Ausdruck** 0,3–0,5 | mehr Farbe in der Stimme. Zu hoch wird theatralisch. |
| **Tempo** 0,95–1,05 | ruhiger oder flotter |

Für eine Jarvis-Anmutung: eine ruhige, tiefe männliche Stimme mit leicht
britischem Einschlag, Stabilität ~0,35, Ausdruck ~0,35.

Zwei Dinge macht Jarvis zusätzlich von sich aus, damit es nicht vorgelesen
klingt:

* **Er schreibt aus, was man spricht.** „13:13 Uhr" wird zu „dreizehn Uhr
  dreizehn", „am 5.11." zu „am fünften November", „ca. 2 Std." zu „ungefähr
  zwei Stunden". Sternchen, Links und Aufzählungszeichen fliegen raus.
* **Er spricht satzweise.** Das erste Stück wird sofort erzeugt und
  abgespielt, der Rest läuft nach — du wartest nicht auf einen langen Absatz.

Modell `eleven_multilingual_v2` klingt am besten, `eleven_turbo_v2_5`
antwortet schneller. Umstellbar über `ELEVENLABS_MODEL`.

---

## Wenn er langsam ist

Das Denken kostet die Zeit, nicht die Oberfläche. Oben im HUD steht, welches
Modell gerade arbeitet.

* **`llama3.2:3b` auf einem Intel-Mac** rechnet auf der CPU. Zehn bis dreißig
  Sekunden pro Antwort sind da normal. Jarvis hält das Modell jetzt geladen
  (`OLLAMA_KEEP_ALIVE=30m`) und zeigt kleinen Modellen nur die zwölf
  Werkzeuge, die zum Satz passen — das spart spürbar.
* **Deutlich schneller und besser** wird es mit einem Cloud-Modell. In die
  `.env`:

  ```
  AI_PROVIDER=anthropic
  ANTHROPIC_API_KEY=sk-ant-...
  AI_MODEL=claude-haiku-5-5
  ```

  Antwortzeit dann ein bis drei Sekunden statt zwanzig. Kostet nach
  Verbrauch; für ein Gespräch am Tag sind das Cent-Beträge.
* **Dazwischen:** `AI_PROVIDER=ollama` behalten, aber ein größeres Modell
  (`ollama pull llama3.1:8b`) — besser in der Qualität, auf einem Intel-Mac
  aber langsamer, nicht schneller.

## Das Schnipsen

Die Erkennung läuft **im Browser**, es geht kein Audio nach draußen. Geprüft
wird nicht nur die Lautstärke — sonst würde jede zugeschlagene Tür auslösen.
Ein Schnipser ist ein *kurzer, heller* Impuls:

1. Vorher war es leise.
2. Die Spitze liegt über der Schwelle.
3. Viel Energie über 2 kHz (Sprache liegt tiefer).
4. Im nächsten Messfenster ist er schon wieder weg.

Zwei bestätigte Impulse im Abstand von 120 bis 900 ms aktivieren ihn, danach
vier Sekunden Ruhe gegen Doppelauslösung.

**Einstellen:** Knopf **Stimme** → *Empfindlichkeit fürs Schnipsen*. Bei
offenem Dialog steht dort live, was erkannt wurde („ein Impuls – jetzt der
zweite", „verworfen (zu dumpf)"). Damit findest du deinen Wert in einer
halben Minute. Standard ist 0,22; leiser Raum → niedriger, laute Umgebung →
höher.

Löst er zu oft aus, Knopf **Schnipsen** ausschalten oder
`ORB_KLATSCHEN=false` setzen.

Soll das Schnipsen auch Spotify, VS Code und Co. starten:
`ORB_START_BEI_SCHNIPSEN=true` und `ORB_PROGRAMME` füllen.

---

## Was das HUD zeigt

* **Mitte**: Ring und Wellenform bewegen sich nach dem echten Pegel — deinem
  beim Sprechen, seinem beim Antworten. Darunter der Zustand: Bereitschaft,
  Aktivierung, Zuhören, Verarbeiten, Recherchieren, Aufgabe läuft, Sprechen,
  Fehler.
* **Links**: aktuelle Lage aus den Nachrichtenquellen, darunter das Protokoll
  der letzten Aktionen.
* **Rechts**: offene Aufgaben, eingegangene Nachrichten, Termine.
* **Oben**: Uhrzeit, Datum, welches Modell gerade denkt, ob ElevenLabs oder
  die Systemstimme spricht.

---

## Bildschirm ansehen (optional)

„Was siehst du auf meinem Bildschirm?" braucht ein Modell, das Bilder lesen
kann — lokale Modelle können das nicht.

1. `ANTHROPIC_API_KEY=sk-ant-...` in die `.env`.
2. Beim ersten Versuch: **Systemeinstellungen → Datenschutz & Sicherheit →
   Bildschirmaufnahme → Terminal** anhaken, Terminal neu starten.

Das Bild geht einmal hin, wird beschrieben und sofort verworfen.

---

## Wenn etwas klemmt

| Was du siehst | Was los ist |
|---|---|
| „Dieser Browser kann keine Spracheingabe" | Safari oder Firefox. **Nimm Chrome** — Safari zeigt das HUD zwar, hört aber unzuverlässig zu. |
| „Mikrofon nicht erlaubt" | Schloss links in der Adressleiste → Mikrofon → Zulassen. |
| „Kein Mikrofon gefunden" | Falsches Eingabegerät in den Systemeinstellungen → Ton. |
| Ring reagiert, aber nichts zu hören | Lautstärke; oder einmal irgendwo auf die Seite klicken (Chrome blockt Ton vor der ersten Interaktion). |
| „Token fehlt oder stimmt nicht" | `HTTP_API_TOKEN` aus der `.env` in das Feld unter **Stimme**. Über `./start.sh orb` passiert das von selbst. |
| Schnipsen löst nicht aus | Empfindlichkeit senken, trocken und laut schnipsen, Abstand ca. eine Viertelsekunde. |
| Schnipsen löst zu oft aus | Empfindlichkeit hoch, oder Knopf **Schnipsen** aus. |
| Lage sagt „offline" | Keine Verbindung zu den Nachrichtenquellen. Er erfindet dann nichts. |
| Spricht mit Navi-Stimme | Kein `ELEVENLABS_API_KEY`, oder keine Stimme gewählt. Oben rechts steht, welche gerade spricht. |

Zustand aller Teile: `./start.sh doctor` — die Zeile **Orb** sagt, ob die
Stimme steht.

---

## Was wo läuft

```
Chrome                        dein Mac                        draußen
Schnipserkennung  ─────────>  Jarvis-Kern        ─────────>   Modell
Sprache → Text                 Gedächtnis                     (Ollama lokal
HUD-Anzeige                    Aufgaben                        oder Claude)
Audio-Ausgabe     <─────────   Werkzeuge          ─────────>   ElevenLabs
                               ├ Programme                     (Stimme)
                               ├ Browser          ─────────>   tagesschau,
                               ├ Bildschirm                     heise, NDR
                               └ Kalender/Mail                  (Nachrichten)
```

Die Spracherkennung läuft über Chrome (Google), das Denken im Modell deiner
Wahl, die Stimme bei ElevenLabs. Kein Server von mir ist dazwischen.

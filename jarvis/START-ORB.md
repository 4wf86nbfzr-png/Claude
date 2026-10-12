# Jarvis zum Sprechen — in 10 Minuten

Das ist die Oberfläche aus dem Video: ein Orb im Browser, du sprichst, er
antwortet mit Stimme, startet Programme und sieht auf deinen Bildschirm.
Sie hängt am selben Jarvis wie Telegram — **ein** Gedächtnis, **eine**
Aufgabenliste. Was du hier sagst, weiß er dort auch.

> Für den Mac geschrieben (deiner: macOS 15.7, Intel). Chrome ist Pflicht —
> nur Chrome hat die Spracherkennung eingebaut.

---

## Schritt 1 — Stand holen

```bash
cd ~/jarvis            # oder wo der Ordner liegt
git pull
```

## Schritt 2 — Einstellungen ergänzen

```bash
open -e .env
```

Diese Zeilen hinzufügen (oder anpassen, falls schon da):

```
ORB_ENABLED=true
ORB_ANREDE=Noah
ORB_WECKWORT=jarvis aktivieren
ORB_STADT=Hamburg

# Was beim Doppelklatschen hochfahren soll — genau die App-Namen aus /Programme
ORB_PROGRAMME=Spotify,Visual Studio Code,Obsidian
ORB_WEBSEITE=https://hermserviceteam.com
ORB_AKTIONEN=true
```

Speichern (`Cmd+S`), Fenster zu.

## Schritt 3 — Starten

```bash
./start.sh orb
```

Chrome geht auf, der Orb steht da. Beim ersten Mal fragt Chrome nach dem
**Mikrofon** → *Zulassen*.

## Schritt 4 — Reden

- **Orb anklicken**, sprechen, loslassen. Er antwortet mit Stimme.
- Sag **„Jarvis aktivieren"** → Begrüßung mit Uhrzeit, Wetter und deinen Aufgaben.
- **Freihand an** → er hört durchgehend zu, ohne Klicken.
- **Klatschen an** → zweimal klatschen fährt dein Setup hoch.
- Oder unten **tippen** — geht immer, auch ohne Mikrofon.

Alles, was in Telegram geht, geht hier auch: „Erinnere mich morgen um acht
an die Wochenplanung", „Was steht heute an?", „Hat mir jemand geschrieben?",
„Merk dir, dass ich lieber vormittags telefoniere".

---

## Die Stimme (optional, kostet)

Ohne Schlüssel spricht Jarvis mit der eingebauten Mac-Stimme. Das funktioniert,
klingt aber nach Navi. Für die richtige Stimme:

1. Konto bei <https://elevenlabs.io> anlegen.
2. Links **Voices** → eine Stimme wählen → **Use** → die **Voice ID** kopieren
   (lange Zeichenfolge).
3. Oben rechts auf dein Profil → **API Keys** → Schlüssel erzeugen.
4. In die `.env`:

```
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
```

5. `./start.sh orb` neu starten.

Jeder Satz wird nur einmal bezahlt — gleiche Sätze kommen aus dem
Zwischenspeicher (`data/audio/`).

## Bildschirm ansehen (optional)

„Was siehst du auf meinem Bildschirm?" braucht ein Modell, das Bilder lesen
kann. Lokale Modelle können das nicht. Also:

1. Schlüssel von <https://console.anthropic.com> holen.
2. `ANTHROPIC_API_KEY=sk-ant-...` in die `.env`.
3. Beim ersten Versuch fragt macOS nach der Erlaubnis:
   **Systemeinstellungen → Datenschutz & Sicherheit → Bildschirmaufnahme →
   Terminal** anhaken, danach **Terminal neu starten**.

Das Bild geht einmal an Anthropic, wird beschrieben und sofort verworfen.
Es landet nicht im Gedächtnis und nicht auf der Platte.

---

## Wenn etwas klemmt

| Was du siehst | Was los ist |
|---|---|
| „Dieser Browser kann keine Spracheingabe" | Safari oder Firefox. Nimm Chrome. |
| „Mikrofon nicht erlaubt" | In Chrome aufs Schloss links in der Adressleiste → Mikrofon → Zulassen. |
| Orb reagiert, sagt aber nichts | Lautstärke; oder Chrome blockt Autoplay — einmal irgendwo auf die Seite klicken. |
| „Token fehlt oder stimmt nicht" | `HTTP_API_TOKEN` aus der `.env` oben rechts ins Feld. Beim Start über `./start.sh orb` passiert das von selbst. |
| Klatschen löst nichts aus | Lauter und trockener klatschen, nicht zu schnell hintereinander (ein Viertel- bis halbe Sekunde Abstand). Musik aus. |
| Klatschen löst zu oft aus | `ORB_KLATSCHEN=false` und den Knopf „Klatschen" nur bei Bedarf einschalten. |
| „X steht nicht auf der Liste" | Jarvis startet nur, was in `ORB_PROGRAMME` steht. Das ist Absicht — sonst könnte ein fremder Text eine App starten. |
| Keine Wetterzeile | Kein Netz oder der Dienst ist gerade weg. Der Rest der Begrüßung kommt trotzdem. |

Zustand aller Teile: `./start.sh doctor` — die Zeile **Orb** sagt, ob die
Stimme steht.

---

## Was wo läuft

```
Chrome                     dein Mac                      draußen
┌───────────────┐          ┌──────────────────┐          ┌──────────────┐
│ Sprache→Text  │ ───────> │ Jarvis           │ ───────> │ Modell       │
│ (Web Speech)  │          │  Systemprompt    │ <─────── │ (Ollama lokal│
│ Orb-Anzeige   │          │  Gedächtnis      │          │  oder Claude)│
│ Audio raus    │ <─────── │  Aufgaben        │ ───────> │ ElevenLabs   │
│ Klatschen     │ ───────> │  Aktionen        │          └──────────────┘
└───────────────┘          │   ├ Programme    │
                           │   ├ Browser      │
                           │   └ Bildschirm   │
                           └──────────────────┘
```

Die Spracherkennung läuft in Chrome (Google), die Antwort im Modell deiner
Wahl, die Stimme bei ElevenLabs — oder lokal, wenn du Ollama nutzt und auf
ElevenLabs verzichtest. Nichts davon läuft über einen Server von mir.

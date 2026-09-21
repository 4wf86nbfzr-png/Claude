# Sprecher-Briefing für den Imagefilm

Für eine Sprecherin oder einen Sprecher, oder für ein Tonstudio. Der Film
ist 45 Sekunden lang und hat neun Sätze. Die Musik liegt fertig darunter;
gebraucht wird nur die Stimme.

**Warum überhaupt eine Aufnahme:** Die Ansage im Film ist heute
synthetisch, aus einem lokalen Sprachmodell. Sie ist ruhig und verständlich,
aber man hört die Maschine — nicht an der Tonhöhe (die ist nachgemessen so
beweglich wie normale Sprache), sondern daran, dass sie nicht weiß, welches
Wort im Satz das wichtige ist. Genau das kann kein Regler nachliefern, und
genau dafür gibt es dieses Blatt.

---

## Die neun Sätze mit ihren Zeiten

Jeder Satz hat ein Fenster. Er muss **hineinpassen**, nicht es ausfüllen:
lieber 3,4 Sekunden ruhig als 4,2 gehetzt.

| | ab | Fenster | Text |
|---|---|---|---|
| 01 | 1,0 s | 3,6 s | Moin. Wir sind das HERM Service Team aus Hamburg. |
| 02 | 5,4 s | 4,2 s | Seit über 20 Jahren stellen wir Personal für Events. |
| 03 | 10,4 s | 4,2 s | Gastronomie: Servicekräfte, Barkeeper, Küchenhilfe. |
| 04 | 15,4 s | 4,2 s | Sicherheit: Einlass, Crowdmanagement, Personenschutz. |
| 05 | 20,4 s | 4,2 s | Promotion und Hostessen, der erste Eindruck zählt. |
| 06 | 25,4 s | 4,2 s | Logistik: Auf- und Abbau, Transport, Messelogistik. |
| 07 | 30,4 s | 4,2 s | Fahrservice: sicher, diskret, pünktlich. Deutschlandweit. |
| 08 | 35,4 s | 4,2 s | Reinigung: wenn wir da waren, ist es sauber. |
| 09 | 40,4 s | 4,4 s | Ein Team für Ihr Event. Sprechen Sie uns an. |

Die Zeiten stehen in `assets/video/imagefilm-de.vtt` und sind zugleich die
Untertitel. Ändert sich der Text, ändert sich beides zusammen.

## Tonfall

- **Hamburgisch nüchtern, nicht Werbefunk.** „Moin" ist echt gemeint und
  einsilbig, nicht „Mo-in". Kein Lächeln in der Stimme auf Kommando, keine
  hochgezogene Schlusssilbe.
- **Der Betrieb stellt Leute, die früh da sind und funktionieren.** So soll
  es klingen: verlässlich, unaufgeregt, ohne Druck.
- **Die Aufzählungen sind keine Listen, sondern drei Bilder.** In Satz 03
  bis 07 steht vor dem Doppelpunkt der Bereich, dahinter, was er umfasst.
  Nach dem Doppelpunkt eine echte kleine Pause, dann die drei Begriffe
  gleichwertig — nicht mit steigender Melodie wie beim Aufzählen.
- **Satz 09 ist die Einladung.** Er darf etwas wärmer stehen als die
  übrigen, aber ohne Ausrufezeichen.

## Aussprache

Diese Wörter werden regelmäßig falsch gelesen. So sind sie gemeint:

| steht da | gesprochen |
|---|---|
| Moin | einsilbig, „Meun" |
| Service, Servicekräfte, Fahrservice | englisch „Söhrwis", nicht „Ser-wiss" |
| Barkeeper | „Bar-Kieper" |
| Crowdmanagement | „Kraud-Mänitschment" |
| Promotion | **englisch** „Promohschn" — nicht wie der Doktortitel |
| Logistik, Messelogistik | „Logistick", kurzes i am Ende |
| diskret | langes e, „diskreet" |
| Deutschlandweit | mit hartem t: „Deutschlantweit" |
| HERM | wie geschrieben, ein Wort, nicht buchstabiert |

## Aufnahme

| | |
|---|---|
| Format | WAV, 48 kHz, 24 bit, Mono |
| Pegel | ungefähr −18 dBFS im Mittel, Spitzen unter −6 dBFS |
| Raum | trocken, kein Hall, keine Raumresonanz |
| Bearbeitung | **keine.** Kein Kompressor, kein EQ, kein Noisegate |

Die Mischung macht das Projekt: Pegel, Absenkung der Musik unter der Stimme
und die Endlautheit (−16 LUFS) stehen in `tools/film-vertonen.py`. Eine
schon komprimierte Aufnahme lässt sich dort nicht mehr sauber einbetten.

**Eine Datei je Satz**, nicht eine lange. Sonst verschiebt sich alles,
sobald ein Satz einen Wimpernschlag länger gerät. Vor und nach dem Satz
ruhig eine halbe Sekunde Stille mitlaufen lassen.

## Ablage

```
assets/audio/ansage/01.wav
assets/audio/ansage/02.wav
…
assets/audio/ansage/09.wav
```

Danach einmal:

```bash
python3 tools/film-vertonen.py
```

Das Skript nimmt **jede Zeile, für die eine Datei da liegt**, und greift nur
für die übrigen auf das Sprachmodell zurück. Wer erst drei Sätze
aufgenommen hat, kann also zwischendurch hören, wie es wirkt. Liegen alle
neun, wird gar kein Sprachmodell mehr gebraucht.

Erlaubt sind auch `.flac`, `.aiff`, `.m4a`, `.mp3` — WAV ist der saubere
Weg.

## Rechtliches

Nutzungsrechte für Web und Social Media, zeitlich und örtlich unbeschränkt,
einschließlich Bearbeitung (Schnitt, Pegel, Mischung). Wird der Film später
untertitelt oder gekürzt, muss das mit abgedeckt sein.

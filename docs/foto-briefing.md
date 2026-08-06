# Foto-Briefing für die Bühnen der Startseite

Für Fotograf:in oder Bildeinkauf. Die Startseite hat sechs „Bühnen". Jede fährt
beim Scrollen in **ein** Motiv hinein und blendet dann den Text ein:

```
Weitwinkel  ──Kamera fährt rein──►  Nahaufnahme  ──►  Textkarte erscheint
```

Pro Bereich werden deshalb **zwei Fotos derselben Situation** gebraucht, nicht zwei
verschiedene Motive: einmal weit, einmal nah — als hätte die Kamera ohne Schnitt
weitergefahren.

## Technische Vorgaben (gelten für alle Bilder)

| | |
|---|---|
| Format | quadratisch, 1:1 |
| Auflösung | 2400 × 2400 px (Minimum 1600 × 1600) |
| Dateityp | JPEG, Qualität ~85 |
| Farbraum | sRGB |

**Warum quadratisch und so groß:** Der Rahmen ist auf großen Displays rund
1600 px breit und wird beim Scrollen auf **2,7-fach** vergrößert. Das Bild wird
dabei effektiv auf über 4000 px hochgerechnet. Unter 1600 px Ausgangsmaterial
wird der Zoom sichtbar matschig.

## Die wichtigste Regel: Motiv in die Bildmitte

Beim vollen Zoom ist nur noch **rund das mittlere Drittel** des Bildes zu sehen.
Alles am Rand verschwindet.

```
┌─────────────────────────────┐
│   verschwindet beim Zoom    │
│      ┌───────────────┐      │
│      │               │      │
│      │  HIER sitzt   │      │  <- bei 2,7x ist nur noch
│      │  das Motiv    │      │     dieser Bereich sichtbar
│      │               │      │
│      └───────────────┘      │
│                             │
└─────────────────────────────┘
        Zoom-Zentrum liegt bei 50 % / 46 %
        (also minimal oberhalb der Bildmitte)
```

Für die **Nahaufnahme** heißt das: das Detail muss dieses mittlere Drittel
ausfüllen. Ein Motiv, das sauber ins volle Quadrat komponiert ist, wird im Zoom
zu einer leeren Fläche.

## Licht und Bildstimmung

Die Seite ist sehr dunkel (`#0B0713`, ein fast schwarzes Violett). Damit die
Fotos nicht wie aufgeklebt wirken:

- **Low-Key**, dunkler Hintergrund, Motiv durch Licht herausgearbeitet
- **Kantenlicht / Gegenlicht** statt flächiger Ausleuchtung
- Available Light am Abend passt besser als Tageslicht
- Die **rechte Bildhälfte ruhig halten** — dort liegt die Textkarte. Ein
  unruhiger oder heller Bereich dort kostet Lesbarkeit.
- Jeder Bereich hat eine Akzentfarbe, die idealerweise im Licht vorkommt:

| Bereich | Akzent | Lichtstimmung |
|---|---|---|
| Gastronomie | `#F0B454` Gold | warmes Kerzen-/Barlicht |
| Sicherheit | `#6EA8FF` Blau | kühles Nachtlicht, Scheinwerfer |
| Promotion | `#FF6EC7` Magenta | Bühnen-/Spotlicht |
| Logistik | `#FF9E5E` Amber | Arbeitslicht in der Halle |
| Fahrservice | `#6FE0FF` Cyan | Straßenlicht, nasser Asphalt |
| Reinigung | `#6FF0C4` Mint | klares Licht auf glänzender Fläche |

## Die zwölf Bilder

### 01 Gastronomie — „Servicekräfte mieten"
- **Weit** `gastro.jpg` — Tresen oder Bankett-Tisch im Abendlicht, Servicekraft
  im Anschnitt, Gläser und Lichtpunkte im Hintergrund unscharf.
- **Nah** `gastro-detail.jpg` — Hände beim Einschenken oder ein Glas beim
  Anstoßen, formatfüllend. Das ist der Moment, auf den zugefahren wird.

### 02 Sicherheit — „Veranstaltungsschutz"
- **Weit** `sicherheit.jpg` — Einlass bei Nacht, Absperrung, Personal im
  Gegenlicht, wartende Gäste als Silhouetten.
- **Nah** `sicherheit-detail.jpg` — Detail am Einlass: Bändchenkontrolle,
  Funkgerät oder Akkreditierung in der Hand.

### 03 Promotion & Hostess — „Der erste Eindruck zählt"
- **Weit** `promotion.jpg` — Messestand oder Empfang, Hostess im Spotlicht,
  Umgebung dunkel.
- **Nah** `promotion-detail.jpg` — Namensschild am Lanyard oder die
  Begrüßungsgeste, formatfüllend.

### 04 Logistik — „Eventlogistik"
- **Weit** `logistik.jpg` — Halle beim Aufbau, Flightcases, Traverse, Team in
  Bewegung.
- **Nah** `logistik-detail.jpg` — Hände an einer Traversenverbindung oder am
  Case-Verschluss.

### 05 Fahrservice — „Sicher ans Ziel"
- **Weit** `fahrservice.jpg` — Wagen bei Nacht, Fahrer greift zum Türgriff.
  Straßenlicht, Reflexe auf dem Lack.
- **Nah** `fahrservice-detail.jpg` — Blick in den Innenraum: Sitze, Ambientelicht,
  Armaturenbrett.

**Zur bewegten Tür:** Dass sich die Tür beim Scrollen *öffnet*, kann ein Standbild
nicht leisten. Dafür ist die Mechanik im Code bereits vorbereitet — ein kurzer
Clip wird vom Scroll durchgefahren, du steuerst die Türöffnung mit dem Scrollrad.
Details unter „Optional: Clip statt Standbild".

### 06 Reinigung — „Wenn wir da waren, ist es sauber"
- **Weit** `reinigung.jpg` — Halle oder Foyer nach der Reinigung, glänzender
  Boden, Spiegelungen, Personal im Anschnitt.
- **Nah** `reinigung-detail.jpg` — glänzende Fläche mit Reflexion, Wassertropfen,
  Tuch auf Glas.

## Ablage

Alle Dateien nach `assets/img/`. Die Namen oben sind bereits im Code verdrahtet —
Datei hineinlegen, fertig, keine Änderung nötig.

## Optional: Clip statt Standbild

Jede Bühne kann statt des Fotos einen kurzen Clip zeigen; die Mechanik dafür
steht im Code (Laden erst im Viewport, Pause außerhalb, auf Mobil und bei
`prefers-reduced-motion` nur das Standbild).

- 4–6 Sekunden, ohne Ton, `assets/video/<bereich>.mp4`
- gleiche Bildregeln wie oben (quadratisch, Motiv mittig)
- **Für den Fahrservice-Weitwinkel zusätzlich: dichte Keyframes** (`-g 5` beim
  Encoding). Dieser Clip wird vom Scroll durchgefahren statt abgespielt; mit
  normalem Keyframe-Abstand ruckelt das sichtbar.

Aktivierung pro Bereich: im `<video>`-Element der Bühne
`data-src="assets/video/<bereich>.mp4"` ergänzen. Sonst ändert sich nichts.

## Rechtliches

Bei Personen auf den Fotos werden Einverständniserklärungen gebraucht
(Recht am eigenen Bild). Bei Stock-Material die Lizenz für gewerbliche Nutzung
prüfen — und bedenken, dass Stock-Personal auf einer Personaldienstleister-Seite
schnell als „das ist euer Team" gelesen wird. Eigene Aufnahmen sind hier
inhaltlich wie rechtlich der sauberere Weg.

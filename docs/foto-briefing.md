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

## Die Porträts des Büroteams

Bestellt ist: **nicht alle Personen vor demselben Hintergrund.** Jede Person
bekommt eine eigene Bürosituation, alle sechs zusammen bleiben aber
erkennbar dieselbe Marke und dasselbe Haus.

Die vorhandenen vier Aufnahmen sind Studioporträts vor anthrazitfarbenem
Hintergrund. Aus ihnen lassen sich unterschiedliche Bürohintergründe nicht
herstellen: man müsste die Personen freistellen und in erfundene Räume
setzen. Das sind reale, mit Namen genannte Mitarbeiter, und ein erfundenes
Büro hinter ihnen ist eine Aussage über den Betrieb, die nicht stimmt.
Gebraucht werden deshalb **neue Aufnahmen**, und zwar diese:

### Was für alle sechs gilt

- Hochformat **4:5**, mindestens **2000 px** an der langen Kante, JPEG
- Offene Blende (f/2.0–f/2.8): der Raum ist als Stimmung da, nicht als Detail
- **Natürliches Fensterlicht als Hauptlicht**, von der Seite, kein Blitz
- Augenhöhe, halbe Figur bis knapp oberhalb der Hüfte
- Kopf im oberen Drittel, links oder rechts leicht aus der Mitte
- Kleidung wie im Alltag: Hemd oder Bluse, keine Anzüge, keine Uniform
- Keine Firmenlogos im Hintergrund, keine Bildschirme mit lesbarem Inhalt
- Keine Weitwinkelverzerrung: 50–85 mm (Kleinbild-Äquivalent)

### Die Ausstattung, die das Bild trägt

Aus diesen Elementen wird je Person eine andere Kombination gebaut —
dieselben Zutaten, andere Anordnung:

| | |
|---|---|
| Wand | hell, warmes Weiß bis Sandbeige, glatt oder fein verputzt |
| Pflanzen | echte Zimmerpflanzen: Monstera, Ficus, Olivenbaum, Gräser |
| Licht im Bild | eine warme Steh- oder Tischleuchte, sichtbar an |
| Möbel | Eiche oder Nussbaum, schwarze Metallgestelle, Leinenstoffe |
| Farben | Schwarz, Holzton, Beige. Kein Blau, kein Chrom, kein Grau in Grau |

### Die sechs Szenen

| Person | Szene |
|---|---|
| Maik Herm | am Fenster stehend, Stadtlicht von links, Olivenbaum rechts angeschnitten, warme Stehlampe im Hintergrund |
| Alexander Krapp | an der Kante eines Eichentischs sitzend, helle Wand, Monstera links hinter ihm |
| Shayan Wahedi | im Sessel, halb zur Kamera gedreht, Tischleuchte rechts im Bild, Regal mit Pflanzen als Tiefe |
| Mohamad Hamade | stehend vor heller Wand, schmaler Lichtstreifen vom Fenster, Gräser in einer Bodenvase rechts |
| Noah Benkhofer | am Stehtisch, Rücken zur Fensterseite, Gegenlicht auf den Schultern, Ficus links |
| Valeria Occhipinto | am Telefon sitzend, Pflanze im Vordergrund leicht unscharf angeschnitten, warme Lampe links |

**Die Klammer ist das Licht, nicht der Hintergrund.** Alle sechs mit
derselben Lichtrichtung, derselben Farbtemperatur (rund 4000 K) und
demselben Abstand aufnehmen. Dann tragen unterschiedliche Räume, ohne
auseinanderzufallen.

### Ablage

`assets/img/team/<vorname>-<nachname>.jpg` (Ordner neu anlegen), Dateinamen
wie bisher. Danach einmal `python3 tools/bilder-menue.py` für die
WebP-Fassungen. Im Markup wird bei der betreffenden Person der Block

```html
<div class="member__img member__img--leer"> … </div>
```

wieder ein `<div class="member__img"><picture>…</picture></div>` — so, wie
er bis September 2026 dastand.

**Stand September 2026: es liegt keine einzige Aufnahme vor.** Die
bisherigen Studioporträts sind auf Wunsch entfernt, alle sechs Kacheln
stehen auf „Foto folgt", ebenso die vier Köpfe im Ansprechpartner-Block auf
Startseite und `kontakt.html`. Die Dateien sind aus dem Repository
genommen; die Website liefert also keine Porträts mehr aus. Wer die alten
Aufnahmen braucht, holt sie aus der Geschichte:

```bash
git checkout 24fbcd0 -- assets/img/team/
```

Solange die Kacheln leer sind, steht der Bürobereich auf dem Seitengrund
(`--grund`). Sobald wieder Porträts darin stehen, gehört er zurück auf den
gemessenen Studioton `#2B3336` — eine Zeile in `styles.css`, die
Begründung steht dort im Kommentar.

## Rechtliches

Bei Personen auf den Fotos werden Einverständniserklärungen gebraucht
(Recht am eigenen Bild). Bei Stock-Material die Lizenz für gewerbliche Nutzung
prüfen — und bedenken, dass Stock-Personal auf einer Personaldienstleister-Seite
schnell als „das ist euer Team" gelesen wird. Eigene Aufnahmen sind hier
inhaltlich wie rechtlich der sauberere Weg.

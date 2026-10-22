# SA PLAÇA — Startseite mit Pasta-Film

Statische Seite, kein Build-Schritt. Vorschau: im Ordner `saplaca/`
`python3 -m http.server` starten und `http://localhost:8000` öffnen
(per `file://` lädt der Browser die Ankerdaten nicht).

## Aufbau

```
index.html                 Seite (Kopf, Hero, Einleitung, Film, Abschluss)
assets/img/                Hero-Bild (zurzeit PLATZHALTER aus dem Screenshot)
assets/fonts/              Source Serif 4, Inter (lokal, keine Google-Anfrage)
assets/film/wide|tall/     Film als Einzelbilder 0001–0240.webp (1280×720 / 720×1280)
assets/film/anchors-*.json Bildschirmposition jeder Zutat pro Frame (für die Beschriftung)
assets/film/pasta-*.mp4    derselbe Film als Video (z. B. für Social Media)
tools/render/              3D-Szene (three.js) und Skripte, mit denen der Film entsteht
```

## Wie der Film funktioniert

Die Szene ist in 3D gebaut (Spaghetti als Röhren mit Saucenfarbe und -glanz,
Saucentropfen, Gabel aus Metall, Tomate, halbe Tomate, Basilikum, Garnelen,
Muscheln; Schatten und Umgebungsverdeckung) und Bild für Bild gerendert.
Die Seite zeigt das passende Bild zur Scrollposition und blendet zwischen zwei
Nachbarbildern weich über — dadurch läuft der Film beim Scrollen flüssig
vorwärts und rückwärts. Hochformat (Handy, Tablet hoch) und Querformat haben
eigene Renderings mit eigener Bildaufteilung.

Szenen (Anteil am Scrollweg):

| Abschnitt | Inhalt |
|---|---|
| 0–0,18 | Nest auf der Gabel, dreht sich; Text „Pasta, hecha al momento.“ |
| 0,18–0,46 | Gabel zieht heraus, das Nest wickelt sich zur Spirale auf |
| 0,46–0,62 | Kamera fährt an der Spirale nach unten („Sin prisa.“) |
| 0,62–0,9 | Zutaten fliegen nacheinander ein, Beschriftungen zeichnen sich |
| 0,9–1 | Komposition setzt sich, Beschriftungen blenden aus, Seite läuft weiter |

## Film neu rendern

```bash
cd tools/render
npm i three@0.170.0 playwright
python3 -m http.server 8765 --bind 127.0.0.1 &
node run.js wide out/wide 240
node run.js tall out/tall 240
python3 build-frames.py out ../../assets/film
```

## Offen

- **Inhalte von saplaca.es**: Die Seite war aus der Arbeitsumgebung nicht
  erreichbar. Kopf, Hero, „Lunch · Cena · Drinks“ und die Einleitung sind nach
  dem Screenshot nachgebaut; der Schluss des Einleitungssatzes, die übrigen
  Abschnitte, die Links für Reservar/Cartas sowie die DE/EN-Fassung fehlen.
- **Hero-Bild**: `hero-platzhalter.*` ist aus dem Screenshot geschnitten
  (1290 px breit). Bitte die Originaldatei einsetzen.
- **Schriften**: Source Serif 4 und Inter sind eine Annäherung; sobald die
  Originalschriften bekannt sind, in `assets/fonts/` tauschen.

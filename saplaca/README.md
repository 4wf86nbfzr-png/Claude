# SA PLAÇA — Startseite mit Pasta-Film

Statische Seite, kein Build-Schritt. Vorschau: im Ordner `saplaca/`
`python3 -m http.server` starten und `http://localhost:8000` öffnen
(per `file://` lädt der Browser die Ankerdaten nicht).

## Aufbau

```
index.html                 Seite (Kopf, Hero, Einleitung, Film, Abschluss)
assets/img/                Hero-Bild (zurzeit PLATZHALTER aus dem Screenshot)
assets/fonts/              Source Serif 4, Inter (lokal, keine Google-Anfrage)
assets/film/wide|tall/     Film als Einzelbilder 0001–0280.webp mit Transparenz (1280×720 / 720×1280)
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
| 0–0,15 | Weinrot: Nest auf der Gabel, dreht sich; „Pasta, hecha al momento.“ |
| 0,12–0,3 | Cremefläche schiebt sich mit einer Welle hoch, Gabel zieht heraus, Nest wickelt sich zur Spirale auf |
| 0,38–0,5 | Kamera fährt an der Spirale nach unten („Sin prisa.“) |
| 0,5–0,8 | Zutaten fliegen nacheinander ein, Beschriftungen zeichnen sich („Lo que lleva.“) |
| 0,8–1 | Teller fährt ein, Pasta legt sich als Nest darauf, Zutaten dazu; „Os esperamos.“ + Reservierung |

## Film neu rendern

```bash
cd tools/render
npm i three@0.170.0 playwright
python3 -m http.server 8765 --bind 127.0.0.1 &
node run.js wide out/wide 280
node run.js tall out/tall 280
python3 build-frames.py out ../../assets/film
```

## Offen

- **Bilder**: Hero, Terrasse, Patatas, Pasta-Teller und Planta superior sind aus
  Screenshots von saplaca.es geschnitten (saplaca.es war aus der Arbeitsumgebung
  nicht erreichbar). Bitte die Originaldateien in `assets/img/` einsetzen
  (jeweils .jpg und .webp).
- **Fehlende Inhalte**: das Nahfoto unter „Horario“, die Links hinter
  „Abrir carta“ (Carta, Bebidas) und die DE/EN-Fassung.
- **Schriften**: Source Serif 4 und Inter sind eine Annäherung; sobald die
  Originalschriften bekannt sind, in `assets/fonts/` tauschen.
- **Zutaten im Film**: Garnelen, Muscheln, Tomate, Basilikum (nach der
  Referenz). Das Pasta-Foto auf der Seite zeigt ein anderes Gericht.

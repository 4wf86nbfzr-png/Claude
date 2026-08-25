# Bildmaterial

Die Produktdarstellung besteht aus **echtem Fotomaterial**. Es wird nicht
zur Laufzeit erzeugt, sondern einmalig aus Vorlagenfotos geschnitten und
als Datei ausgeliefert.

## Woher das Material kommt

Grundlage sind die beiden Vorlagenfotos unter `tools/source/`:

| Datei | Aufloesung | liefert |
| --- | --- | --- |
| `pizza.webp` | 3840 × 2160 | Kaese, Teig, Sosse, Salami, Oliven, Paprika, Pilze |
| `doener.jpg` | 643 × 360 | Doenerfleisch, Salat, Tomate, rote Zwiebel |

> **Vor dem Live-Gang klaeren:** Beide Fotos wurden fuer diese Umsetzung
> bereitgestellt. Die Nutzungsrechte muessen fuer den oeffentlichen Betrieb
> nachgewiesen sein (Fotograf, Stock-Lizenz oder eigene Aufnahme). Ohne
> geklaerte Rechte gehoert das Material ausgetauscht — die Pipeline unten
> macht das zu einer Sache von Minuten.

## Drei Arten von Bilddateien

### 1. Freisteller — `public/food/sprites/*.webp`

Einzelne Zutatenstuecke mit weich auslaufender Alphakante. Sie liegen im
Builder als Ebene auf dem Produkt und dienen gleichzeitig als runde
Auswahl-Chips in der Wischleiste.

```bash
python3 tools/build-sprites.py
```

Die Koordinaten stehen im Skript (`SPRITES`). Je Zutat sind mehrere
Varianten hinterlegt, damit nicht alle Stuecke identisch aussehen.

### 2. Flaechen — `public/food/fields/*.webp`

Grosse, vorgemischte Materialflaechen (Kaese, Teig, Fladenbrot, Sosse,
Fleisch). Sie fuellen im SVG die gezeichneten Formen.

```bash
python3 tools/build-fields.py
```

Wichtig: **keine kleinen Kacheln.** Ein wiederholtes Muster verraet sich im
Produkt sofort als Textur. Die Felder sind deshalb so gross, dass sie die
Form in einem Durchgang abdecken. Zwei Mischverfahren stehen zur Wahl:

- `blend` — viele gedrehte Ausschnitte uebereinander (unregelmaessiges
  Material wie Kaese oder Fleisch)
- `smooth` — ein Ausschnitt gross gezogen, weitere sanft daruebergeblendet
  (gleichmaessiges Material wie Teig oder Brot)

### 3. Marke — `public/icons/*`, `public/og.png`

```bash
node tools/icon-gen.mjs
```

## Wie eine Zutat an ihr Bild kommt

Alles laeuft ueber `src/data/assets.ts` und das Feld `visual` der Zutat:

```ts
ing("pz-oliven", "Oliven", 120,
  { z: 45, shape: "ring", palette: [...], sprites: [...SPRITES.olive] })

ing("pz-kaese", "Kaese", 0,
  { z: 20, shape: "sheet", palette: [...], texture: "kaese" })

ing("pz-sucuk", "Sucuk", 190,
  { z: 41, shape: "slice", palette: [...],
    sprites: [...SPRITES.salami], tint: TINT.sucuk })
```

- `sprites` — Foto-Freisteller, bevorzugt vor allem anderen
- `texture` — Fotoflaeche als Fuellung der gezeichneten Form
- `tint` — CSS-Filter, um verwandte Zutaten aus demselben Foto abzuleiten
  (Sucuk ist dunkler als Salami, Rotkohl violetter Salat)
- ohne beides bleibt die gezeichnete Form mit Farbverlauf — sichtbar noch
  bei Mais, Feta, Ei, Artischocken und den Sossen

Die Bewegung (Fallen, Streuen, Aufziehen) haengt nicht am Bildmaterial:
sie kommt aus `visual.shape` und laeuft mit Foto genauso wie ohne.

## Eigenes Material einsetzen

1. Fotos nach `tools/source/` legen.
2. Koordinaten in `tools/build-sprites.py` / `tools/build-fields.py`
   eintragen. Hilfsmittel:
   ```bash
   python3 tools/grid.py tools/source/foto.jpg /tmp/gitter.png 200   # Koordinatengitter
   python3 tools/sheet.py tools/source/foto.jpg /tmp/probe.png '[["test",100,100,300,200]]'
   ```
3. Beide Skripte laufen lassen, Ergebnis in `public/food/` pruefen.
4. Zutat in `src/data/ingredients.ts` auf `sprites`/`texture` umstellen.

## Ideal: eine eigene Aufnahmeserie

Das Beste, was der Darstellung passieren kann, sind Aufnahmen aus **einer**
Perspektive und **einem** Licht:

| Kategorie | Perspektive | Motive |
| --- | --- | --- |
| Pizza | senkrecht von oben | Kaesepizza ohne Belag; jede Zutat einzeln auf neutralem Grund |
| Doener | frontal, leicht ueber Augenhoehe | offenes Fladenbrot leer; Fleisch, Salat, Gemuese einzeln |
| Croque | seitlich, Schnittkante zur Kamera | Toastscheibe; Kaese, Schinken, Gemuese einzeln |

Anforderungen: transparenter Hintergrund oder freistellbar, Hauptlicht
oben links, kein eingebrannter Schlagschatten (den setzt der Builder
selbst), Ausgabe als AVIF **und** WebP.

## Bewegtbild

Drei Slots auf der Startseite sind vorbereitet (`src/data/media.ts`):
Kaese ueber die Pizza, Fleisch vom Spiess, Kaesefaden beim Croque.
Je 3–5 s, stumm, WebM + MP4, unter 1,5 MB, Standbild als AVIF. Solange
nichts eingetragen ist, zeigt der Slot die normale Produktdarstellung.

# Assets — was noch fehlt

Die Anwendung laeuft vollstaendig ohne Fotomaterial: Produkte werden
prozedural gezeichnet. Fuer den Live-Betrieb ist echtes Material trotzdem
der groesste Qualitaetssprung. Diese Liste sagt, was gebraucht wird.

## 1. Produktfotos als Ebenen (optional, empfohlen)

Pro Zutat ein freigestelltes Bild, aufgenommen aus **derselben Perspektive
wie die Zeichnung**:

| Kategorie | Perspektive | Bildgroesse |
| --- | --- | --- |
| Pizza | senkrecht von oben, mittig | 1024 × 1024 |
| Doener | frontal, leicht ueber Augenhoehe | 1024 × 900 |
| Croque | seitlich, Schnittkante zur Kamera | 1024 × 768 |

Anforderungen:

- transparenter Hintergrund (PNG mit Alpha), Ausgabe als **AVIF + WebP**
- gleiche Lichtrichtung fuer alle Ebenen: Hauptlicht oben links
- kein eingebrannter Schlagschatten (der Renderer setzt ihn selbst)
- Dateiname = Zutaten-ID, z. B. `salami.avif` fuer `pz-salami`

Einbinden in `src/data/ingredients.ts`:

```ts
visual: { z: 40, shape: "slice", palette: [...],
          sprite: { src: "/food/pizza/salami.avif", width: 1024, height: 1024 } }
```

`palette` bitte trotzdem gepflegt lassen — sie faerbt Flugbahn, Kacheln
und die Rueckfallebene.

## 2. Bewegtbild (optional)

Drei kurze, tonlose Schleifen fuer die Startseite:

| Slot | Inhalt | Laenge |
| --- | --- | --- |
| Pizza | Kaese wird ueber die Pizza gezogen | 3–5 s |
| Doener | Fleisch wird vom Spiess geschnitten | 3–5 s |
| Croque | Kaesefaden beim Auseinanderziehen | 3–5 s |

- Format: WebM (VP9) **und** MP4 (H.264) fuer aeltere Geraete
- Zielgroesse je Datei unter 1,5 MB, kurze Schleife statt langer Szene
- Standbild als AVIF im selben Ausschnitt (`poster`)
- Ablage unter `public/video/`, Eintrag in `src/data/media.ts`

Solange nichts eingetragen ist, zeigt der Slot die prozedurale
Darstellung — es entsteht kein Loch. Musik braucht eine Lizenz; die Slots
laufen bewusst stumm.

## 3. Marke

- Wortmarke und Logo: aktuell ist die Wortmarke reine Typografie (Anton).
  Ein gesetztes Logo kann in `components/layout/Header.tsx` und
  `Footer.tsx` eingesetzt werden.
- Icons/Startbildschirm: `public/icons/*` wurden aus `src/app/icon.svg`
  erzeugt (`icon-gen.mjs`). Nach einer Logo-Aenderung neu erzeugen.
- Vorschaubild fuer geteilte Links: `public/og.png` (1200 × 630).

## 4. Nicht noetig

Kein Icon-Set, keine Illustrationen, keine Stockfotos: Kategorie-Karten,
Menue und Tracking benutzen dieselbe Produktdarstellung wie der Builder.
Das haelt die Anwendung schlank und die Bildsprache einheitlich.

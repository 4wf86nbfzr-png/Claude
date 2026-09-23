# Was an der gelieferten Fassung geändert wurde

Grundlage ist `herm-website-redesign.zip`, unverändert. Hinzugekommen sind
genau zwei Dinge, beide nur auf der Startseite:

1. **Die gedeckte Tafel als Titelbild.**
2. **Der Imagefilm als Hintergrund, ab dem Intro.**

Alles andere ist Zeile für Zeile die gelieferte Fassung. Angefasst wurde
eine einzige bestehende Datei: `index.html`. Weder `styles.css` noch
`redesign.css`, weder `main.js`, `lenis.min.js` noch `motion.js` haben eine
geänderte Zeile.

---

## 1. Das Titelbild

Im Hero steht statt `hero-hostessen` jetzt `bankett` — die gedeckte Tafel.

```
assets/img/bankett.avif         1600 px
assets/img/bankett.webp         1600 px
assets/img/bankett.jpg          1600 px   Rückfallebene
assets/img/bankett-gross.avif   2560 px
assets/img/bankett-gross.webp   2560 px
```

Zwei Stufen, und `sizes` fängt mit einer Telefonbedingung an:

```html
sizes="(max-width:980px) 200vw, 100vw"
```

**Warum am Telefon 200vw steht.** `object-fit:cover` deckt über die
*längere relative* Kante. Am Schreibtisch ist das die Breite, am Telefon
steht das Fenster hochkant und ein 16:9-Foto wird über die **Höhe**
gedeckt. Mit `100vw` holte ein iPhone die 1600er Datei für eine
Darstellung, die 2532 Gerätepixel hoch ist — also eine anderthalbfache
Hochrechnung im ersten Bild, das jemand von der Seite sieht. Nachgemessen
greift der Browser mit dieser Zeile zur 2560er Stufe.

Das Bild trägt weiter die beiden Verläufe aus `redesign.css`; an der
Lesbarkeit der Überschrift ändert sich nichts.

## 2. Der Hintergrundfilm

Neu sind **zwei Dateien** und vier Videoschnitte:

```
assets/css/hintergrundfilm.css     liegt NACH redesign.css
assets/js/hintergrundfilm.js       läuft NACH motion.js
assets/video/hintergrund.mp4       1600 × 900, H.264
assets/video/hintergrund.webm      1600 × 900, VP9
assets/video/hintergrund-hoch.mp4   810 × 1440, H.264
assets/video/hintergrund-hoch.webm  810 × 1440, VP9
```

In `index.html` kommen dazu: der `<link>` auf das Stylesheet, der
`<script>` am Seitenende und die feste Lage

```html
<div class="filmgrund" aria-hidden="true"><video …></video></div>
```

### Was daran entschieden ist

**Der Film ist der Grund der Seite, keine Bühne darin.** Er liegt fest
hinter allem (`position:fixed; z-index:-1`) und läuft endlos, stumm,
ohne Bedienteile.

**`z-index:-1`, und nichts anderes.** Ein `position:fixed` mit `z-index:0`
malt nach den Hintergründen der Abschnitte — der Film läge dann über dem
Text. Bei −1 malt er nach dem Grund des `body` und vor jedem
Abschnittshintergrund. Genau dazwischen gehört er hin.

**„Etwas weiter unten" entsteht durch die Abschnitte, nicht durch den
Film.** Eine feste Lage kennt keine Abschnittsgrenzen. Hero und
Vertrauensband tragen deshalb ihren eigenen, deckenden Grund; ab dem
Intro liegt ein Schwarz mit 88 % Deckung darüber, durch das der Film
sichtbar wird. Am oberen Rand des Intros blendet ein Verlauf von deckend
nach durchsichtig — der Film taucht auf, statt an einer Linie anzufangen.

**Die 88 % sind gerechnet und dann im Bild nachgemessen.** Der hellste
Bildpunkt des Films kommt damit bei 31 von 255 an. Volle weiße Schrift
trägt darauf 15,7:1, die gedämpfte Stufe (`--muted`, 52 %) noch 6,0:1 —
beides deutlich über den nötigen 4,5. Weniger Deckung wäre ein schönerer
Film und eine knappere Typografie, mehr wäre ein Film, den niemand sieht.

**Zwei Zuschnitte, nicht zwei Größen.** In einem Fenster von 390 × 844 bei
dreifacher Dichte deckt `cover` über die Höhe: die Querfassung müsste
3,5-fach hochgerechnet werden, die Hochkantfassung nur 1,76-fach. Der
Hochkantschnitt nimmt 608 von 1600 Spalten aus der Bildmitte — ein
anderer Ausschnitt, nicht dieselbe Aufnahme kleiner.

**Die Quellen stehen nicht im Markup.** `<source media="…">` steht zwar in
der Norm, wird in einem `<video>` aber weder von Chromium noch von Safari
ausgewertet — nur das `<picture>` kennt es. Der Browser nähme schlicht die
erste abspielbare Quelle, und das Telefon bekäme die Querfassung. Die vier
Adressen hängen deshalb als `data-`Attribute am `<video>`, und
`hintergrundfilm.js` hängt die passende ein.

**H.264 steht vor VP9.** Sonst gilt „das modernste Format zuerst"; beim
Film ist es umgekehrt, weil er dauernd läuft: H.264 wird auf jedem Telefon
von eigener Hardware dekodiert. VP9 steht daneben für die
Chromium-Baureihen ohne H.264 — ohne diese Zeile sähen die eine schwarze
Fläche.

**Ohne Ton, und zwar wirklich.** Die vier Dateien haben keine Tonspur,
nicht nur ein `muted` am Element.

**Bei reduzierter Bewegung und im Datensparmodus** wird die ganze Lage
ausgebaut und nie eine Quelle eingehängt; die Abschnitte bekommen ihren
deckenden Grund zurück. Ohne JavaScript ist die Lage `display:none`.

**Lädt der Film langsam oder gar nicht**, steht dahinter der Seitengrund,
und er blendet darauf auf. Die Seite sieht dann aus wie vorher, statt eine
halbe Sekunde lang ein leeres Rechteck zu zeigen.

---

## Nachgemessen

| | |
|---|---|
| Kontrast über dem Film, Schreibtisch | 0 Textflächen unter der Grenze (9 Scrollstände, Film im Lauf abgetastet) |
| Kontrast über dem Film, Telefon | dieselben 5 Meldungen wie in der **unveränderten** gelieferten Fassung, Wert für Wert — es sind Messartefakte (freie Textknoten und das große Wortzeichen im Fuß), keine Folge des Films |
| waagerechter Überlauf | 0 bei 320, 390, 768, 1024, 1440 und 1920 px |
| ohne JavaScript | Lage ausgeblendet, Überschrift sichtbar, nichts verdeckt |
| reduzierte Bewegung | Lage ausgebaut, Abschnitte wieder deckend |
| Telefon | Hochkantschnitt und die 2560er Bildstufe werden geholt |

Gemessen wird der Kontrast über bewegtem Bild **im Bild**, nicht im DOM:
`rgba(0,0,0,.88)` ist kein deckender Vorfahr, eine DOM-Prüfung fände
davon nichts. Abgetastet wird im Lauf — der Testserver beantwortet keine
Range-Anfragen, jede Zuweisung an `currentTime` fiele still auf 0 zurück
und man fotografierte zwölfmal dasselbe Bild.

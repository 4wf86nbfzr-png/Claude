# Filmbrief: Produktfilm „Ruhrtalgold“ für die Lichtbühne

Für eine Produktionsfirma oder einen KI-Videogenerator. Ziel ist ein
Hauptfilm (30 bis 45 Sekunden, Startseite) und je Produkt ein kurzer
Loop (6 bis 12 Sekunden, Produktseite). Die Website ist vorbereitet: Die
Dateien werden unter den unten genannten Namen abgelegt, danach laufen
sie ohne Codeänderung in der Lichtbühne.

## Verbindliche Regeln

1. **Nur echte Verpackungen.** Vorlage sind die Fotos unter
   `assets/img/produkte/`. Kraftpapiertüten mit handschriftlichem
   „Ruhrtalgold“-Schriftzug, Kopfetikett „Unser Mehliges.. / Unsere
   Körner..“, Stempel „100 % aus der Region · seit 1987 · 100 % aus einer
   Hand“, grünes Bioland-Siegel. Senf im Bügelglas mit dunklem Etikett
   („Scharfer!Bernie“, „Kochkompl!ze“, grünes Etikett „Schärfeme!ster“).
   Rapsöl in der dunklen Vierkantflasche mit goldenem Verschluss.
   Nudeln im Klarsichtbeutel mit weißem Etikett „Ruhrtal Spiralen“ /
   „Ruhrtal Wellen“. Kartoffeln im Papierbeutel mit Tragegriff und
   Sichtlöchern.
2. **Keine erfundenen Beschriftungen.** Kein „Organic“, kein
   englisches Siegel, keine Farbkarte mit erdachtem Produktnamen. Eine
   Titelkarte darf nur „Ruhrtalgold“ und „Kornkammer Haus Holte · Witten“
   tragen. Das Bioland-Siegel ist echt und darf gezeigt werden, so wie es
   auf der Verpackung ist.
3. **Nur echte Rohstoffe.** Senfsaat, Rapsblüte, Weizen, Dinkel, Roggen,
   Hafer, Mohn, Kartoffeln. Kein Olivenöl, keine Oliven.
4. **Keine Behauptungen über Herstellung**, die nicht belegt sind (kein
   „handgefaltet“, kein „abgefüllt in Glas“ für Produkte, die es nicht
   sind). Falten, Schließen und Befüllen als Bild sind in Ordnung, solange
   die Verpackung dabei die echte bleibt.
5. Stumm liefern. Musik nur mit Lizenz, getrennt.

## Shotliste Hauptfilm (30 bis 45 s)

| Zeit | Bild | Hinweis |
|---|---|---|
| 0–3 s | Dunkel. Eine Titelkarte „Ruhrtalgold · Kornkammer Haus Holte“ auf Papierkarton, Streiflicht fährt darüber | ersetzt die „Farbkarte“ aus der Idee |
| 3–9 s | Dunkles Studio, warmes Seitenlicht. Erde, Weizenkörner, Senfsaat und gelbe Rapsblüten treiben in Zeitlupe durchs Licht | Makro, flache Schärfe |
| 9–18 s | Zusammenbau: Kraftpapiertüte faltet sich, Bügelglas schnappt zu, Öl steigt in der dunklen Flasche | Verpackung exakt nach Foto |
| 18–28 s | Extreme Makros: handschriftlicher Schriftzug, Stempel „seit 1987“, Bioland-Siegel, Mehl, Körner, Senfkörner | kein Text einblenden |
| 28–40 s | Hero: Mehltüten, Senfgläser, Rapsöl, Nudeln, Kartoffelbeutel auf dunklem Holz, Kamera fährt langsam zurück | Sammlung wie im Sortiment |
| 40–45 s | Ruhe, Licht bleibt auf dem Ensemble, Bild steht | Schlussbild für die Startseite |

## Loops je Produkt (6 bis 12 s, nahtlos)

Produkt frontal auf dunkler, leicht reflektierender Fläche, langsame
Drehung oder Lichtfahrt, am Anfang und Ende dieselbe Position. Ein Loop
je Datei:

```
assets/video/produkte/dinkelmehl-630.mp4        (und .webm)
assets/video/produkte/roggenmehl-1150.mp4
assets/video/produkte/weizenmehl-550.mp4
assets/video/produkte/dinkelmehl-vollkorn.mp4
assets/video/produkte/roggenmehl-vollkorn.mp4
assets/video/produkte/weizenmehl-vollkorn.mp4
assets/video/produkte/weizenkoerner.mp4
assets/video/produkte/roggenkoerner.mp4
assets/video/produkte/dinkelnudeln-hell.mp4
assets/video/produkte/dinkelnudeln-dunkel.mp4
assets/video/produkte/rapsoel.mp4
assets/video/produkte/senf-der-scharfe-bernie.mp4
assets/video/produkte/senf-kochkomplize.mp4
assets/video/produkte/senf-schaerfemeister.mp4
assets/video/produkte/kartoffeln-nicola.mp4
assets/video/produkte/kartoffeln-laura.mp4
assets/video/produkte/kartoffeln-karelia.mp4
```

Einbinden: im Produkt in `data/produkte.json` das Feld
`"praesentation": { "video": "assets/video/produkte/<id>.mp4" }` setzen,
dann `node tools/build-produkte.mjs`. Hauptfilm: `assets/video/hof.mp4`
(wird vom Hero der Startseite automatisch geladen).

## Technische Lieferung

- Hochformat 4:5 für die Loops (z. B. 1600×2000), Querformat 16:9 für den
  Hauptfilm (3840×2160 und 1920×1080).
- H.264 MP4 (High, CRF 20 bis 23) und zusätzlich WebM (VP9 oder AV1),
  jeweils ohne Tonspur, Loops unter 4 MB, Hauptfilm unter 12 MB.
- Zusätzlich ein Standbild je Clip als JPG (Poster).
- Das Produkt im Loop frei vor transparentem oder tiefschwarzem Grund,
  damit die Lichtbühne den Boden und die Spiegelung ergänzen kann.

## Prompt für einen Videogenerator (englisch, auf die echten Produkte angepasst)

> Cinematic product film, 4K, photorealistic macro cinematography in the
> style of luxury commercials. Dark atmospheric studio, warm moody side
> light, shallow depth of field. Opening on a small kraft-paper title card
> reading exactly “Ruhrtalgold · Kornkammer Haus Holte”, a soft light
> sweep crossing it. Then slow-motion particles drifting through the
> light: dark soil, golden wheat and spelt grains, tiny yellow-brown
> mustard seeds, yellow rapeseed blossoms. Assembly sequence using ONLY
> these real packages, reproduced faithfully from the reference photos:
> a brown kraft paper flour bag with a hand-lettered “RUHRTALGOLD” logo,
> a white paper window, a round stamp “seit 1987” and a small green
> Bioland seal; a glass wire-clamp jar with a dark label “SCHARFER!BERNIE
> · Ruhrtalgold · Bio Senf”; a dark square glass bottle with a gold screw
> cap and a label reading “RAPSÖL Ruhrtalgold”; a clear bag of spiral
> spelt pasta with a white “Ruhrtal Spiralen” label; a kraft paper potato
> bag with a paper handle and round see-through holes. The paper bag
> folds closed, the jar clamp snaps shut, golden oil rises inside the
> bottle. Extreme macro close-ups of the hand-lettered logo, the stamp,
> the Bioland seal, flour, grains and mustard seeds. Final hero shot: the
> whole collection arranged on dark rustic wood, camera slowly pulling
> back, light settling. No invented labels, no additional text, no
> English words on packaging, no olives or olive oil, no people. Silent.

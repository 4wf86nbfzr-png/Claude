# Medienliste — Team Kornkammer

Jede Zeile ist ein Bildplatz. Datei unter dem genannten Pfad ablegen
(JPG, sRGB, Qualität 80, lange Kante wie angegeben), fertig. Zusätzlich
eine WebP-Fassung gleichen Namens zu erzeugen ist sinnvoll, aber nicht
nötig. Bildausschnitt steuert `object-position` im Markup (`--pos`).

Alle Pfade relativ zu `kornkammer/assets/`.

## Film

| Pfad | Format | Motiv |
|---|---|---|
| video/hof.mp4 | H.264, 1920×1080, 10–20 s, stumm, Schleife, unter 6 MB | Hero: Felder, Hof, Arbeit; lädt nur, wenn Bewegung erlaubt und Datei vorhanden |
| img/hero.jpg | 2400 px, 16:9 | Poster und Ersatz für den Film |

## Startseite

| Pfad | Seitenverhältnis | Motiv |
|---|---|---|
| img/hof-gebaeude.jpg | 4:3 | Gebäude Haus Holte |
| img/feld-rotklee.jpg | 4:5 | Rotklee auf dem Feld |
| img/feld-getreide.jpg | 1:1 | Getreidefeld vor der Ernte |
| img/traktor.jpg | 16:9 | Traktor bei der Bodenbearbeitung |
| img/team/dirk-liedmann.jpg | 4:5 | Porträt Dirk Liedmann (auch team.html) |
| img/team/bernhard-pawliczek.jpg | 4:5 | Porträt Bernhard Pawliczek (auch team.html) |
| img/arbeit/anbau.jpg | 4:5 | Aussaat |
| img/arbeit/getreide.jpg | 4:5 | Mehl aus der Mühle |
| img/arbeit/oelmanufaktur.jpg | 4:5 | Ölpresse |
| img/arbeit/senfmanufaktur.jpg | 4:5 | Senfmühle |
| img/arbeit/kartoffeln.jpg | 4:5 | Kartoffelernte |
| img/arbeit/verkauf.jpg | 4:5 | Hofverkauf |
| img/story/boden.jpg | 7:8 (hochformatig, wird beschnitten) | Boden mit Rotklee |
| img/story/saat.jpg | 7:8 | Aussaat im Frühjahr |
| img/story/ernte.jpg | 7:8 | Mähdrescher |
| img/story/verarbeitung.jpg | 7:8 | Mühle, Ölpresse oder Senfmühle |
| img/story/regal.jpg | 7:8 | Regal im Hofverkauf (auch arbeit.html) |
| img/anbau/senf.jpg, hafer.jpg, rotklee.jpg, weizen.jpg, dinkel.jpg, kartoffeln.jpg, mohn.jpg | 4:5 | je eine Kultur im Feld |
| img/acker-mengede.jpg | 4:3 | Kartoffelacker Im Siesack |
| img/klima.jpg | 4:3 | Feld, gern mit Messtechnik |
| img/brot.jpg | 4:3 | Brot aus Kornkammer-Mehl (auch arbeit.html) |
| img/hofeinfahrt.jpg | 16:10 | Hofeinfahrt (auch kontakt.html) |
| img/hofverkauf.jpg | 4:3 | Verkaufsraum (shop/) |

## Der Hof

| Pfad | Seitenverhältnis | Motiv |
|---|---|---|
| img/hof-panorama.jpg | 21:9 | Hofansicht breit |
| img/hof/feld-1.jpg | 4:3 | Feld mit Fruchtfolge |
| img/hof/hacke.jpg | 4:5 | Mechanische Unkrautregulierung |
| img/hof/boden.jpg | 1:1 | Boden in der Hand |
| img/hof/rotklee.jpg | 16:9 | Rotklee in Blüte |
| img/hof/klima.jpg | 4:5 | Feldmessung |
| img/team/team.jpg | 21:9 | Gruppenbild (auch team.html) |

## Team

| Pfad | Seitenverhältnis | Motiv |
|---|---|---|
| img/team/stefan-pawliczek.jpg | 4:5 | Porträt |
| img/team/sebastian-krol.jpg | 4:5 | Porträt, gern an der Ölpresse |
| img/team/max.jpg | 4:5 | Porträt, gern auf dem Feld |
| img/arbeit/feldarbeit.jpg | 16:10 | Arbeit auf dem Feld |

## Unsere Arbeit

| Pfad | Seitenverhältnis | Motiv |
|---|---|---|
| img/arbeit/anbau-gross.jpg | 4:3 | Traktor auf dem Acker |
| img/arbeit/muehle.jpg | 4:3 | Getreide in der Mühle |
| img/arbeit/mehl.jpg | 4:5 | Mehl |
| img/arbeit/flocken.jpg | 1:1 | Haferflocken |
| img/arbeit/oelpresse.jpg | 4:5 | Ölpresse |
| img/arbeit/senfmuehle.jpg | 4:3 | Senfmühle |
| img/arbeit/kartoffelernte.jpg | 4:3 | Kartoffelernte |
| img/acker-luft.jpg | 21:9 | Flächen aus der Luft |

## Shop

Je Produkt zwei Bilder, 4:5, 1200 px lange Kante, neutraler heller
Hintergrund (vgl. Referenz „Aura“): Produkt frei, dann Detail oder
Verwendung. Pfade stehen in `data/produkte.json` unter `bilder`.

**Bereits vorhanden (Übergang):** Für die mit ✓ markierten Produkte liegt
ein Foto aus Screenshots des Onlineshops (etwa 670×840 px, hochskaliert
unscharf). Bitte durch die Originaldateien des Fotografen unter demselben
Namen ersetzen.

```
img/produkte/senf-bernie.jpg            senf-bernie-detail.jpg
img/produkte/senf-kochkomplize.jpg      senf-kochkomplize-detail.jpg
img/produkte/senf-schaerfemeister.jpg   senf-schaerfemeister-detail.jpg
img/produkte/rapsoel.jpg ✓              rapsoel-detail.jpg
img/produkte/leinoel.jpg                leinoel-detail.jpg
img/produkte/mohnoel.jpg                mohnoel-detail.jpg
img/produkte/senfoel.jpg                senfoel-detail.jpg
img/produkte/dinkelnudeln-hell.jpg ✓    dinkelnudeln-hell-detail.jpg
img/produkte/dinkelnudeln-dunkel.jpg ✓  dinkelnudeln-dunkel-detail.jpg
img/produkte/dinkelmehl-630.jpg ✓       mehl-detail.jpg (gemeinsam für alle Mehle)
img/produkte/dinkelmehl-vollkorn.jpg ✓
img/produkte/roggenmehl-1150.jpg ✓
img/produkte/roggenmehl-vollkorn.jpg ✓
img/produkte/weizenmehl-550.jpg ✓
img/produkte/weizenmehl-vollkorn.jpg ✓
img/produkte/weizenkoerner.jpg ✓        koerner-detail.jpg (gemeinsam für Körner)
img/produkte/roggenkoerner.jpg ✓
img/produkte/dinkelkoerner.jpg
img/produkte/haferkerne.jpg
img/produkte/haferflocken.jpg           haferflocken-detail.jpg
img/produkte/kartoffeln-nicola.jpg      kartoffeln-detail.jpg (gemeinsam)
img/produkte/kartoffeln-glorietta.jpg
img/produkte/kartoffeln-belana.jpg
```

Kategoriebilder (Reserve, derzeit nicht eingebunden): `img/produkte/*-welt.jpg`.

## Logo

Liegt nicht vor. Kopf- und Fußzeile tragen eine Wortmarke in Fraunces,
`assets/logo/favicon.svg` ist ein vorläufiges Zeichen. Bitte Logo als SVG
liefern; einzusetzen in `.brand` (alle Seiten und `tools/build-produkte.mjs`).

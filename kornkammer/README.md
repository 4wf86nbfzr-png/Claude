# Team Kornkammer — Website 2026

Neuer Webauftritt für die **Kornkammer Haus Holte oHG** (Team Kornkammer),
Bioland-Hof in Witten. Reines HTML/CSS/JS, kein Framework, kein Build-Step
beim Hosting. Dieser Ordner ist ein eigenständiges Projekt und kann als
Ganzes auf Netlify, Vercel oder jeden Webspace gelegt werden; alle Pfade
sind relativ.

Stand: 18. Oktober 2026. **Testbetrieb**, gegen Suchmaschinen gesperrt.

## Was fertig ist

| Bereich | Umsetzung |
|---|---|
| Startseite `index.html` | Hero mit Film-Slot, Faktenleiste, Hof-Einführung mit Bildmosaik, zwei Porträts, sechs Arbeitsbereiche, Scroll-Geschichte in fünf Kapiteln (haftendes Bild, Kapitel schalten), horizontale Strecke „Anbau 2025/2026“ (vertikales Scrollen steuert horizontal), Sortiment-Auswahl mit Sofort-in-den-Korb, Rückverfolgung, Klimaprojekt, Handelspartner, Schluss-Aufruf |
| `hof.html` | Bioland seit 1987, Fruchtfolge als Prozess, belegte Chronik (1987, 2010, 2025, 2026), Klimaprojekt, Flächen |
| `team.html` | Redaktionelles Layout, fünf Personen mit belegten Angaben, keine erfundenen Zitate |
| `arbeit.html` | Ackerbau, Getreide, Ölmanufaktur, Senfmanufaktur, Kartoffeln, Verkauf, Rückverfolgung, mit Sprungleiste |
| `shop/index.html` | Sortiment in sechs Kategorien, lebendiges Raster (breite, hohe, normale Karten), Preisstand-Hinweis |
| `shop/produkte/*.html` | 23 Produktseiten: Galerie mit Wischen, Pfeilen, Vorschaubildern, Vollbild; Gebinde-Wahl; Menge; Herkunft; „Dazu passt“; Product-JSON-LD |
| `shop/warenkorb.html` | Korb mit Mengen, Entfernen, Zwischensumme; Bestellanfrage per Formular |
| `kontakt.html` | Hofverkauf, Adresse, Telefon, Fax, Mail, Karte als externer Link, Anfrageformular |
| `impressum.html`, `datenschutz.html` | Entwürfe aus Bestand und Register, offene Stellen gelb markiert |
| `404.html`, `danke.html`, `shop/danke.html` | Fehler- und Dankeseiten |
| `netlify.toml`, `robots.txt`, `sitemap.xml` | Hosting, Testbetrieb-Sperre, saubere Adressen, 301-Weiterleitungen von den alten `.htm`-Adressen |

## Projektstruktur

```
index.html, hof.html, team.html, arbeit.html, kontakt.html
impressum.html, datenschutz.html, danke.html, 404.html
shop/index.html            Sortiment            (ERZEUGT, nicht von Hand ändern)
shop/produkte/<id>.html    Produktseiten        (ERZEUGT)
shop/warenkorb.html        Korb + Bestellanfrage
data/produkte.json         EINZIGE Produktquelle (Namen, Texte, Gebinde, Preise, Bildpfade)
tools/build-produkte.mjs   erzeugt shop/index.html und shop/produkte/*  →  node tools/build-produkte.mjs
assets/css/styles.css      einzige Design-Stylesheet-Datei, Tokens oben
assets/css/fonts.css       @font-face (Fraunces, Instrument Sans), lokal
assets/fonts/              woff2
assets/js/main.js          Kopfzeile, Menü, Einblendungen, Parallax, Scroll-Geschichte, horizontale Strecke, Hero-Video, Formulare
assets/js/shop.js          Warenkorb, Schublade, Galerie, Varianten, Bestellanfrage
assets/img/                Fotos (noch leer, siehe MEDIEN.md)
assets/video/              Hero-Film (noch leer)
assets/logo/favicon.svg    vorläufiges Zeichen
```

## Bestandsabgleich

Die bisherige Website (team-kornkammer.de, Spiegel: ruhrtalgold.de,
ruhrtalgarten.de) war aus der Arbeitsumgebung **nicht direkt abrufbar**
(Netzwerkrichtlinie). Grundlage ist das Dossier unter
`../recherche/team-kornkammer/README.md`, erhoben aus Suchmaschinen-Indizes
und Drittquellen. Daraus übernommen:

| Alte Seite | Inhalt | Neu zu finden in |
|---|---|---|
| index.htm | Anbau 2025/26, Hofverkauf, Kontaktblock | Startseite, Kopf/Fuß aller Seiten |
| der hof.htm | Bioland seit 1987, Arbeitsweise, Standard über EU-Bio | hof.html, Startseite |
| das team.htm | Liedmann, B. Pawliczek, S. Pawliczek, Krol, Max | team.html, Startseite |
| unsere produkte.htm | Rubriken Öle, Kartoffeln, Getreide, Nudeln, Senf | shop/ |
| oelmanufaktur.htm | Leinöl, Mohnöl, Rapsöl, Verfahren | arbeit.html#oel, Produktseiten |
| senfmanufaktur.htm | drei Sorten, Granitsteine, Namensgeber | arbeit.html#senf, Produktseiten |
| getreideprodukte.htm | Typen, Gebinde, Flocken, Körner, Bäckerqualität | arbeit.html#getreide, Produktseiten |
| kartoffeln.htm | Holter Knolle, Ruhrtalgold, Kochtypen, Sorten | arbeit.html#kartoffeln, Produktseiten |
| besonderes.htm | Rückverfolgung je Fläche | arbeit.html#transparenz, Startseite |
| klimaprojekte.htm | Netzwerk Pilotbetriebe | hof.html#klima, Startseite |
| bio verstehen.htm | **Inhalt unbekannt** | Weiterleitung auf hof.html |
| Galerie | 27 Feldfotos (Kartoffeln vom Legen bis zur Ernte) und drei Fotos aus dem Hofverkauf, per Screenshot | galerie.html, Laufband auf der Startseite, Bildplätze auf allen Seiten |
| Qualität | **Inhalt unbekannt** (Menüpunkt der alten Seite) | Weiterleitung auf hof.html, Text nachliefern |
| impressum.htm | oHG, GbR, Vertreter, USt-ID | impressum.html |
| Onlineshop | 23 Produkte, Preise, Versandregel | data/produkte.json, shop/ |

**Nicht übernommen, weil nicht vorhanden:** Fotos, Logo, Videos, Wortlaut
von „bio verstehen“, AGB/Widerruf/Zahlungsarten des Shops (verlinkt),
Datenschutztext der alten Seite.

## Shop: wie er funktioniert, was noch fehlt

Der bestehende Shop läuft auf Ecwid (`shopteamkornkammer.company.site`).
Zugangsdaten oder Store-ID liegen nicht vor. Deshalb:

- **Umgesetzt:** Katalog, Produktseiten, Varianten, Warenkorb (Local
  Storage), Schublade, Mengen, Zwischensumme, **Bestellanfrage** per
  Formular. Es wird kein Kauf simuliert; die Seite sagt überall, dass die
  Bestätigung per E-Mail kommt. Daneben führt ein Link in den bestehenden
  Shop für sofortige Zahlung.
- **Preise** (Stand 10/2026, inkl. 7 % MwSt.). Per Screenshot aus dem
  Onlineshop bestätigt, jeweils 1 kg bzw. Packung: Weizenkörner 2,29;
  Roggenkörner 2,19; Weizenmehl 550 2,69; Weizenmehl Vollkorn 2,79;
  Roggenmehl 1150 2,69; Roggenmehl Vollkorn 2,69; Dinkelmehl 630 4,79;
  Dinkelmehl Vollkorn 4,29; Dinkelnudeln hell/dunkel 500 g 3,79; Rapsöl 500 ml
  6,49; alle drei Senfsorten 200 g 5,99; Kartoffeln Nicola, Karelia, Laura
  2 kg 5,29. Aus dem Suchindex: Mohn-, Lein-, Senföl 100 ml 5,99 (im Shop
  derzeit nicht gelistet, als Hinweis vermerkt); Kartoffeln Glorietta und
  Belana 2 kg 5,29. Ohne Preis („auf Anfrage“): alle 5- und 25-kg-Gebinde,
  Haferflocken, Haferkerne, Dinkelkörner.
- **EAN-Nummern** aus dem Shop stehen in `data/produkte.json` (`ean`) und auf
  den Produktseiten; sie erleichtern später die Zuordnung zu Ecwid.
- **Produktfotos:** 17 Produkte zeigen bereits das echte Foto, ausgeschnitten
  aus Screenshots des Onlineshops (Mehle, Körner, Nudeln, Rapsöl, Senf,
  Kartoffeln Nicola, Karelia, Laura). Das sind
  Übergangsbilder in niedriger Auflösung; die Originaldateien ersetzen sie
  unter demselben Pfad (siehe MEDIEN.md).
- **Echter Checkout aktivieren:** Produkte in `data/produkte.json` um eine
  Ecwid-Produkt-ID ergänzen und den „In den Korb“-Knopf auf den Ecwid-Buy-
  Button umstellen, oder die Bestellanfrage als Bestellweg beibehalten.
  Beides ist eine Änderung in `tools/build-produkte.mjs` an einer Stelle.

## Lichtbühne: Produkte im Licht (Cinematic Product Experience)

Jede Produktseite mit Foto beginnt mit einer dunklen Lichtbühne, die
Startseite zeigt eine für das Dinkelmehl 630. Umgesetzt ist **Stufe 1 und
ein Teil von Stufe 2** des abgestuften Systems:

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Freigestelltes Produktfoto in dunkler, reflektierender Szene: Auftritt aus dem Schatten, Lichtfahrt, Partikel je Produktwelt, Spiegelung, scrollgesteuerter Kameraschwenk | **fertig**, 17 Produkte |
| 2 | Drehen per Maus, Touch und Pfeiltasten bis ±35 Grad; Produktkarten neigen sich zum Zeiger | **fertig**; eine echte 360-Grad-Drehung braucht Bildserien oder Modelle (fehlen) |
| 3 | 3D-Szenen mit Modellen (GLB), WebGL | nicht begonnen, keine Modelle vorhanden |
| 4 | Produktspezifische Werbefilme (fallende Kartoffeln, fließendes Öl) | nicht begonnen, erfordert 3D-Animation oder Dreh |

**Warum kein Three.js:** Es gibt nur je eine Frontansicht pro Produkt.
Ein Foto auf eine 3D-Fläche zu legen ergäbe eine erfundene Rückseite.
Die Bühne arbeitet deshalb mit CSS-3D und Canvas, läuft ohne WebGL und
ohne Abhängigkeit (`assets/js/buehne.js`, rund 200 Zeilen), pausiert
außerhalb des Sichtfelds, begrenzt die Pixeldichte auf Mobilgeräten und
steht bei `prefers-reduced-motion` still. Ohne JavaScript ist das Produkt
sichtbar, nichts bewegt sich.

**Konfiguration (der „Produkt-Editor“)** liegt in `data/produkte.json`:
`praesentation.vorgaben` je Kategorie, pro Produkt überschreibbar mit
`"praesentation": { … }`. Felder: `aktiv`, `partikel` (mehl, korn, gold,
erde, hell), `freigestellt`, und vorbereitet für spätere Stufen `serie`
(Bildserie), `modell` (GLB), `video`. Neues Produkt anlegen = Eintrag im
JSON, Foto ablegen, `python3 tools/freistellen.py`, `node
tools/build-produkte.mjs`. Kein Quellcode muss angefasst werden.

**Freistellen** (`tools/freistellen.py`, nur Pillow): Flutfüllung vom
Bildrand über hintergrundähnliche Pixel, Kante leicht geglättet, Ausgabe
als WebP mit Alphakanal unter `assets/img/produkte/frei/`. Doppelaufnahmen
werden vorher auf die linke Tüte beschnitten. Die Ergebnisse taugen für die
Bühne; die Kanten der Klarsichtbeutel (Nudeln) und die hellen Kopfetiketten
der Körnertüten bleiben verbesserungswürdig. Mit Originalfotos auf
neutralem Grund (oder sauber freigestellten PNGs vom Fotografen) wird es
besser, ohne dass am Code etwas zu ändern ist.

**Produktfilme (Stufe 4) sind vorbereitet:** Steht im Produkt
`praesentation.video` und liegt die Datei, zeigt die Bühne statt des
Standbilds ein stummes Video in Schleife (Poster = freigestelltes Foto),
das nur spielt, solange die Bühne sichtbar ist. Briefing für die
Produktion oder einen Generator mit Shotliste, Dateinamen und einem auf
die echten Verpackungen angepassten Prompt: `docs/filmbrief.md`.

**Noch nötige Assets für die vollständige Umsetzung**
- Produktfotos in Originalauflösung, idealerweise freigestellt (PNG/WebP
  mit Alpha), 2000 px lange Kante.
- Für 360 Grad: je Produkt 24 bis 36 Ansichten auf einem Drehteller
  (gleicher Abstand, gleiches Licht) als Bildserie, oder ein GLB-Modell mit
  den originalen Aufdrucken als Textur.
- Für Stufe 4: gerenderte oder gedrehte Clips (WebM/MP4, 1080p oder 4K),
  stumm, 6 bis 12 Sekunden.
- Fehlen weiterhin Fotos für: Leinöl, Mohnöl, Senföl, Dinkelkörner,
  Haferkerne, Haferflocken, Glorietta, Belana (diese acht Seiten haben
  keine Bühne, sondern den gewohnten Aufbau).

## Formulare

Drei Versandwege, gesteuert über Attribute am `<form>` (siehe `main.js`):
`data-endpunkt` (eigener POST-Endpunkt) > `data-netlify` (Netlify Forms, per
fetch, Rückmeldung in der Seite) > mailto (öffnet das E-Mail-Programm mit
vorbereitetem Text). Empfänger laut Bestand: `Team-Kornkammer@gmx.de`,
auf Netlify unter Forms → Notifications eintragen. Spam-Schutz: unsichtbares
Feld plus weiche Zeitprüfung (bei zu schnellem Absenden wird nachgefragt).

## Bewegung

- Einblendungen beim Scrollen (`.rv`, `.rv--mask`, `.rv-words`) mit
  IntersectionObserver plus Sicherheitsnetz für Ankersprünge.
- Parallax (`data-parallax`), Hero-Fahrt, Scroll-Geschichte mit haftendem
  Bild (`.story`), horizontale Strecke (`.hscroll`; unter 900 px natives
  Wischen mit Scroll-Snap).
- Laufbänder (`.marquee`): Fotostreifen und große Worte, nahtlose Schleife,
  Tempo über `data-speed` in Pixel je Sekunde, Pause beim Überfahren.
- Gestapelte Sticky-Karten (`.stack`) auf hof.html.
- Sanftes Scrollen mit dem Mausrad (`smoothWheel` in main.js): nur bei
  Maus/Trackpad, nie auf Touch, nie bei reduzierter Bewegung; der native
  Scroll bleibt erhalten, deshalb funktionieren Anker, Tastatur und sticky.
- `prefers-reduced-motion`: alles sofort sichtbar, nichts fährt, Laufbänder
  stehen still und sind wischbar, Karten stapeln nicht, kein Video.
- Ohne JavaScript bleibt nichts versteckt (`kein-js`).

## Medien

Vorhanden sind bisher nur Bilder aus Screenshots: 17 Produktfotos aus dem
Onlineshop, 27 Feldfotos aus der alten Galerie (etwa 250 px breit) und drei
Fotos aus dem Hofverkauf (etwa 800 px). Sie sitzen in den passenden
Plätzen und werden durch die Originale unter demselben Dateinamen ersetzt.
Große Flächen (Hero, Panoramen, Teamporträts, Verarbeitung) sind weiter
Platzhalter. Jeder Bildplatz
ist ein `<figure class="media">` mit `<img src>` auf den vorgesehenen Pfad.
Fehlt die Datei, zeigt der Rahmen eine klar als vorläufig erkennbare Fläche
mit der Beschriftung „Foto folgt · …“. Liegt die Datei am Pfad, erscheint
sie ohne weitere Änderung. Liste aller Plätze mit Motiv, Format und Seite:
**`MEDIEN.md`**. Bis die Bilder da sind, erzeugt jeder Seitenaufruf
404-Anfragen auf die Bildpfade; das ist beabsichtigt und verschwindet mit
den Dateien.

## Schnelltest ohne Server

`test-vorschau.html` ist die Startseite als eine einzige Datei mit
eingebetteten Schriften, Skripten und Bildern (rund 2,4 MB). Doppelklick
genügt. Links zu Unterseiten funktionieren, solange die Datei im Ordner
`kornkammer/` liegt. Neu erzeugen nach Änderungen:
`node tools/buendeln.mjs` (andere Seite: `node tools/buendeln.mjs
shop/produkte/rapsoel.html vorschau-rapsoel.html`).

## Lokale Vorschau und Deploy

```
cd kornkammer
node tools/build-produkte.mjs     # nach Änderungen an data/produkte.json
python3 -m http.server 8765       # dann http://127.0.0.1:8765/
```

Netlify: Repository verbinden, Base directory `kornkammer`, Publish `.`,
kein Build-Befehl. `netlify.toml` liegt bei (Header, saubere Adressen,
301-Weiterleitungen von den alten `.htm`-Adressen).

## Vor dem Live-Gang

1. Testbetrieb aufheben: `X-Robots-Tag` in `netlify.toml`, `robots.txt`,
   `<meta name="robots">` in allen Seiten und im Generator (`head()`).
2. Fotos und Film nach `MEDIEN.md` einspielen, `alt`-Texte prüfen.
3. Logo liefern und Wortmarke in Kopf- und Fußzeile ersetzen; Favicon.
4. Impressum: Verantwortlicher nach § 18 MStV, GbR-Block, Schlichtungs-
   aussage bestätigen. Datenschutz: Hoster, Formulardienst,
   Datenschutzbeauftragter. Beides anwaltlich prüfen.
5. Preise aller Produkte und die „auf Anfrage“-Gebinde mit dem Hof
   abgleichen; Verfügbarkeiten (Kochkompl!ze, Kartoffelsorten) prüfen.
6. Inhalt von „bio verstehen.htm“ beschaffen und auf hof.html einbauen.
7. Formular-Empfänger auf Netlify eintragen und einen Testversand machen.
8. Öffnungszeiten endgültig festlegen (die Quellen nennen 8–17, 8–17:30 und
   8–18 Uhr; die Seite verwendet 8–17 Uhr von der bisherigen Startseite).
9. Canonical-Domain prüfen (`www.team-kornkammer.de` ist eingetragen) und die
   Spiegel-Domains ruhrtalgold.de / ruhrtalgarten.de per 301 darauf leiten.

## Durchgeführte Tests

Mit Playwright/Chromium gegen einen lokalen Server:

- Elf Seiten in vier Breiten (375, 820, 1440, 2200 px): kein horizontaler
  Überlauf, keine JavaScript-Fehler in der Konsole (die 404 der noch
  fehlenden Bilder ausgenommen).
- Alle 31 internen Links erreichbar.
- Interaktion: Gebinde ohne Preis schaltet auf „Preis anfragen“; Menge 2
  plus „In den Korb“ ergibt Zähler 2; Schublade öffnet und schließt; Galerie
  blättert; Vollbild öffnet; Warenkorbseite zeigt die Zeile und befüllt den
  Bestelltext; mobiles Menü öffnet; Tastaturfokus erreicht die Navigation.
- Sichtprüfung der Screenshots; danach behoben: Einblendung bei
  Ankersprüngen, Überlappung der Foto-Beschriftung mit dem Vollbild-Knopf,
  Standardrahmen des Gebinde-Felds, Kapitelbild über dem Text auf dem Handy,
  abgeschnittener Kopf der horizontalen Strecke auf dem Desktop.

- Lichtbühne: je ein Produkt aus Mehl, Öl, Kartoffeln und Senf in 1440 und
  390 px Breite ohne Skriptfehler; Ziehen dreht das Produkt (36 Grad bei
  140 px Zug), Pfeiltasten drehen, Partikel pausieren außerhalb des
  Sichtfelds; Warenkorb, Varianten, Menge und Galerie darunter unverändert.

**Nicht gemessen:** Core Web Vitals (LCP, INP, CLS). Ohne echte Bilder und
Video wäre eine Messung nicht aussagekräftig; nach dem Einspielen mit
Lighthouse prüfen. Die Seite lädt keine fremden Ressourcen, Schriften sind
vorgeladen, Bilder außerhalb des ersten Bildschirms lazy.
